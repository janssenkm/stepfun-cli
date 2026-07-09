# Auth Resource

Status: **Partial**. `login`, `status`, and `logout` are supported; `refresh` is registered but returns `UNSUPPORTED` because the CLI currently uses API keys rather than refreshable OAuth credentials.

## Commands

| Command | Flags | Requirement |
| --- | --- | --- |
| `stepfun auth login` | Global flags | Interactively select Region and securely enter an API key. `--non-interactive` must fail with guidance. |
| `stepfun auth status` | Global flags | Show authenticated state, credential source, masked key, Region, and Base URL. |
| `stepfun auth refresh` | None | Return `UNSUPPORTED` until StepFun CLI authentication uses refreshable OAuth tokens. |
| `stepfun auth logout` | `--yes` | Confirm before clearing local credentials; `--yes` is mandatory in non-interactive mode. |

Credentials are stored at `~/.stepfun-cli/config.json`. Status output must never reveal the complete key. Logout removes persisted configuration but does not mutate environment variables.

Examples:

```bash
stepfun auth login
stepfun auth status --output json
stepfun auth logout --yes --non-interactive
```
