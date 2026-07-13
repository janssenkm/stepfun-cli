import { defineCommand } from '../../command';
import { uploadFile } from '../../api/files';
import { formatOutput, dryRun } from '../../output/formatter';
import { ensureFileExists, describeFile } from '../../utils/fs';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { oneOf } from '../../utils/validation';
import { statSync } from 'fs';

export default defineCommand({
  name: 'file upload',
  description: 'Upload a file to StepFun storage',
  usage: 'stepfun file upload (--file <path> | --url <url>) [--purpose <purpose>]',
  options: [
    { flag: '--file <path>', description: 'Local file to upload' },
    { flag: '--url <url>', description: 'Remote file URL (alternative to --file)' },
    { flag: '--purpose <purpose>', description: 'Upload purpose (default: storage)' },
  ],
  examples: ['stepfun file upload --file image.png', 'stepfun file upload --url https://example.com/a.mp3'],
  apiDocs: '/docs/en/api-reference/files/create',
  async run(config, flags) {
    const file = flags.file as string | undefined;
    const url = flags.url as string | undefined;
    const purpose = (flags.purpose as string | undefined) || 'storage';
    oneOf('--purpose', purpose, ['storage']);

    if (!file && !url) {
      throw new CLIError('Either --file or --url is required.', ExitCode.USAGE);
    }
    if (file && url) {
      throw new CLIError('Pass either --file or --url, not both.', ExitCode.USAGE);
    }
    if (file) {
      ensureFileExists(file, 'file');
      const info = describeFile(file);
      if (!statSync(info.path).isFile()) throw new CLIError('--file must be a regular file.', ExitCode.USAGE);
      if (info.size > 128 * 1024 * 1024) throw new CLIError('--file must not exceed 128 MB.', ExitCode.USAGE);
      if (!['mp4', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp3', 'wav'].includes(info.ext)) {
        throw new CLIError('--file has an unsupported type.', ExitCode.USAGE);
      }
    }

    const request = file
      ? { file: describeFile(file), purpose }
      : { url, purpose };

    if (dryRun(config, { method: 'POST', path: '/files', request })) return;

    const obj = await uploadFile(config, { path: file, url, purpose });
    if (config.quiet) {
      process.stdout.write(obj.id + '\n');
      return;
    }
    process.stdout.write(formatOutput(obj, config.output) + '\n');
  },
});
