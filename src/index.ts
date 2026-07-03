#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, saveConfig, REGION_PROFILES } from './config';
import { StepFunClient, APIError, extractAssistantText } from './api';
import { CLI_VERSION } from './version';
import fs from 'fs';
import prompts from 'prompts';
import { runUpdate } from './update';

const program = new Command();
program.enablePositionalOptions();
const config = loadConfig();

const SUPPORTED_MODELS = {
  text: ['step-3.5-flash', 'step-3.5-flash-2603', 'step-3.7-flash'],
  speech: ['stepaudio-2.5-tts', 'stepaudio-2.5-asr'],
  image: ['step-image-edit-2']
};

/** Structured exit codes for scripts and CI integrations. */
const EXIT = {
  OK: 0,
  GENERIC: 1,
  USAGE: 2,
  AUTH: 3,
  NETWORK: 6
} as const;

/** Readable code names emitted in JSON error envelopes. */
const CODE_NAME = {
  [EXIT.OK]: 'OK',
  [EXIT.GENERIC]: 'API_ERROR',
  [EXIT.USAGE]: 'USAGE',
  [EXIT.AUTH]: 'AUTH',
  [EXIT.NETWORK]: 'NETWORK'
} as const;

/**
 * Thrown for user-input validation failures (unknown region, NaN numeric
 * argument, missing required prompt, unknown config key, interactive-only
 * command under --non-interactive). Surfaces exit code USAGE(2).
 */
class UsageError extends Error {
  hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'UsageError';
    this.hint = hint;
  }
}

/**
 * Classifies any thrown value into a structured error descriptor. Order
 * matters: network/abort failures are detected first (they wrap fetch
 * rejections and AbortSignal timeouts), then typed API errors by status,
 * then the missing-API-key guard, then UsageError, then plain errors.
 */
function classifyError(err: any): { code: number; name: string; message: string; hint?: string } {
  const message = err?.message || String(err);

  // Network / timeout failures surface as fetch rejections, cause codes
  // (ECONNREFUSED/ENOTFOUND/etc.), or AbortSignal timeout exceptions. Treat
  // them all as NETWORK so users can distinguish connectivity from auth.
  const errName = err?.name || '';
  const causeCode = err?.cause?.code || '';
  if (
    errName === 'AbortError' ||
    errName === 'TimeoutError' ||
    /timeout|abort|fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH/i.test(message) ||
    /ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT/.test(causeCode)
  ) {
    return {
      code: EXIT.NETWORK,
      name: CODE_NAME[EXIT.NETWORK],
      message,
      hint: 'Check your network connection, the API base URL, or raise --timeout.'
    };
  }

  // Typed API errors: 401/403 → AUTH, everything else → generic API error.
  if (err instanceof APIError) {
    if (err.status === 401 || err.status === 403) {
      return {
        code: EXIT.AUTH,
        name: CODE_NAME[EXIT.AUTH],
        message,
        hint: 'Check that your API key is valid and authorized for this region/model.'
      };
    }
    return {
      code: EXIT.GENERIC,
      name: CODE_NAME[EXIT.GENERIC],
      message,
      hint: 'The API rejected the request; verify the model name, parameters, and account status.'
    };
  }

  // Missing API key guard (raised by getClient before any network call).
  if (/API key is required/i.test(message)) {
    return {
      code: EXIT.AUTH,
      name: CODE_NAME[EXIT.AUTH],
      message,
      hint: 'Run `stepfun auth login`, set `STEPFUN_API_KEY`, or pass `--api-key`.'
    };
  }

  // Explicit usage validation.
  if (err instanceof UsageError) {
    return {
      code: EXIT.USAGE,
      name: CODE_NAME[EXIT.USAGE],
      message,
      hint: err.hint
    };
  }

  return { code: EXIT.GENERIC, name: CODE_NAME[EXIT.GENERIC], message };
}

/**
 * Emits a classified error to stderr and returns the numeric exit code. In
 * JSON mode the envelope is `{ error: { code, message, hint? } }`; in text
 * mode it is `Error: ...` plus an optional `Hint: ...` and `(exit code N)`.
 * Errors always go to stderr; stdout remains reserved for success payloads.
 */
