# Text Resource

Status: **Partial**. `chat` is supported; interactive `repl` is registered but returns `UNSUPPORTED`.

## `text chat`

```text
stepfun text chat [flags]
```

| Flag | Requirement |
| --- | --- |
| `--model <model>` | Select a text model; configuration and built-in defaults apply |
| `--message <text>` | Repeatable message; optional `system:`, `user:`, or `assistant:` role prefix |
| `--messages-file <path|->` | Read a JSON message array from a file or stdin |
| `--system <text>` | Prepend a system instruction |
| `--max-tokens <int>` | Positive maximum output token count |
| `--temperature <number>` | Sampling temperature |
| `--top-p <number>` | Nucleus sampling probability |
| `--reasoning-effort <low|medium|high>` | Optional reasoning depth |
| `--reasoning-format <format>` | Optional reasoning field format |
| `--stop <text>` | Repeatable stop sequence |
| `--frequency-penalty <number>` | Frequency penalty from 0.0 to 1.0 |
| `--response-format <text|json_object>` | Model response format |
| `-n, --n <count>` | Number of responses; values above 1 require `--output json` |
| `--stream` / `--no-stream` | Explicitly control SSE streaming |
| `--tool <json-or-path>` | Registered repeatable tool definition; returns `UNSUPPORTED` until tool calls are fully specified |

At least one `--message` or `--messages-file` is required. Repeated messages preserve order. JSON output disables streaming because it requires a complete response object. Text output streams by default on a TTY.

## `text repl`

Registered flags are `--model`, `--system`, `--max-tokens`, `--temperature`, and `--top-p`. The command returns `UNSUPPORTED` until implementation. The eventual REPL must retain conversation history, support an explicit exit command, and keep results on stdout and controls on stderr.

Examples:

```bash
stepfun text chat --message "Hello" --model step-3.7-flash
stepfun text chat --message "system:Answer briefly" --message "user:Hello" --output json
stepfun text chat --messages-file messages.json --no-stream
```
