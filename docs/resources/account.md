# Account Resource

Status: **Supported**. Management base (`/v1`). `GET /accounts` returns account type and balances (open-platform balance, separate from your StepPlan subscription quota).

## Commands

```
account show
```

## Example

```bash
stepfun account show
# type: prepaid  balance: 0.01  cash: 96  voucher: 100
```