function emitError(err: any, output: string): number {
  const { code, name, message, hint } = classifyError(err);
  if (output === 'json') {
    const envelope: Record<string, unknown> = { code: name, message };
    if (hint) envelope.hint = hint;
    console.error(JSON.stringify({ error: envelope }));
  } else {
    console.error(`Error: ${message}`);
    if (hint) console.error(`Hint: ${hint}`);
    console.error(`(exit code ${code})`);
  }
  return code;
}

/** Returns a diagnostic-safe representation without exposing credentials. */
function maskApiKey(apiKey?: string): string | undefined {
  if (!apiKey) return undefined;
  // Short keys cannot safely reveal both a prefix and suffix.
  if (apiKey.length <= 8) return '********';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function validRegions(): string {
  return Object.keys(REGION_PROFILES).join(', ');
}

function validateRegion(region: string): string {
  if (!REGION_PROFILES[region]) {
    throw new UsageError(
      `Unknown region: ${region}. Valid options: ${validRegions()}`,
      `Choose one of: ${validRegions()}.`
    );
  }
  return region;
}

/**
 * StepPlan regions are documented only for chat/reasoning endpoints. Warn when
 * a non-chat command targets them — the call still goes through, but may 404.
 */
function warnIfUnsupportedNonChat(region: string, quiet: boolean, commandName: string): void {
  if (quiet) return;
  const profile = REGION_PROFILES[region];
  if (!profile || profile.supportsNonChat) return;
  console.error(
    `Note: ${commandName} under ${region} targets an endpoint not covered by official docs ` +
    `(StepPlan is documented for chat/reasoning only). It may fail — consider a PayGo region ` +
    `(PayGo-CN / PayGo-Global) for speech/image.`
  );
}

program
  .name('stepfun')
  .description('StepFun Command Line Interface')
  .version(CLI_VERSION)
  .option('--api-key <key>', 'API key (overrides all other auth)')
  .option('--region <region>', 'API region (StepPlan-CN, StepPlan-Global, PayGo-CN, PayGo-Global)')
  .option('--base-url <url>', 'API base URL (overrides region)')
  .option('--output <format>', 'Output format: text, json')
  .option('--timeout <seconds>', 'HTTP request timeout in seconds (default 300)', value => Number(value))
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

function resolveRegion(options: any): string {
  return validateRegion(options.region || process.env.STEPFUN_REGION || config.region || 'PayGo-CN');
}

function resolveBaseUrl(options: any, region: string): string {
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
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new UsageError(`Invalid --timeout: ${value}`, '--timeout must be a positive number of seconds.');
  }
  return seconds;
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
  return new StepFunClient(apiKey, baseUrl, timeoutSeconds);
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
    url: `${baseUrl}${endpointPath}`,
    ...detail
  };
  if (resolveOutput(options) === 'json') {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`[dry-run] ${summary.method} ${summary.url}`);
    console.log(`  command: ${summary.command}`);
    for (const [key, value] of Object.entries(summary)) {
      if (key === 'command' || key === 'method' || key === 'url') continue;
      console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
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

// Auth Command
const authCmd = program.command('auth').description('Authentication');

authCmd.command('login')
  .description('Authenticate and set region via interactive prompt')
  .action(async () => {
    const parentOptions = program.opts();
    if (parentOptions.nonInteractive) {
      process.exitCode = emitError(
        new UsageError(
          'auth login is interactive and cannot run with --non-interactive. Use `config set api_key <key>` (and optionally `config set region <region>`) or pass `--api-key` instead.'
        ),
        resolveOutput(parentOptions)
      );
      return;
    }
    const response = await prompts([
      {
        type: 'select',
        name: 'region',
        message: 'Please select your StepFun API region:',
        choices: [
          { title: 'StepPlan-CN (国内版 StepPlan)', value: 'StepPlan-CN' },
          { title: 'StepPlan-Global (国际版 StepPlan)', value: 'StepPlan-Global' },
          { title: 'PayGo-CN (国内版 纯API按量计费)', value: 'PayGo-CN' },
          { title: 'PayGo-Global (国际版 纯API按量计费)', value: 'PayGo-Global' }
        ],
        initial: Math.max(0, Object.keys(REGION_PROFILES).indexOf(config.region || 'PayGo-CN'))
      },
      {
        type: 'password',
        name: 'apiKey',
        message: prev => `Please enter your API Key for ${prev}:`
      }
    ]);

    if (response.region && response.apiKey) {
      saveConfig({ region: response.region, apiKey: response.apiKey, baseUrl: undefined });
      console.log(`\nRegion set to ${response.region} (${REGION_PROFILES[response.region].baseUrl})`);
      console.log('API Key saved successfully.');
    } else {
      console.log('Login cancelled.');
    }
  });

authCmd.command('logout')
  .description('Clear saved credentials and configuration')
  .option('--yes', 'Skip the confirmation prompt')
  .action(async (options) => {
    const parentOptions = program.opts();
    if (!options.yes) {
      if (parentOptions.nonInteractive) {
        process.exitCode = emitError(
          new UsageError('auth logout needs confirmation but --non-interactive is set. Re-run with --yes to confirm.'),
          resolveOutput(parentOptions)
        );
        return;
      }
      const response = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'This will clear ~/.stepfun-cli/config.json. Continue?',
        initial: false
      });
      if (!response.confirm) {
        console.log('Logout cancelled.');
        return;
      }
    }
    saveConfig({
      apiKey: undefined,
      region: undefined,
      baseUrl: undefined,
      output: undefined,
      timeout: undefined,
      defaultTextModel: undefined,
      defaultSpeechModel: undefined
    });
    console.log('Credentials cleared.');
  });

