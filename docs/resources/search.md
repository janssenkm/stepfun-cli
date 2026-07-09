# Search Resource

Status: **Unsupported**. Commands are registered for discovery and return `UNSUPPORTED`; no StepFun search endpoint is currently in scope.

## Proposed commands

| Command | Flags | Requirement |
| --- | --- | --- |
| `search query` | `--q <query>` | Execute a web search and return structured results |
| `search web` | `--q <query>` | Alias of `search query` |

If implemented, `--q` is required and aliases must produce identical requests and output. Text output should show title, URL, and summary; JSON output should preserve the complete API response. Pagination flags must not be invented unless the API supports pagination.
