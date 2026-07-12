import { defineCommand } from '../../command';
import { transcribe } from '../../api/audio';
import { dryRun } from '../../output/formatter';
import { readFileBytes, describeFile, ensureFileExists } from '../../utils/fs';
import { asrFormatTypeForExt } from '../../utils/mime';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'speech recognize',
  description: 'Speech recognition via streaming ASR (POST /audio/asr/sse)',
  usage: 'stepfun speech recognize --file <path> [flags]',
  options: [
    { flag: '--file <path>', description: 'Audio file (mp3, wav, ogg, or pcm)', required: true },
    { flag: '--model <model>', description: 'ASR model (default: stepaudio-2.5-asr)' },
    { flag: '--language <code>', description: 'e.g. zh, en' },
    { flag: '--hotwords <word>', description: 'Hotword (repeatable)', type: 'array' },
    { flag: '--enable-itn', description: 'Enable ITN text normalization' },
    { flag: '--enable-timestamp', description: 'Return word timestamps' },
    { flag: '--format-type <fmt>', description: 'ogg | mp3 | wav | pcm (auto-detected from --file)' },
    { flag: '--rate <hz>', description: 'Sample rate (required for pcm)', type: 'number' },
    { flag: '--bits <n>', description: 'Bit depth (required for pcm)', type: 'number' },
    { flag: '--channel <n>', description: 'Channel count (required for pcm)', type: 'number' },
  ],
  examples: ['stepfun speech recognize --file recording.mp3 --language zh'],
  apiDocs: '/docs/en/api-reference/audio/asr-sse',
  async run(config, flags) {
    const file = flags.file as string | undefined;
    if (!file) throw new CLIError('--file is required.', ExitCode.USAGE);
    ensureFileExists(file, 'audio file');

    const model = (flags.model as string | undefined) || config.defaultSpeechAsrModel || 'stepaudio-2.5-asr';
    const { ext } = describeFile(file);
    const formatType = (flags.formatType as string | undefined) || asrFormatTypeForExt(ext);

    if (formatType === 'pcm') {
      if (flags.rate === undefined || flags.bits === undefined || flags.channel === undefined) {
        throw new CLIError('pcm format requires --rate, --bits, --channel.', ExitCode.USAGE);
      }
    }

    const dataB64 = (await readFileBytes(file)).toString('base64');

    const opts = {
      dataB64,
      model,
      language: flags.language as string | undefined,
      hotwords: flags.hotwords as string[] | undefined,
      enableItn: flags.enableItn as boolean | undefined,
      enableTimestamp: flags.enableTimestamp as boolean | undefined,
      formatType,
      rate: flags.rate as number | undefined,
      bits: flags.bits as number | undefined,
      channel: flags.channel as number | undefined,
    };

    if (dryRun(config, { method: 'POST', path: '/audio/asr/sse', request: { file, model, format: formatType } })) return;

    if (config.output === 'text' && !config.quiet) {
      // Stream deltas live to stdout; the buffered result is unused in this branch.
      await transcribe(config, opts, (d) => process.stdout.write(d));
      process.stdout.write('\n');
      return;
    }

    const result = await transcribe(config, opts);
    process.stdout.write(JSON.stringify({ text: result.text, usage: result.usage ?? null }, null, 2) + '\n');
  },
});
