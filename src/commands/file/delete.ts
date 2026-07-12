import { defineCommand } from '../../command';
import { deleteFile } from '../../api/files';
import { formatOutput } from '../../output/formatter';
import { isInteractive } from '../../utils/env';
import { confirm } from '../../utils/prompt';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'file delete',
  description: 'Delete a stored file',
  usage: 'stepfun file delete <id>',
  options: [{ flag: '--yes', description: 'Skip the confirmation prompt' }],
  examples: ['stepfun file delete file-abc123 --yes'],
  apiDocs: '/docs/en/api-reference/files/delete',
  async run(config, flags) {
    const id = (flags._positional?.[0] as string | undefined) || (flags.id as string | undefined);
    if (!id) throw new CLIError('File id required.', ExitCode.USAGE, 'Usage: stepfun file delete <id>');

    if (!flags.yes && isInteractive({ nonInteractive: config.nonInteractive })) {
      const ok = await confirm({ message: `Delete file ${id}?`, defaultYes: false });
      if (!ok) {
        process.stderr.write('Cancelled.\n');
        return;
      }
    }

    const res = await deleteFile(config, id);
    if (config.quiet) {
      process.stdout.write(String(res.deleted ?? true) + '\n');
      return;
    }
    process.stdout.write(formatOutput({ id, deleted: res.deleted ?? true }, config.output) + '\n');
  },
});
