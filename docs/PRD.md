# StepFun-CLI Product Requirements

## 1. Product definition

StepFun-CLI is the NPM-first command-line client for StepFun APIs. The package is `@stepfun-ai/cli`, the executable is `stepfun`, and Node.js 18 or later is required. The command grammar is:

```text
stepfun <resource> <command> [flags]
stepfun update [flags]
```

`update` is a singleton Resource and therefore has no child command. Global flags must work before or after a Resource and Command. Resource and Command help must be discoverable with:

```bash
stepfun <resource> --help
stepfun <resource> <command> --help
```

## 2. Goals

1. Provide a consistent Resource-oriented interface for StepFun APIs.
2. Align common CLI names and output semantics across Resources.
3. Distinguish implemented, planned, and unsupported capabilities.
4. Support interactive terminals and deterministic automation.
5. Prevent credentials, binary content, and private reasoning from leaking.

## 3. Requirement status

| Status | Meaning |
| --- | --- |
| Supported | Implemented and part of the current compatibility contract |
| Partial | Some required Commands or flags are implemented |
| Planned | Product requirement is defined but implementation is pending |
| Unsupported | Registered for discovery and returns a structured unsupported error without calling an API |

## 4. Resource catalog

| Resource | Commands | Status | Specification |
| --- | --- | --- | --- |
| `auth` | `login`, `status`, `refresh`, `logout` | Partial | [auth](resources/auth.md) |
| `text` | `chat`, `repl` | Partial | [text](resources/text.md) |
| `speech` | `synthesize`, `generate`, `recognize`, `voices` | Partial | [speech](resources/speech.md) |
| `image` | `edit`, `generate` | Partial | [image](resources/image.md) |
| `video` | `generate`, `task get`, `download` | Unsupported | [video](resources/video.md) |
| `music` | `generate`, `cover` | Unsupported | [music](resources/music.md) |
| `search` | `query`, `web` | Unsupported | [search](resources/search.md) |
| `vision` | `describe` | Unsupported | [vision](resources/vision.md) |
| `quota` | `show` | Unsupported | [quota](resources/quota.md) |
| `config` | `show`, `set`, `export-schema` | Supported | [config](resources/config.md) |
| `file` | `upload`, `list`, `get`, `content`, `delete` | Supported | [file](resources/file.md) |
| `models` | `list` | Supported | [models](resources/models.md) |
| `update` | None | Supported | [update](resources/update.md) |

Unsupported Resources describe future-facing requirements and appear in runtime help for discovery. Executing one must return exit code 2 with error code `UNSUPPORTED`; it must not require authentication or call an API.

## 5. Global flags

| Flag | Requirement |
| --- | --- |
| `--api-key <key>` | Override environment and configuration authentication |
| `--region <region>` | Select `StepPlan-Global`/`Global` or `StepPlan-CN`/`CN` |
| `--base-url <url>` | Override the Region Base URL |
| `--output <text|json>` | Select presentation format; never means a file path |
| `--timeout <seconds>` | Set a positive request timeout; default 300 |
| `--dry-run` | Print a safe request summary without authentication or networking |
| `--non-interactive` | Disable prompts and require explicit confirmation flags |
| `--quiet` | Suppress non-essential progress and warnings |
| `--verbose` | Emit diagnostic request and response metadata without secrets |
| `--no-color` | Disable ANSI presentation |

Resolution precedence is `flag > environment > config > default`. The environment keys are `STEPFUN_API_KEY`, `STEPFUN_REGION`, `STEPFUN_BASE_URL`, `STEPFUN_OUTPUT`, and `STEPFUN_TIMEOUT`.

## 6. Output parameter contract

Output parameters have separate, non-overlapping meanings:

| Flag | Meaning | Applicability |
| --- | --- | --- |
| `--output <text|json>` | CLI presentation format | Global |
| `--out <path>` | Exact destination for one generated or downloaded file | Command-local |
| `--out-dir <directory>` | Destination for multiple generated files | Planned, only when an API returns multiple files |
| `--out-prefix <prefix>` | Filename prefix used with `--out-dir` | Planned, only with multi-file output |
| `--response-format <format>` | API response representation, such as `url` or `b64_json` | Image APIs |
| `--format <format>` | Media encoding, such as `mp3` or `wav` | Speech and future media APIs |
| `--output-format <format>` | API-specific output transport | Reserved; do not expose without an API requirement |
| `--stream` / `--no-stream` | Enable or disable incremental response delivery | Commands with streaming APIs |
| `--download` | Download an asynchronously generated artifact | Reserved for an API that returns downloadable artifacts |

No command may define a local `--output <file>`. Single-file writers must use `--out <path>`. Reserved flags such as `--out-dir`, `--out-prefix`, `--output-format`, and `--download` may be shown by an explicitly unsupported command for interface discovery, but a supported command must not expose them until the StepFun API capability exists.

## 7. Regions

| Region | Base URL |
| --- | --- |
| `StepPlan-Global` | `https://api.stepfun.ai/step_plan/v1` |
| `StepPlan-CN` | `https://api.stepfun.com/step_plan/v1` |

Aliases are `Global` and `CN`; `StepFun-Global` is accepted for compatibility. With an API key and no explicit Region or custom Base URL, supported API commands and `auth status` probe both Region endpoints through `GET /models`, trying Bearer and `x-api-key` authentication. The canonical result is cached. If every probe fails, the CLI caches and uses `StepPlan-Global`. Explicit Region sources never trigger detection. Dry run, help, version, unsupported commands, and local commands never trigger detection. `auth login` always requires manual Region selection. StepPlan officially covers chat/reasoning endpoints only, so other API Resources warn unless quiet.

## 8. Supported models

- Text: `step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- Speech: `stepaudio-2.5-tts`, `stepaudio-2.5-asr`
- Image: `step-image-edit-2`

## 9. Cross-cutting behavior

- stdout is reserved for command results; diagnostics and errors use stderr.
- TTY output defaults to `text`; redirected output defaults to `json`.
- JSON errors use `{ "error": { "code": "...", "message": "...", "hint": "..." } }`.
- Dry run must not require an API key, create a client, call the network, read binary content, or reveal secrets.
- API keys are masked in `auth status` and `config show`.
- Streaming parsers must handle SSE comments, CRLF, multi-line data, and an unterminated final event.
- Private reasoning is never printed. A generic thinking indicator may be written to stderr unless quiet.

## 10. Exit codes

| Code | Type | Scenario |
| --- | --- | --- |
| 0 | OK | Success |
| 1 | API_ERROR | Non-authentication API or general failure |
| 2 | USAGE | Invalid arguments or missing confirmation |
| 3 | AUTH | Missing key, HTTP 401, or HTTP 403 |
| 4 | QUOTA | HTTP 402 balance insufficient, 429 rate/resource limit |
| 5 | TIMEOUT | HTTP 408/504, request timed out |
| 6 | NETWORK | Fetch, DNS, connection, or timeout failure |
| 10 | CONTENT_FILTER | HTTP 451, content moderation blocked |

## 11. Acceptance criteria

- Runtime help, README, design documentation, tests, and Resource specifications agree.
- Tests protect Region aliases, dual-endpoint/dual-auth detection, Global fallback, and caching.
- Global flags work both before and after nested Commands.
- Speech synthesis uses `--out`, not a command-local `--output`.
- Unsupported Resources are discoverable and return `UNSUPPORTED` without network access.
- `config export-schema` is generated from the live command tree and includes canonical and alias command paths.
- Progress output never contaminates stdout command results.
- `npm test`, `npm run build`, and `npm pack --dry-run` pass.
