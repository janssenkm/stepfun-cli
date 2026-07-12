# Auth Resource

Status: **Supported**. API-key based (StepPlan does not use OAuth in this CLI).

## Commands

```
auth login [--api-key <key>] [--region <StepPlan-Global|StepPlan-CN>]
auth status
auth logout
```

`auth login` saves the key to `~/.stepfun-cli/config.json` (0600). If run without flags in a TTY, it prompts interactively. `auth status` shows the masked key, region, and resolved base URLs. `auth logout` removes the key (prompts unless `--yes`/`--non-interactive`).

## Example

```bash
stepfun auth login --api-key sk-... --region StepPlan-Global
stepfun auth status
stepfun auth logout
```
