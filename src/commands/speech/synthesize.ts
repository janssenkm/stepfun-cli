import { defineCommand } from '../../command';
import { synthesize, type SpeechOpts } from '../../api/audio';
import { dryRun } from '../../output/formatter';
import { extForAudioFormat } from '../../utils/mime';
import { readStdin, saveBytes } from '../../utils/fs';
import { readFileSync } from 'fs';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { maxLength, mutuallyExclusive, numberRange, oneOf } from '../../utils/validation';

function parseVoiceLabel(raw: string): Record<string, string> {
  const idx = raw.indexOf(':');
  if (idx === -1) throw new CLIError(`--voice-label format: "<lang|emotion|style>:<value>"`, ExitCode.USAGE);
  let key = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (key === 'lang') key = 'language';
  if (!['language', 'emotion', 'style'].includes(key)) {
    throw new CLIError(`--voice-label key must be lang|emotion|style`, ExitCode.USAGE);
  }
  return { [key]: value };
}

export default defineCommand({
  name: 'speech synthesize',
  description: 'Text-to-speech (POST /audio/speech)',
  usage: 'stepfun speech synthesize (--text <text> | --text-file <path>) [--voice <id>] [flags]',
  options: [
    { flag: '--model <model>', description: 'TTS model (default: stepaudio-2.5-tts; step-tts-2 is not in StepPlan)' },
    { flag: '--text <text>', description: 'Text to synthesize (≤1000 chars)' },
    { flag: '--text-file <path>', description: 'Read text from file (- for stdin)' },
    { flag: '--voice <id>', description: 'Voice id' },
    { flag: '--format <fmt>', description: 'wav | mp3 | flac | opus | pcm (default: mp3)' },
    { flag: '--speed <n>', description: '0.5–2.0', type: 'number' },
    { flag: '--volume <n>', description: '0.1–2.0', type: 'number' },
    { flag: '--sample-rate <hz>', description: '8000|16000|22050|24000|48000', type: 'number' },
    { flag: '--pronunciation <from/to>', description: 'Pronunciation map entry (repeatable)', type: 'array' },
    { flag: '--instruction <text>', description: 'Global instruction (stepaudio-2.5-tts only, ≤200 chars)' },
    { flag: '--voice-label <k:v>', description: 'lang|emotion|style : value (step-tts-2 only)' },
    { flag: '--markdown-filter', description: 'Enable markdown filtering' },
    { flag: '--stream', description: 'Stream audio via SSE (speech.audio.delta)' },
    { flag: '--out <path>', description: 'Save audio to file (default: write to stdout)' },
  ],
  examples: ['stepfun speech synthesize --text "你好，阶跃" --out out.mp3'],
  apiDocs: '/docs/en/api-reference/audio/create-audio',
  async run(config, flags) {
    const model = (flags.model as string | undefined) || config.defaultSpeechTtsModel || 'stepaudio-2.5-tts';
    let text = flags.text as string | undefined;
    if (!text && flags.textFile) {
      text = flags.textFile === '-' ? await readStdin() : readFileSync(flags.textFile as string, 'utf-8');
    }
    if (!text) throw new CLIError('--text or --text-file is required.', ExitCode.USAGE);
    mutuallyExclusive('--text', flags.text, '--text-file', flags.textFile);

    const voice = (flags.voice as string | undefined) || 'lively-girl';
    const format = (flags.format as string | undefined) || 'mp3';
    maxLength('--text', text, 1000);
    maxLength('--instruction', flags.instruction as string | undefined, 200);
    oneOf('--format', format, ['wav', 'mp3', 'flac', 'opus', 'pcm']);
    numberRange('--speed', flags.speed as number | undefined, 0.5, 2);
    numberRange('--volume', flags.volume as number | undefined, 0.1, 2);
    if (flags.sampleRate !== undefined) {
      const rate = flags.sampleRate as number;
      if (![8000, 16000, 22050, 24000, 48000].includes(rate)) {
        throw new CLIError('--sample-rate must be one of: 8000, 16000, 22050, 24000, 48000.', ExitCode.USAGE);
      }
    }

    const opts: SpeechOpts = {
      model,
      input: text,
      voice,
      responseFormat: format,
      speed: flags.speed as number | undefined,
      volume: flags.volume as number | undefined,
      sampleRate: flags.sampleRate as number | undefined,
      pronunciationMap: flags.pronunciation as string[] | undefined,
      instruction: flags.instruction as string | undefined,
      voiceLabel: flags.voiceLabel ? parseVoiceLabel(flags.voiceLabel as string) : undefined,
      markdownFilter: flags.markdownFilter !== undefined ? !!flags.markdownFilter : undefined,
      streamFormat: flags.stream ? 'sse' : undefined,
    };

    if (dryRun(config, { method: 'POST', path: '/audio/speech', body: { ...opts, input: text.slice(0, 60) + '…' } })) return;

    const outPath = flags.out as string | undefined;
    // For stdout streaming, write decoded chunks live; for --out, accumulate.
    const onChunk = outPath ? undefined : (b: Buffer) => process.stdout.write(b);
    const buffer = await synthesize(config, opts, onChunk);

    if (outPath) {
      const path = outPath.endsWith('.') || !/\.[a-z0-9]+$/i.test(outPath)
        ? `${outPath}.${extForAudioFormat(format)}`
        : outPath;
      await saveBytes(path, buffer);
      if (config.output === 'json') {
        process.stdout.write(JSON.stringify({ saved: path, bytes: buffer.length, model, voice, format }, null, 2) + '\n');
      } else if (!config.quiet) {
        process.stderr.write(`Saved ${path} (${buffer.length} bytes)\n`);
      }
    } else if (config.output === 'json' && !config.quiet) {
      process.stderr.write(JSON.stringify({ bytes: buffer.length, model, voice, format }) + '\n');
    }
  },
});
