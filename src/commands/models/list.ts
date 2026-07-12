import { defineCommand } from '../../command';
import { listModels } from '../../api/models';
import { formatOutput } from '../../output/formatter';

export default defineCommand({
  name: 'models list',
  description: 'List models available to your account',
  usage: 'stepfun models list',
  apiDocs: '/docs/en/api-reference/models/list',
  async run(config) {
    const { data } = await listModels(config);
    if (config.output === 'json') {
      process.stdout.write(formatOutput(data, 'json') + '\n');
      return;
    }
    if (data.length === 0) {
      process.stdout.write('No models available.\n');
      return;
    }
    const ids = data.map((m) => m.id).sort();
    const w = Math.max(...ids.map((s) => s.length));
    for (const m of data) {
      process.stdout.write(`${m.id.padEnd(w + 2)} ${m.owned_by ?? ''}\n`);
    }
  },
});