authCmd.command('status')
  .description('Show authentication status')
  .action(() => {
    const parentOptions = program.opts();
    const currentConfig = loadConfig();
    const envApiKey = process.env.STEPFUN_API_KEY;
    // Mirror getClient's precedence (flag > env > config) so status describes
    // the credential and endpoint an API command would actually use.
    const apiKey = resolveApiKey(parentOptions);
    const authSource = parentOptions.apiKey
      ? '--api-key'
      : envApiKey
        ? 'STEPFUN_API_KEY'
        : currentConfig.apiKey
          ? 'config'
          : 'none';
    const region = resolveRegion(parentOptions);
    const baseUrl = resolveBaseUrl(parentOptions, region);
    const status = {
      authenticated: Boolean(apiKey),
      authSource,
      apiKey: maskApiKey(apiKey),
      region,
      baseUrl
    };

    if (resolveOutput(parentOptions) === 'json') {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(`Authenticated: ${status.authenticated ? 'yes' : 'no'}`);
      console.log(`Auth source: ${status.authSource}`);
      if (status.apiKey) console.log(`API key: ${status.apiKey}`);
      console.log(`Region: ${status.region}`);
      console.log(`Base URL: ${status.baseUrl}`);
    }
  });

// Config Command
const configCmd = program.command('config').description('CLI configuration');

configCmd.command('set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => {
    const parentOptions = program.opts();
    try {
      if (key === 'api_key') {
        saveConfig({ apiKey: value });
        console.log('API key saved.');
      } else if (key === 'base_url') {
        saveConfig({ baseUrl: value });
        console.log('Base URL saved.');
      } else if (key === 'region') {
        if (!REGION_PROFILES[value]) {
          throw new UsageError(
            `Unknown region: ${value}. Valid options: ${validRegions()}`,
            `Choose one of: ${validRegions()}.`
          );
        }
        saveConfig({ region: value, baseUrl: undefined });
        console.log(`Region saved as ${value} (${REGION_PROFILES[value].baseUrl}).`);
      } else if (key === 'output') {
        if (value !== 'text' && value !== 'json') {
          throw new UsageError(`Unknown output: ${value}. Valid options: text, json`, 'Output must be `text` or `json`.');
        }
        saveConfig({ output: value });
        console.log(`Output format saved as ${value}.`);
      } else if (key === 'timeout') {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
          throw new UsageError(`Invalid timeout: ${value}`, 'timeout must be a positive number of seconds.');
        }
        saveConfig({ timeout: seconds });
        console.log(`Timeout saved as ${seconds} seconds.`);
      } else if (key === 'default_text_model') {
        saveConfig({ defaultTextModel: value });
        console.log(`Default text model saved as ${value}.`);
      } else if (key === 'default_speech_model') {
        saveConfig({ defaultSpeechModel: value });
        console.log(`Default speech model saved as ${value}.`);
      } else {
        throw new UsageError(`Unknown config key: ${key}`);
      }
    } catch (err: any) {
      process.exitCode = emitError(err, resolveOutput(parentOptions));
    }
  });

