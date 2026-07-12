import { defineCommand } from '../../command';
import { getAccount } from '../../api/account';
import { formatOutput } from '../../output/formatter';

export default defineCommand({
  name: 'account show',
  description: 'Show account balance and type',
  usage: 'stepfun account show',
  apiDocs: '/docs/en/api-reference/accounts/get',
  async run(config) {
    const acc = await getAccount(config);
    if (config.output === 'json') {
      process.stdout.write(formatOutput(acc, 'json') + '\n');
      return;
    }
    process.stdout.write(`Account\n`);
    process.stdout.write(`  type:        ${acc.type}\n`);
    process.stdout.write(`  balance:     ${acc.balance}\n`);
    process.stdout.write(`  cash:        ${acc.total_cash_balance}\n`);
    process.stdout.write(`  voucher:     ${acc.total_voucher_balance}\n`);
  },
});
