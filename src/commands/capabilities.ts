import { Command } from 'commander';
import fs from 'fs';
import { extractAssistantText, StepFunClient } from '../api';
import { REGION_PROFILES, loadConfig } from '../config';
import type { Region } from '../config';
import { ENDPOINTS } from '../client/endpoints';
import { writeJson, writeProgress, writeText } from '../cli/output';
import { optionalInteger, optionalNumber } from '../cli/validation';
import { maybeShowStatusBar } from '../cli/status-bar';

export interface CapabilityCommandContext {
  program: Command;
  UsageError: new (message: string, hint?: string) => Error;
  UnsupportedError: new (message: string, hint?: string) => Error;
  emitError: (error: unknown, output: string) => number;
  resolveOutput: (options: any) => string;
  resolveRegion: (options: any) => Region;
  ensureRegion: (options: any) => Promise<void>;
  resolveTextModel: (options: any) => string;
  resolveSpeechTtsModel: (options: any) => string;
  getClient: (options: any) => StepFunClient;
  warnIfUnsupportedNonChat: (region: Region, quiet: boolean, commandName: string) => void;
  dryRun: (options: any, command: string, method: string, endpoint: string, detail: Record<string, unknown>) => void;
  fileStat: (path: string) => { path: string; size: number } | { path: string; error: string };
  collectOption: (value: string, previous?: string[]) => string[];
  resolveApiKey: (options: any) => string | undefined;
  resolveBaseUrl: (options: any, region: Region) => string;
}

// ---------------------------------------------------------------------------
// ThinkingIndicator — dynamic Braille spinner with HSL color cycling + elapsed time
// ---------------------------------------------------------------------------

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  if (h < 60)       return [Math.round((c + m) * 255), Math.round((x + m) * 255), Math.round((m) * 255)];
  if (h < 120)      return [Math.round((x + m) * 255), Math.round((c + m) * 255), Math.round((m) * 255)];
  if (h < 180)      return [Math.round((m) * 255), Math.round((c + m) * 255), Math.round((x + m) * 255)];
  if (h < 240)      return [Math.round((m) * 255), Math.round((x + m) * 255), Math.round((c + m) * 255)];
  if (h < 300)      return [Math.round((x + m) * 255), Math.round((m) * 255), Math.round((c + m) * 255)];
  return [Math.round((c + m) * 255), Math.round((m) * 255), Math.round((x + m) * 255)];
}

class ThinkingIndicator {
  private frame = 0;
  private startTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private out: NodeJS.WriteStream;
  private noColor: boolean;

  constructor(out: NodeJS.WriteStream, noColor: boolean) {
    this.out = out;
    this.noColor = noColor;
  }

  start(): void {
    this.frame = 0;
    this.startTime = Date.now();
    this.tick();
    this.timer = setInterval(() => this.tick(), 80);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.out.write('\r\x1b[0K');
  }

  private tick(): void {
    const ch = BRAILLE_FRAMES[this.frame % BRAILLE_FRAMES.length];
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const label = elapsed >= 60
      ? `Thinking (${Math.floor(elapsed / 60)}m ${elapsed % 60}s)`
      : `Thinking (${elapsed}s)`;
    this.frame++;
    if (this.noColor) {
      this.out.write(`\r${ch} ${label}\x1b[0K`);
    } else {
      const [rs, gs, bs] = hslToRgb((this.frame * 17) % 360, 0.85, 0.55);
      const [rl, gl, bl] = hslToRgb(((this.frame * 17) + 40) % 360, 0.85, 0.55);
      this.out.write(
        `\r\x1b[38;2;${rs};${gs};${bs}m${ch}\x1b[0m ` +
        `\x1b[38;2;${rl};${gl};${bl}m${label}\x1b[0m\x1b[0K`
      );
    }
  }
}

