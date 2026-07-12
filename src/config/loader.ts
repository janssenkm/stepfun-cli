import { readFileSync, writeFileSync, renameSync, existsSync, chmodSync } from 'fs';
import { parseConfigFile, DEFAULTS, type Config, type ConfigFile } from './schema';
import { REGIONS, DEFAULT_REGION, isValidRegion, type Region } from './regions';
import { ensureConfigDir, getConfigPath } from './paths';
import { detectOutputFormat, type OutputFormat } from '../output/formatter';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';
import type { GlobalFlags } from '../types/flags';

export function readConfigFile(): ConfigFile {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    return parseConfigFile(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (err) {
    const e = err as Error;
    if (e instanceof SyntaxError || e.message.includes('JSON')) {
      process.stderr.write(`Warning: config file is corrupted. Run 'stepfun config set' to reset.\n`);
    }
    return {};
  }
}

export async function writeConfigFile(data: Record<string, unknown>): Promise<void> {
  await ensureConfigDir();
  const path = getConfigPath();
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(tmp, 0o600); } catch { /* best-effort */ }
  renameSync(tmp, path);
}

export function loadConfig(flags: GlobalFlags): Config {
  const file = readConfigFile();

  const apiKey =
    (flags.apiKey as string | undefined) ||
    process.env.STEPFUN_API_KEY ||
    file.apiKey;

  const explicitRegion =
    (flags.region as string | undefined) ||
    process.env.STEPFUN_REGION ||
    file.region;

  if (explicitRegion && !isValidRegion(explicitRegion)) {
    throw new CLIError(
      `Invalid region "${explicitRegion}". Valid values: ${Object.keys(REGIONS).join(', ')}`,
      ExitCode.USAGE,
    );
  }

  const region = (explicitRegion || DEFAULT_REGION) as Region;
  const profile = REGIONS[region];

  const genBaseUrl =
    (flags.baseUrl as string | undefined) ||
    process.env.STEPFUN_GEN_BASE_URL ||
    file.genBaseUrl ||
    profile.genBase;

  const apiBaseUrl =
    (flags.apiBaseUrl as string | undefined) ||
    process.env.STEPFUN_API_BASE_URL ||
    file.apiBaseUrl ||
    profile.apiBase;

  const output: OutputFormat = detectOutputFormat(
    (flags.output as string | undefined) || process.env.STEPFUN_OUTPUT || file.output,
  );

  const envTimeout = process.env.STEPFUN_TIMEOUT ? Number(process.env.STEPFUN_TIMEOUT) : undefined;
  const validEnvTimeout =
    envTimeout !== undefined && Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : undefined;
  const timeout = flags.timeout ?? validEnvTimeout ?? file.timeout ?? DEFAULTS.timeout;

  return {
    apiKey,
    fileApiKey: file.apiKey,
    fileRegion: file.region,
    configPath: getConfigPath(),
    region,
    genBaseUrl,
    apiBaseUrl,
    docsHost: profile.docsHost,
    output,
    timeout,
    defaultTextModel: file.defaultTextModel ?? DEFAULTS.textModel,
    defaultSpeechTtsModel: file.defaultSpeechTtsModel ?? DEFAULTS.speechTtsModel,
    defaultSpeechAsrModel: file.defaultSpeechAsrModel ?? DEFAULTS.speechAsrModel,
    defaultImageModel: file.defaultImageModel ?? DEFAULTS.imageModel,
    verbose: flags.verbose || process.env.STEPFUN_VERBOSE === '1',
    quiet: flags.quiet || false,
    noColor: flags.noColor || process.env.NO_COLOR !== undefined || !process.stdout.isTTY,
    yes: flags.yes || false,
    dryRun: flags.dryRun || false,
    nonInteractive: flags.nonInteractive || false,
  };
}
