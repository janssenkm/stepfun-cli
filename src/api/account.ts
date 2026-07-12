import { requestJson } from '../client/http';
import { mgmtUrl } from '../client/urls';
import type { Config } from '../config/schema';

// Account balance — management base (/v1). This is the open-platform balance,
// separate from your StepPlan subscription quota.

export interface Account {
  object: 'account';
  type: string; // prepaid | postpaid
  balance: number;
  total_cash_balance: number;
  total_voucher_balance: number;
}

export async function getAccount(config: Config): Promise<Account> {
  return requestJson<Account>(config, { url: mgmtUrl(config, '/accounts') });
}