/** Registers commands backed by StepFun model APIs. */
export function registerCapabilityCommands(context: CapabilityCommandContext): void {
  const { program, UsageError, UnsupportedError, emitError, resolveOutput, resolveRegion, ensureRegion, resolveTextModel,
    resolveSpeechTtsModel, getClient, warnIfUnsupportedNonChat, dryRun, fileStat,
    collectOption, resolveApiKey, resolveBaseUrl } = context;
  // Text Command
  const textCmd = program.command('text').description('Text generation (chat)');
  
  textCmd.command('chat')
    .description('Start a chat completion')
    .option('--message <text>', 'Message text (repeatable; prefix with system:, user:, or assistant: to set role)', collectOption)
    .option('-m, --model <model>', 'Model name (defaults to config default_text_model or step-3.5-flash)')
    .option('--temperature <number>', 'Sampling temperature')
    .option('--top-p <number>', 'Nucleus sampling probability (top_p)')
    .option('--max-tokens <int>', 'Maximum tokens to generate (max_tokens)')
    .option('--system <text>', 'System message prepended before all other messages')
    .option('--messages-file <path|->', 'Read messages JSON array from file or stdin (-)')
    .option('--stream', 'Stream tokens as they arrive (auto-enabled when stdout is a TTY and output is not json)')
    .option('--no-stream', 'Disable streaming even when stdout is a TTY')
    .option('--tool <json-or-path>', 'Tool definition as JSON or file path (repeatable; unsupported)', collectOption)
    .option('--reasoning-effort <level>', 'Reasoning depth: low, medium, or high')
    .option('--reasoning-format <format>', 'Reasoning field format: general or deepseek-style')
    .option('--stop <text>', 'Stop sequence (repeatable)', collectOption)
    .option('--frequency-penalty <number>', 'Frequency penalty (0.0–1.0)')
    .option('--response-format <format>', 'Output format: text or json_object')
    .option('-n, --n <count>', 'Number of responses (1 or more; >1 requires --output json)')
    .action(async (options) => {
      const parentOptions = program.opts();
      try {
        if (options.tool?.length) {
          throw new UnsupportedError(
            'stepfun text chat --tool is not supported by the current StepFun API integration.',
            'Remove --tool and use messages only.'
          );
        }
        // Commander invokes the collector once per occurrence, preserving order.
        const rawMessages: string[] = options.message || [];
        // Numeric validation: surface bad input explicitly rather than sending NaN.
        const temperature = optionalNumber(options.temperature, '--temperature', UsageError);
        const topP = optionalNumber(options.topP, '--top-p', UsageError);
        const maxTokens = optionalInteger(options.maxTokens, '--max-tokens', UsageError);
        const frequencyPenalty = optionalNumber(options.frequencyPenalty, '--frequency-penalty', UsageError);
        if (frequencyPenalty !== undefined && (frequencyPenalty < 0 || frequencyPenalty > 1)) {
          throw new UsageError('--frequency-penalty must be between 0.0 and 1.0', 'Use a value in the range 0.0–1.0.');
        }
        const nCount = options.n !== undefined ? Number(options.n) : undefined;
        if (nCount !== undefined && (nCount < 1 || !Number.isInteger(nCount))) {
          throw new UsageError('--n must be a positive integer', 'Use --n 1 or higher.');
        }
        if (nCount !== undefined && nCount > 1 && resolveOutput(parentOptions) !== 'json') {
          throw new UsageError('--n > 1 requires --output json', 'Use --output json when requesting multiple responses.');
        }
        const responseFormat = options.responseFormat === 'json_object'
          ? { type: 'json_object' }
          : options.responseFormat === 'text'
            ? { type: 'text' }
            : options.responseFormat === undefined
              ? undefined
              : (() => {
                  throw new UsageError(
                    `Invalid --response-format: "${options.responseFormat}". Valid options: text, json_object`,
                    'Use --response-format text or --response-format json_object.'
                  );
                })();
        const reasoningEffort = options.reasoningEffort;
        const reasoningFormat = options.reasoningFormat;
        const stopSequences = options.stop;
  
        if (parentOptions.dryRun) {
          if (rawMessages.length === 0 && options.messagesFile === undefined) {
            throw new UsageError('at least one of --message / --messages-file is required');
          }
          const detail: Record<string, unknown> = { model: resolveTextModel(options) };
          if (options.system !== undefined) detail.system = options.system;
          if (temperature !== undefined) detail.temperature = temperature;
          if (topP !== undefined) detail.top_p = topP;
          if (maxTokens !== undefined) detail.max_tokens = maxTokens;
          if (reasoningEffort !== undefined) detail.reasoning_effort = reasoningEffort;
          if (reasoningFormat !== undefined) detail.reasoning_format = reasoningFormat;
          if (stopSequences !== undefined) detail.stop = stopSequences;
          if (frequencyPenalty !== undefined) detail.frequency_penalty = frequencyPenalty;
          if (responseFormat !== undefined) detail.response_format = responseFormat;
          if (nCount !== undefined) detail.n = nCount;
          if (rawMessages.length > 0) detail.message = rawMessages;
          if (options.messagesFile !== undefined) detail.messages_file = options.messagesFile;
          dryRun(parentOptions, 'text chat', 'POST', ENDPOINTS.chatCompletions, detail);
          return;
        }
  
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
  
        const opts: { temperature?: number; top_p?: number; max_tokens?: number;
          reasoning_effort?: string; reasoning_format?: string;
          stop?: string[]; frequency_penalty?: number;
          response_format?: { type: string }; n?: number } = {};
        if (temperature !== undefined) opts.temperature = temperature;
        if (topP !== undefined) opts.top_p = topP;
        if (maxTokens !== undefined) opts.max_tokens = maxTokens;
        if (reasoningEffort !== undefined) opts.reasoning_effort = reasoningEffort;
        if (reasoningFormat !== undefined) opts.reasoning_format = reasoningFormat;
        if (stopSequences !== undefined && stopSequences.length > 0) opts.stop = stopSequences;
        if (frequencyPenalty !== undefined) opts.frequency_penalty = frequencyPenalty;
        if (responseFormat !== undefined) opts.response_format = responseFormat;
        if (nCount !== undefined) opts.n = nCount;
        const apiOpts = Object.keys(opts).length ? opts : undefined;
  
        // --output json is incompatible with token streaming (it needs the full
        // object). When json is selected, force non-streaming. Otherwise honor an
        // explicit --stream/--no-stream, falling back to TTY auto-enable.
        const output = resolveOutput(parentOptions);
        const wantStream = output === 'json'
          ? false
          : (options.stream !== undefined ? options.stream : Boolean(process.stdout.isTTY));
  
        await ensureRegion(parentOptions);
        const client = getClient(parentOptions);
        const region = resolveRegion(parentOptions);
        const model = resolveTextModel(options);
        maybeShowStatusBar(parentOptions, resolveApiKey(parentOptions), region, resolveBaseUrl(parentOptions, region), model);
        if (wantStream) {
          const think = new ThinkingIndicator(process.stderr, Boolean(parentOptions.noColor));
          let responseStarted = false;
          let thinkingStarted = false;
          await client.chatCompletionStream(
            model,
            messages,
            (text) => {
              if (!responseStarted) {
                if (thinkingStarted) think.stop();
                if (!parentOptions.quiet) process.stderr.write('Response:\n');
              }
              responseStarted = true;
              process.stdout.write(text);
            },
            apiOpts,
            (text) => {
              if (!responseStarted && !parentOptions.quiet && !thinkingStarted) {
                thinkingStarted = true;
                think.start();
              }
            }
          );
          process.stdout.write('\n');
        } else {
          const result = await client.chatCompletion(model, messages, apiOpts);
          if (output === 'json') {
            writeJson(result);
          } else {
            writeText(extractAssistantText(result));
          }
        }
      } catch (err: any) {
        process.exitCode = emitError(err, resolveOutput(parentOptions));
      }
    });
  
  // Speech Command
  const speechCmd = program.command('speech').description('Speech generation and recognition');
  
  const synthesize = speechCmd.command('synthesize')
    .description('Synthesize speech from text')
    .option('-t, --text <text>', 'Text to synthesize')
    .option('--text-file <path|->', 'Read text from a file or stdin (unsupported)')
    .option('-o, --out <file>', 'Output file path', 'output.mp3')
    .option('-v, --voice <voice>', 'Voice ID (defaults by region)')
    .option('-m, --model <model>', 'Model name (defaults to config default_speech_model or stepaudio-2.5-tts)')
    .option('--format <format>', 'Response format: wav, mp3, flac, opus, pcm')
    .option('--speed <number>', 'Speech speed')
    .option('--volume <number>', 'Speech volume')
    .option('--pitch <number>', 'Pitch adjustment (unsupported)')
    .option('--sample-rate <number>', 'Sample rate (sample_rate)')
    .option('--bitrate <number>', 'Audio bitrate (unsupported)')
    .option('--channels <number>', 'Audio channel count (unsupported)')
    .option('--language <code>', 'Language boost (unsupported)')
    .option('--subtitles', 'Include subtitle timing data (unsupported)')
    .option('--pronunciation <from/to>', 'Custom pronunciation (repeatable; unsupported)', collectOption)
    .option('--stream', 'Stream raw audio to stdout (unsupported)')
    .action(async (options) => {
      const parentOptions = program.opts();
      try {
        if (!options.text && !options.textFile) {
          throw new UsageError('one of --text / --text-file is required');
        }
        const unsupportedSpeechFlags = ['textFile', 'pitch', 'bitrate', 'channels', 'language', 'subtitles', 'pronunciation', 'stream']
          .filter(name => options[name] !== undefined);
        if (unsupportedSpeechFlags.length > 0) {
          throw new UnsupportedError(
            `stepfun speech synthesize does not support: ${unsupportedSpeechFlags.map(name => `--${toKebab(name)}`).join(', ')}.`,
            'Use --text with the supported voice, format, speed, volume, and sample-rate options.'
          );
        }
        const speed = optionalNumber(options.speed, '--speed', UsageError);
        const volume = optionalNumber(options.volume, '--volume', UsageError);
        const sampleRate = optionalNumber(options.sampleRate, '--sample-rate', UsageError);
  
        let region = resolveRegion(parentOptions);
        let voice = options.voice || (REGION_PROFILES[region].geography === 'Global' ? 'lively-girl' : 'cixingnansheng');
  
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
          dryRun(parentOptions, 'speech synthesize', 'POST', ENDPOINTS.audioSpeech, detail);
          return;
        }

        await ensureRegion(parentOptions);
        region = resolveRegion(parentOptions);
        voice = options.voice || (REGION_PROFILES[region].geography === 'Global' ? 'lively-girl' : 'cixingnansheng');
        const client = getClient(parentOptions);
        maybeShowStatusBar(parentOptions, resolveApiKey(parentOptions), region, resolveBaseUrl(parentOptions, region), resolveSpeechTtsModel(options));
        warnIfUnsupportedNonChat(region, parentOptions.quiet, 'speech synthesize');
        writeProgress(`Synthesizing text to ${options.out}...`, parentOptions.quiet);
        const opts: { response_format?: string; speed?: number; volume?: number; sample_rate?: number } = {};
        if (options.format !== undefined) opts.response_format = options.format;
        if (speed !== undefined) opts.speed = speed;
        if (volume !== undefined) opts.volume = volume;
        if (sampleRate !== undefined) opts.sample_rate = sampleRate;
        const buffer = await client.audioSynthesize(resolveSpeechTtsModel(options), options.text, voice, Object.keys(opts).length ? opts : undefined);
        fs.writeFileSync(options.out, buffer);
        writeProgress('Done.', parentOptions.quiet);
      } catch (err: any) {
        process.exitCode = emitError(err, resolveOutput(parentOptions));
      }
    });

  // Keep the aligned alias as the same command implementation and option set.
  synthesize.alias('generate');
  
  speechCmd.command('recognize')
    .description('Recognize text from speech')
    .requiredOption('-f, --file <file>', 'Audio file path')
    .option('-m, --model <model>', 'Model name', 'stepaudio-2.5-asr')
    .option('--language <code>', 'Language code, e.g. zh or en')
    .option('--hotwords <a,b,c>', 'Comma-separated hotwords')
    .action(async (options) => {
      const parentOptions = program.opts();
      try {
        if (parentOptions.dryRun) {
          const detail: Record<string, unknown> = {
            model: options.model,
            audio: fileStat(options.file)
          };
          if (options.language !== undefined) detail.language = options.language;
          if (options.hotwords !== undefined) detail.hotwords = options.hotwords;
          dryRun(parentOptions, 'speech recognize', 'POST', ENDPOINTS.audioTranscription, detail);
          return;
        }

        await ensureRegion(parentOptions);
        const region = resolveRegion(parentOptions);
        const client = getClient(parentOptions);
        maybeShowStatusBar(parentOptions, resolveApiKey(parentOptions), region, resolveBaseUrl(parentOptions, region), options.model);
        warnIfUnsupportedNonChat(region, parentOptions.quiet, 'speech recognize');
        writeProgress(`Recognizing speech from ${options.file}...`, parentOptions.quiet);
        const opts: { language?: string; hotwords?: string[] } = {};
        if (options.language !== undefined) opts.language = options.language;
        if (options.hotwords !== undefined) opts.hotwords = options.hotwords.split(',').map((s: string) => s.trim()).filter(Boolean);
        const result = await client.audioTranscribe(options.model, options.file, Object.keys(opts).length ? opts : undefined);
  
        if (resolveOutput(parentOptions) === 'json') {
          writeJson(result);
        } else {
          writeText(result.text || result);
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
    .option('-o, --out <path>', 'Write the decoded image to an exact path (unsupported)')
    .action(async (options) => {
      const parentOptions = program.opts();
      try {
        if (options.out !== undefined) {
          throw new UnsupportedError(
            'stepfun image edit --out is not supported yet.',
            'Omit --out and consume the URL or base64 result from stdout.'
          );
        }
        const seed = optionalInteger(options.seed, '--seed', UsageError);
        const steps = optionalInteger(options.steps, '--steps', UsageError);
        const cfgScale = optionalNumber(options.cfgScale, '--cfg-scale', UsageError);
  
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
          dryRun(parentOptions, 'image edit', 'POST', ENDPOINTS.imageEdits, detail);
          return;
        }

        await ensureRegion(parentOptions);
        const region = resolveRegion(parentOptions);
        const client = getClient(parentOptions);
        maybeShowStatusBar(parentOptions, resolveApiKey(parentOptions), region, resolveBaseUrl(parentOptions, region), options.model);
        warnIfUnsupportedNonChat(region, parentOptions.quiet, 'image edit');
        writeProgress(`Editing image ${options.file}...`, parentOptions.quiet);
        const opts: { seed?: number; steps?: number; cfg_scale?: number; negative_prompt?: string } = {};
        if (seed !== undefined) opts.seed = seed;
        if (steps !== undefined) opts.steps = steps;
        if (cfgScale !== undefined) opts.cfg_scale = cfgScale;
        if (options.negativePrompt !== undefined) opts.negative_prompt = options.negativePrompt;
        const result = await client.imageEdit(options.model, options.file, options.prompt, options.responseFormat, Object.keys(opts).length ? opts : undefined);
  
        if (resolveOutput(parentOptions) === 'json') {
          writeJson(result);
        } else {
          const firstImage = result?.data?.[0];
          writeText(firstImage?.url || firstImage?.b64_json || JSON.stringify(result, null, 2));
        }
      } catch (err: any) {
        process.exitCode = emitError(err, resolveOutput(parentOptions));
      }
    });
  
  
}

function toKebab(value: string): string {
  return value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}
