import { defineCommand } from '../../command';
import { listFiles } from '../../api/files';
import { formatOutput } from '../../output/formatter';
import { mutuallyExclusive, numberRange, oneOf } from '../../utils/validation';
import { dryRun } from '../../output/formatter';

export default defineCommand({
  name: 'file list',
  description: 'List stored files',
  usage: 'stepfun file list [--limit <n>] [--order <asc|desc>]',
  options: [
    { flag: '--limit <n>', description: 'Page size', type: 'number' },
    { flag: '--order <order>', description: 'asc | desc' },
    { flag: '--before <id>', description: 'Cursor: return items before this id' },
    { flag: '--after <id>', description: 'Cursor: return items after this id' },
  ],
  apiDocs: '/docs/en/api-reference/files/list',
  async run(config, flags) {
    numberRange('--limit', flags.limit as number | undefined, 1, Number.MAX_SAFE_INTEGER, true);
    if (flags.order) oneOf('--order', flags.order as string, ['asc', 'desc']);
    mutuallyExclusive('--before', flags.before, '--after', flags.after);
    const query = new URLSearchParams();
    if (flags.limit !== undefined) query.set('limit', String(flags.limit));
    if (flags.order) query.set('order', String(flags.order));
    if (flags.before) query.set('before', String(flags.before));
    if (flags.after) query.set('after', String(flags.after));
    const qs = query.toString();
    if (dryRun(config, { method: 'GET', path: `/files${qs ? `?${qs}` : ''}` })) return;
    const { data } = await listFiles(config, {
      limit: flags.limit as number | undefined,
      order: flags.order as 'asc' | 'desc' | undefined,
      before: flags.before as string | undefined,
      after: flags.after as string | undefined,
    });
    if (config.output === 'json') {
      process.stdout.write(formatOutput(data, 'json') + '\n');
      return;
    }
    if (data.length === 0) {
      process.stdout.write('No files.\n');
      return;
    }
    for (const f of data) {
      process.stdout.write(`${f.id}  ${f.filename ?? ''}  ${f.bytes ?? '?'}B  ${f.status ?? ''}\n`);
    }
  },
});