configCmd.command('show')
  .description('Show current configuration')
  .action(() => {
    const currentConfig = loadConfig();
    console.log(JSON.stringify({
      ...currentConfig,
      apiKey: maskApiKey(currentConfig.apiKey)
    }, null, 2));
  });

// Models Command
const modelsCmd = program.command('models').description('Model discovery');

modelsCmd.command('list')
  .description('List supported models')
  .action(() => {
    const parentOptions = program.opts();

    if (resolveOutput(parentOptions) === 'json') {
      console.log(JSON.stringify(SUPPORTED_MODELS, null, 2));
    } else {
      console.log('Text:');
      SUPPORTED_MODELS.text.forEach(model => console.log(`  - ${model}`));
      console.log('Speech:');
      SUPPORTED_MODELS.speech.forEach(model => console.log(`  - ${model}`));
      console.log('Image:');
      SUPPORTED_MODELS.image.forEach(model => console.log(`  - ${model}`));
    }
  });

// Text Command
const textCmd = program.command('text').description('Text generation (chat)');

textCmd.command('chat')
  .description('Start a chat completion')
  .option('--message <text>', 'Message text (repeatable; prefix with system:, user:, or assistant: to set role)', collectOption)
  .option('-p, --prompt <text>', 'Alias for --message (repeatable)', collectOption)
  .option('-m, --model <model>', 'Model name (defaults to config default_text_model or step-3.5-flash)')
  .option('--temperature <number>', 'Sampling temperature')
  .option('--top-p <number>', 'Nucleus sampling probability (top_p)')
  .option('--max-tokens <int>', 'Maximum tokens to generate (max_tokens)')
  .option('--system <text>', 'System message prepended before all other messages')
  .option('--messages-file <path|->', 'Read messages JSON array from file or stdin (-)')
  .option('--stream', 'Stream tokens as they arrive (auto-enabled when stdout is a TTY and output is not json)')
  .option('--no-stream', 'Disable streaming even when stdout is a TTY')
  .action(async (options) => {
    const parentOptions = program.opts();
    try {
      // --message is canonical and repeatable;
      // --prompt remains an alias and is used only when --message is absent.
      const explicitMessages: string[] = options.message || [];
      const promptAliases: string[] = options.prompt || [];
      const rawMessages = explicitMessages.length > 0 ? explicitMessages : promptAliases;
      // Numeric validation: surface bad input explicitly rather than sending NaN.
      const temperature = options.temperature !== undefined ? Number(options.temperature) : undefined;
      const topP = options.topP !== undefined ? Number(options.topP) : undefined;
      const maxTokens = options.maxTokens !== undefined ? parseInt(options.maxTokens, 10) : undefined;
      if (options.temperature !== undefined && Number.isNaN(temperature)) {
        throw new UsageError(`Invalid --temperature: ${options.temperature}`, '--temperature must be a number.');
      }
      if (options.topP !== undefined && Number.isNaN(topP)) {
        throw new UsageError(`Invalid --top-p: ${options.topP}`, '--top-p must be a number.');
      }
      if (options.maxTokens !== undefined && Number.isNaN(maxTokens)) {
        throw new UsageError(`Invalid --max-tokens: ${options.maxTokens}`, '--max-tokens must be an integer.');
      }

      if (parentOptions.dryRun) {
        if (rawMessages.length === 0 && options.messagesFile === undefined) {
          throw new UsageError('at least one of --message / --messages-file is required');
        }
        const detail: Record<string, unknown> = { model: resolveTextModel(options) };
        if (options.system !== undefined) detail.system = options.system;
        if (temperature !== undefined) detail.temperature = temperature;
        if (topP !== undefined) detail.top_p = topP;
        if (maxTokens !== undefined) detail.max_tokens = maxTokens;
        if (rawMessages.length > 0) detail.message = rawMessages;
        if (options.messagesFile !== undefined) detail.messages_file = options.messagesFile;
        dryRun(parentOptions, 'text chat', 'POST', '/chat/completions', detail);
        return;
      }

      const client = getClient(parentOptions);

      // Build messages. --messages-file may supply the whole conversation.
      // A passed --message is appended as a trailing turn. --system always
      // leads. At least one of --message / --messages-file is required.
      let fileMessages: any[] = [];
      if (options.messagesFile !== undefined) {
        const raw = options.messagesFile === '-'
          ? fs.readFileSync(0, 'utf8')
          : fs.readFileSync(options.messagesFile, 'utf8');
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e: any) {
          throw new UsageError(`Invalid JSON in --messages-file: ${e.message}`);
        }
        if (!Array.isArray(parsed)) {
          throw new UsageError('--messages-file must contain a JSON array of {role, content} objects');
        }
        fileMessages = parsed;
      }

      if (rawMessages.length === 0 && options.messagesFile === undefined) {
        throw new UsageError('at least one of --message / --messages-file is required');
      }

      const messages: any[] = [];
      let system = options.system;
      const parsedMessages: any[] = [];
      for (const rawMessage of rawMessages) {
        const separator = rawMessage.indexOf(':');
        const role = separator === -1 ? '' : rawMessage.slice(0, separator);
        const content = separator === -1 ? rawMessage : rawMessage.slice(separator + 1);
        if (role === 'system') system = content;
        else if (role === 'user' || role === 'assistant') parsedMessages.push({ role, content });
        else parsedMessages.push({ role: 'user', content: rawMessage });
      }
      if (system) messages.push({ role: 'system', content: system });
      messages.push(...fileMessages);
      messages.push(...parsedMessages);

      const opts: { temperature?: number; top_p?: number; max_tokens?: number } = {};
      if (temperature !== undefined) opts.temperature = temperature;
      if (topP !== undefined) opts.top_p = topP;
      if (maxTokens !== undefined) opts.max_tokens = maxTokens;
      const apiOpts = Object.keys(opts).length ? opts : undefined;

      // --output json is incompatible with token streaming (it needs the full
      // object). When json is selected, force non-streaming. Otherwise honor an
      // explicit --stream/--no-stream, falling back to TTY auto-enable.
      const output = resolveOutput(parentOptions);
      const wantStream = output === 'json'
        ? false
        : (options.stream !== undefined ? options.stream : Boolean(process.stdout.isTTY));

      const model = resolveTextModel(options);
      if (wantStream) {
        let reasoningStarted = false;
        let responseStarted = false;
        await client.chatCompletionStream(
          model,
          messages,
          (text) => {
            if (reasoningStarted && !responseStarted && !parentOptions.quiet) {
              process.stderr.write('Response:\n');
            }
            responseStarted = true;
            process.stdout.write(text);
          },
          apiOpts,
          () => {
            if (!reasoningStarted && !parentOptions.quiet) process.stderr.write('Thinking...\n');
            reasoningStarted = true;
          }
        );
        process.stdout.write('\n');
      } else {
        const result = await client.chatCompletion(model, messages, apiOpts);
        if (output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(extractAssistantText(result));
        }
      }
    } catch (err: any) {
      process.exitCode = emitError(err, resolveOutput(parentOptions));
    }
  });

