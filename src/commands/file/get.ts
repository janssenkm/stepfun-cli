import { defineCommand } from '../../command';
import { getFile } from '../../api/files';
import { formatOutput, dryRun } from '../../output/formatter';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'file get',
  description: 'Get metadata for a stored file',
  usage: 'stepfun file get <id>',
  examples: ['stepfun file get file-abc123'],
  apiDocs: '/docs/en/api-reference/files/retrieve',
  async run(config, flags) {
    const id = (flags._positional?.[0] as string | undefined) || (flags.id as string | undefined);
    if (!id) throw new CLIError('File id required.', ExitCode.USAGE, 'Usage: stepfun file get <id>');
    if (dryRun(config, { method: 'GET', path: `/files/${encodeURIComponent(id)}` })) return;
    const obj = await getFile(config, id);
    process.stdout.write(formatOutput(obj, config.output) + '\n');
  },
});
