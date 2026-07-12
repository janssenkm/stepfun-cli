# stepfun-cli Product Requirements

## 1. Product definition

`stepfun-cli` is the command-line client for the StepFun **StepPlan** subscription. Package `@stepfun-ai/cli`, executable `stepfun`, Node.js ≥ 18. Grammar: `stepfun <resource> <command> [flags]`.

It implements **only StepFun's real, documented API** (verified against `platform.stepfun.ai/docs`), targeting the StepPlan intersection of the Global and CN sites. No stubs for capabilities StepFun does not expose.

## 2. Resources & commands (v1)

| Resource | Commands | Base |
|---|---|---|
| text | `chat` (OpenAI Completions), `messages` (Anthropic), `responses` (OpenAI Responses) | gen |
| image | `generate`, `edit` | gen |
| speech | `synthesize` (TTS), `recognize` (ASR) | gen |
| token | `count` | gen |
| models | `list`, `get` | mgmt |
| file | `upload`, `list`, `get`, `content`, `delete` | mgmt |
| account | `show` | mgmt |
| auth | `login`, `status`, `logout` | — |
| config | `show`, `set` | — |

## 3. Global flags

`--api-key`, `--region`, `--base-url` (gen override), `--api-base-url` (mgmt override), `--output <text|json>`, `--timeout`, `--quiet`, `--verbose`, `--no-color`, `--dry-run`, `--non-interactive`, `--yes`, `--help`, `--version`.

## 4. Regions

| Region | Generation base | Management base |
|---|---|---|
| StepPlan-Global | `https://api.stepfun.ai/step_plan/v1` | `https://api.stepfun.ai/v1` |
| StepPlan-CN | `https://api.stepfun.com/step_plan/v1` | `https://api.stepfun.com/v1` |

## 5. Exit codes

`0` success · `1` general · `2` usage · `3` auth · `4` quota/rate-limit · `5` timeout · `6` network · `10` content-filter. Mapped from StepFun HTTP codes (400→2, 401/403→3, 402→4, 404→1, 429→4, 451→10, 5xx→1).

## 6. Output contract

- Text mode: human-friendly tables/lines; reasoning and usage to stderr.
- JSON mode: valid JSON on stdout (auto when piped). Streaming commands buffer and emit structured JSON in JSON mode, print deltas live in text mode.
- `--dry-run`: prints `{method, path, body}` and exits 0 without network.
- Binary (image/audio): raw bytes to stdout unless `--out`/`--out-dir`.

## 7. Out of scope (v1)

Voice management, WebSocket streaming TTS, realtime/chat audio models, smart router, MCP. See `docs/resources/*` for per-command flags.