// Speech Command
const speechCmd = program.command('speech').description('Speech generation and recognition');

speechCmd.command('synthesize')
  .description('Synthesize speech from text')
  .requiredOption('-t, --text <text>', 'Text to synthesize')
  .option('-o, --output <file>', 'Output file path', 'output.mp3')
  .option('-v, --voice <voice>', 'Voice ID (defaults by region)')
  .option('-m, --model <model>', 'Model name (defaults to config default_speech_model or stepaudio-2.5-tts)')
  .option('--format <format>', 'Response format: wav, mp3, flac, opus, pcm')
  .option('--speed <number>', 'Speech speed')
  .option('--volume <number>', 'Speech volume')
  .option('--sample-rate <number>', 'Sample rate (sample_rate)')
  .action(async (options) => {
    const parentOptions = program.opts();
    try {
      const speed = options.speed !== undefined ? Number(options.speed) : undefined;
      const volume = options.volume !== undefined ? Number(options.volume) : undefined;
      const sampleRate = options.sampleRate !== undefined ? Number(options.sampleRate) : undefined;
      if (options.speed !== undefined && Number.isNaN(speed)) {
        throw new UsageError(`Invalid --speed: ${options.speed}`, '--speed must be a number.');
      }
      if (options.volume !== undefined && Number.isNaN(volume)) {
        throw new UsageError(`Invalid --volume: ${options.volume}`, '--volume must be a number.');
      }
      if (options.sampleRate !== undefined && Number.isNaN(sampleRate)) {
        throw new UsageError(`Invalid --sample-rate: ${options.sampleRate}`, '--sample-rate must be a number.');
      }

      const region = resolveRegion(parentOptions);
      const voice = options.voice || (REGION_PROFILES[region].geography === 'Global' ? 'lively-girl' : 'cixingnansheng');

      if (parentOptions.dryRun) {
        const detail: Record<string, unknown> = {
          model: resolveSpeechTtsModel(options),
          voice,
          text: options.text
        };
        if (options.format !== undefined) detail.format = options.format;
        if (speed !== undefined) detail.speed = speed;
        if (volume !== undefined) detail.volume = volume;
        if (sampleRate !== undefined) detail.sample_rate = sampleRate;
        dryRun(parentOptions, 'speech synthesize', 'POST', '/audio/speech', detail);
        return;
      }

      const client = getClient(parentOptions);
      warnIfUnsupportedNonChat(region, parentOptions.quiet, 'speech synthesize');
      if (!parentOptions.quiet) console.log(`Synthesizing text to ${options.output}...`);
      const opts: { response_format?: string; speed?: number; volume?: number; sample_rate?: number } = {};
      if (options.format !== undefined) opts.response_format = options.format;
      if (speed !== undefined) opts.speed = speed;
      if (volume !== undefined) opts.volume = volume;
      if (sampleRate !== undefined) opts.sample_rate = sampleRate;
      const buffer = await client.audioSynthesize(resolveSpeechTtsModel(options), options.text, voice, Object.keys(opts).length ? opts : undefined);
      fs.writeFileSync(options.output, buffer);
      if (!parentOptions.quiet) console.log('Done.');
    } catch (err: any) {
      process.exitCode = emitError(err, resolveOutput(parentOptions));
    }
  });

