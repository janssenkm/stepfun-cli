#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, normalizeRegion, regionChoices, REGION_PROFILES, saveConfig } from './config';
import type { Region } from './config';
import { detectAndCacheRegion } from './config/detect-region';
import { StepFunClient } from './api';
import { CLI_VERSION } from './version';
import fs from 'fs';
import { runUpdate } from './update';
import { registerCoreCommands } from './commands/core';
import { registerCapabilityCommands } from './commands/capabilities';
import { endpointUrl } from './client/endpoints';
import { emitError, UnsupportedError, UsageError } from './cli/errors';
import { installProcessHandlers } from './cli/process';
import { FileService } from './files/service';
import { registerFileCommands } from './commands/files';
import { registerUnsupportedCommands } from './commands/unsupported';
import { configureHelp } from './cli/help';
import { positiveNumber } from './cli/validation';
import { writeJson, writeProgress, writeText } from './cli/output';

installProcessHandlers();

const program = new Command();
let config = loadConfig();

const SUPPORTED_MODELS = {
  text: ['step-3.5-flash', 'step-3.5-flash-2603', 'step-3.7-flash'],
  speech: ['stepaudio-2.5-tts', 'stepaudio-2.5-asr'],
  image: ['step-image-edit-2']
};

/** Returns a diagnostic-safe representation without exposing credentials. */
function maskApiKey(apiKey?: string): string | undefined {
  if (!apiKey) return undefined;
  // Short keys cannot safely reveal both a prefix and suffix.
  if (apiKey.length <= 8) return '********';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function validRegions(): string {
  return regionChoices();
}

function validateRegion(region: string): Region {
  const normalized = normalizeRegion(region);
  if (!normalized) {
    throw new UsageError(
      `Unknown region: ${region}. Valid options: ${validRegions()}`,
      `Choose one of: ${validRegions()}.`
    );
  }
  return normalized;
}

/**
 * StepPlan regions are documented only for chat/reasoning endpoints. Warn when
 * a non-chat command targets them — the call still goes through, but may 404.
 */
function warnIfUnsupportedNonChat(region: Region, quiet: boolean, commandName: string): void {
  if (quiet) return;
  const profile = REGION_PROFILES[region];
  if (!profile || profile.supportsNonChat) return;
  writeProgress(
    `Note: ${commandName} under ${region} targets an endpoint not covered by official docs ` +
    `(StepPlan is documented for chat/reasoning only). It may fail.`
  );
}

program
  .name('stepfun')
  .description('StepFun Command Line Interface')
  .version(CLI_VERSION)
  .option('--api-key <key>', 'API key (overrides all other auth)')
  .option('--region <region>', 'API region: StepPlan-Global (Global) or StepPlan-CN (CN)')
  .option('--base-url <url>', 'API base URL (overrides region)')
  .option('--output <format>', 'Output format: text, json')
  .option('--timeout <seconds>', 'HTTP request timeout in seconds (default 300)')
  .option('--quiet', 'Suppress non-essential output')
  .option('--verbose', 'Print HTTP request/response details')
  .option('--dry-run', 'Print the request that would be sent and exit without calling the API')
  .option('--non-interactive', 'Never prompt; fail instead of asking interactively')
  .option('--no-color', 'Disable ANSI colors and spinners');

program.command('update')
  .description('Show how to update to the latest NPM release')
  .action(() => {
    const exitCode = runUpdate({
      currentVersion: CLI_VERSION
    });
    if (exitCode !== 0) process.exitCode = exitCode;
  });

/**
 * Global option resolution, uniformly applied as: flag > env > config > default.
 * These helpers are shared by getClient() and `auth status` so the credential
 * and endpoint reported by status match what an API command would actually use.
 */
function resolveApiKey(options: any): string | undefined {
  return options.apiKey || process.env.STEPFUN_API_KEY || config.apiKey;
}

function resolveRegion(options: any): Region {
  return validateRegion(options.region || process.env.STEPFUN_REGION || config.region || 'Global');
}

function resolveBaseUrl(options: any, region: Region): string {
  return options.baseUrl || process.env.STEPFUN_BASE_URL || config.baseUrl || REGION_PROFILES[region].baseUrl;
}

function resolveOutput(options: any): string {
  const output = options.output || process.env.STEPFUN_OUTPUT || config.output || (process.stdout.isTTY ? 'text' : 'json');
  if (output !== 'text' && output !== 'json') {
    throw new UsageError(`Unknown output: ${output}. Valid options: text, json`, 'Output must be `text` or `json`.');
  }
  return output;
}

function resolveTimeoutSeconds(options: any): number {
  const value = options.timeout ?? process.env.STEPFUN_TIMEOUT ?? config.timeout ?? 300;
  return positiveNumber(value, '--timeout', UsageError);
}

async function ensureRegion(options: any): Promise<void> {
  if (options.region || process.env.STEPFUN_REGION || config.region) return;
  if (options.baseUrl || process.env.STEPFUN_BASE_URL || config.baseUrl) return;
  const apiKey = resolveApiKey(options);
  if (!apiKey) return;
  const quiet = Boolean(options.quiet) || resolveOutput(options) === 'json';
  writeProgress('Detecting API region...', quiet);
  const region = await detectAndCacheRegion(apiKey, detected => saveConfig({ region: detected }), {
    timeoutMs: Math.min(resolveTimeoutSeconds(options) * 1000, 5000)
  });
  config = { ...config, region };
  writeProgress(`Region: ${region}`, quiet);
}

/** Model precedence for text chat: flag > config default_text_model > built-in default. */
function resolveTextModel(options: any): string {
  return options.model || config.defaultTextModel || 'step-3.5-flash';
}

/** Model precedence for speech synthesize: flag > config default_speech_model > built-in default. */
function resolveSpeechTtsModel(options: any): string {
  return options.model || config.defaultSpeechModel || 'stepaudio-2.5-tts';
}

function getClient(options: any): StepFunClient {
  // Precedence is flag > env > config > default. The environment now wins over
  // a persisted config file.
  const apiKey = resolveApiKey(options);
  if (!apiKey) {
    throw new Error('API key is required. Run `stepfun auth login` or use --api-key');
  }
  const region = resolveRegion(options);
  const baseUrl = resolveBaseUrl(options, region);
  const timeoutSeconds = resolveTimeoutSeconds(options);
  return new StepFunClient(apiKey, baseUrl, timeoutSeconds, Boolean(options.verbose));
}

function getFileService(options: any): FileService {
  const apiKey = resolveApiKey(options);
  if (!apiKey) throw new Error('API key is required. Run `stepfun auth login` or use --api-key');
  const region = resolveRegion(options);
  return new FileService(apiKey, resolveBaseUrl(options, region), resolveTimeoutSeconds(options), Boolean(options.verbose));
}

/**
 * Prints a summary of the request that would be sent and returns true when
 * --dry-run is set. Never invokes the API and never logs credentials. Image
 * and audio binaries are described by path and byte size only.
 */
function dryRun(options: any, command: string, method: string, endpointPath: string, detail: Record<string, unknown>): void {
  const region = resolveRegion(options);
  const baseUrl = resolveBaseUrl(options, region);
  const summary: Record<string, unknown> = {
    command,
    method,
    url: endpointUrl(baseUrl, endpointPath),
    ...detail
  };
  if (resolveOutput(options) === 'json') {
    writeJson(summary);
  } else {
    const lines = [`[dry-run] ${summary.method} ${summary.url}`, `  command: ${summary.command}`];
    for (const [key, value] of Object.entries(summary)) {
      if (key === 'command' || key === 'method' || key === 'url') continue;
      lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
    writeText(lines.join('\n'));
  }
}

/** Returns { path, size } for a file, or { error } when the file is missing. */
function fileStat(filePath: string): { path: string; size: number } | { path: string; error: string } {
  try {
    return { path: filePath, size: fs.statSync(filePath).size };
  } catch (err: any) {
    return { path: filePath, error: err.message };
  }
}

function collectOption(value: string, previous: string[] = []): string[] {
  return previous.concat(value);
}

/* Core commands are registered separately to keep the executable focused on wiring. */
registerCoreCommands({ program, UsageError, emitError, resolveOutput, resolveApiKey, resolveRegion, ensureRegion,
  resolveBaseUrl, maskApiKey, validRegions, supportedModels: SUPPORTED_MODELS });

registerCapabilityCommands({ program, UsageError, UnsupportedError, emitError, resolveOutput, resolveRegion, ensureRegion,
  resolveTextModel, resolveSpeechTtsModel, getClient, warnIfUnsupportedNonChat, dryRun,
  fileStat, collectOption, resolveApiKey, resolveBaseUrl });

registerFileCommands({ program, UsageError, emitError, resolveOutput, resolveRegion, ensureRegion,
  getFileService, warnIfUnsupportedNonChat, dryRun, fileStat });

registerUnsupportedCommands({ program, UnsupportedError, emitError, resolveOutput });
configureHelp(program);

async function main() {
  await program.parseAsync(process.argv);
}

main().catch((err: any) => {
  process.exitCode = emitError(err, process.stdout.isTTY ? 'text' : 'json');
});
