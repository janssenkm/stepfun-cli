import { defineCommand } from '../../command';
import { getModel } from '../../api/models';
import { formatOutput } from '../../output/formatter';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'models get',
  description: 'Get details for a single model',
  usage: 'stepfun models get <id>',
  examples: ['stepfun models get step-3.7-flash'],
  apiDocs: '/docs/en/api-reference/models/retrieve',
  async run(config, flags) {
    const id = (flags._positional?.[0] as string | undefined) || (flags.id as string | undefined);
    if (!id) throw new CLIError('Model id required.', ExitCode.USAGE, 'Usage: stepfun models get <id>');
    const model = await getModel(config, id);
    process.stdout.write(formatOutput(model, config.output) + '\n');
  },
});