speechCmd.command('recognize')
  .description('Recognize text from speech')
  .requiredOption('-f, --file <file>', 'Audio file path')
  .option('-m, --model <model>', 'Model name', 'stepaudio-2.5-asr')
  .option('--language <code>', 'Language code, e.g. zh or en')
  .option('--hotwords <a,b,c>', 'Comma-separated hotwords')
  .action(async (options) => {
    const parentOptions = program.opts();
    try {
      const region = resolveRegion(parentOptions);

      if (parentOptions.dryRun) {
        const detail: Record<string, unknown> = {
          model: options.model,
          audio: fileStat(options.file)
        };
        if (options.language !== undefined) detail.language = options.language;
        if (options.hotwords !== undefined) detail.hotwords = options.hotwords;
        dryRun(parentOptions, 'speech recognize', 'POST', '/audio/asr/sse', detail);
        return;
      }

      const client = getClient(parentOptions);
      warnIfUnsupportedNonChat(region, parentOptions.quiet, 'speech recognize');
      if (!parentOptions.quiet) console.log(`Recognizing speech from ${options.file}...`);
      const opts: { language?: string; hotwords?: string[] } = {};
      if (options.language !== undefined) opts.language = options.language;
      if (options.hotwords !== undefined) opts.hotwords = options.hotwords.split(',').map((s: string) => s.trim()).filter(Boolean);
      const result = await client.audioTranscribe(options.model, options.file, Object.keys(opts).length ? opts : undefined);

      if (resolveOutput(parentOptions) === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.text || result);
      }
    } catch (err: any) {
      process.exitCode = emitError(err, resolveOutput(parentOptions));
    }
  });

