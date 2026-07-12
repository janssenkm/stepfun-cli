import { defineCommand } from '../../command';
import { getFileContent } from '../../api/files';
import { saveBytes } from '../../utils/fs';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'file content',
  description: 'Download a stored file’s content',
  usage: 'stepfun file content <id> [--out <path>]',
  options: [{ flag: '--out <path>', description: 'Save content to this path (default: write to stdout)' }],
  examples: ['stepfun file content file-abc123 --out out.png'],
  apiDocs: '/docs/en/api-reference/files/retrieve-content',
  async run(config, flags) {
    const id = (flags._positional?.[0] as string | undefined) || (flags.id as string | undefined);
    if (!id) throw new CLIError('File id required.', ExitCode.USAGE, 'Usage: stepfun file content <id>');
    const out = flags.out as string | undefined;
    const res = await getFileContent(config, id);
    const buf = Buffer.from(await res.arrayBuffer());
    if (out) {
      await saveBytes(out, buf);
      process.stderr.write(`Saved ${buf.length} bytes to ${out}\n`);
      return;
    }
    // Write raw bytes to stdout (binary-safe).
    process.stdout.write(buf);
  },
});