// Image Command
const imageCmd = program.command('image').description('Image tools');

imageCmd.command('edit')
  .description('Edit an image')
  .requiredOption('-f, --file <file>', 'Image file to edit')
  .requiredOption('-p, --prompt <text>', 'Prompt text for edit')
  .option('-m, --model <model>', 'Model name', 'step-image-edit-2')
  .option('--response-format <format>', 'Response format: b64_json or url', 'b64_json')
  .option('--seed <int>', 'Random seed')
  .option('--steps <int>', 'Inference steps')
  .option('--cfg-scale <number>', 'CFG scale (cfg_scale)')
  .option('--negative-prompt <text>', 'Negative prompt (negative_prompt)')
  .action(async (options) => {
    const parentOptions = program.opts();
    try {
      const seed = options.seed !== undefined ? parseInt(options.seed, 10) : undefined;
      const steps = options.steps !== undefined ? parseInt(options.steps, 10) : undefined;
      const cfgScale = options.cfgScale !== undefined ? Number(options.cfgScale) : undefined;
      if (options.seed !== undefined && Number.isNaN(seed)) {
        throw new UsageError(`Invalid --seed: ${options.seed}`, '--seed must be an integer.');
      }
      if (options.steps !== undefined && Number.isNaN(steps)) {
        throw new UsageError(`Invalid --steps: ${options.steps}`, '--steps must be an integer.');
      }
      if (options.cfgScale !== undefined && Number.isNaN(cfgScale)) {
        throw new UsageError(`Invalid --cfg-scale: ${options.cfgScale}`, '--cfg-scale must be a number.');
      }

      const region = resolveRegion(parentOptions);

      if (parentOptions.dryRun) {
        const detail: Record<string, unknown> = {
          model: options.model,
          response_format: options.responseFormat,
          prompt: options.prompt,
          image: fileStat(options.file)
        };
        if (seed !== undefined) detail.seed = seed;
        if (steps !== undefined) detail.steps = steps;
        if (cfgScale !== undefined) detail.cfg_scale = cfgScale;
        if (options.negativePrompt !== undefined) detail.negative_prompt = options.negativePrompt;
        dryRun(parentOptions, 'image edit', 'POST', '/images/edits', detail);
        return;
      }

      const client = getClient(parentOptions);
      warnIfUnsupportedNonChat(region, parentOptions.quiet, 'image edit');
      if (!parentOptions.quiet) console.log(`Editing image ${options.file}...`);
      const opts: { seed?: number; steps?: number; cfg_scale?: number; negative_prompt?: string } = {};
      if (seed !== undefined) opts.seed = seed;
      if (steps !== undefined) opts.steps = steps;
      if (cfgScale !== undefined) opts.cfg_scale = cfgScale;
      if (options.negativePrompt !== undefined) opts.negative_prompt = options.negativePrompt;
      const result = await client.imageEdit(options.model, options.file, options.prompt, options.responseFormat, Object.keys(opts).length ? opts : undefined);

      if (resolveOutput(parentOptions) === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const firstImage = result?.data?.[0];
        console.log(firstImage?.url || firstImage?.b64_json || JSON.stringify(result, null, 2));
      }
    } catch (err: any) {
      process.exitCode = emitError(err, resolveOutput(parentOptions));
    }
  });

async function main() {
  await program.parseAsync(process.argv);
}

main().catch((err: any) => {
  process.exitCode = emitError(err, process.stdout.isTTY ? 'text' : 'json');
});
