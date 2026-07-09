# StepFun-CLI Repository Guidelines

## 1. Project identity

The project is `StepFun-CLI`, the NPM package is `@stepfun-ai/cli`, and the global command is `stepfun`. It exposes StepFun model capabilities in a terminal.

Distribution is NPM-first:

- NPM entry point: `dist/index.js`
- `package.json#bin.stepfun`: `dist/index.js`
- Package documentation: `README.md` and `README-CN.md`
- Runtime: Node.js 18 or later
- Standalone executables are optional release artifacts, not the default installation path

Standalone output paths are fixed:

```text
bin/
  linux/x64/stepfun
  macos/x64/stepfun
  windows/x64/stepfun.exe
```

## 2. Architecture and technology

- Language: Node.js 18+ and TypeScript
- CLI framework: `commander`
- Interactive prompts: `prompts`
- HTTP: native Node.js 18 `fetch`
- Multipart: native `FormData` and `Blob`
- Build: `tsc` emits CommonJS into `dist/`
- Optional packaging: `npm run pkg` downloads `pkg@5.8.1` on demand

Do not reintroduce `node-fetch`, `form-data`, `dotenv`, `tsup`, or a local `pkg` development dependency unless a concrete requirement also updates this file, README, PRD, and design documentation.

## 3. Supported models

- Text/chat: `step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- TTS: `stepaudio-2.5-tts`
- ASR: `stepaudio-2.5-asr`
- Image editing: `step-image-edit-2`

Adding a model capability requires synchronized changes to:

- model lists and command options in `src/commands/`;
- API wrappers in `src/api.ts`;
- `README.md` and `README-CN.md`;
- `docs/PRD.md` and `docs/DESIGN.md`;
- relevant tests.

## 4. API Region mapping

API URL, Region, and Base URL changes must preserve these exact mappings:

| Region | Description | Base URL |
| --- | --- | --- |
| `StepPlan-Global` | Global StepPlan only | `https://api.stepfun.ai/step_plan/v1` |
| `StepPlan-CN` | China StepPlan only | `https://api.stepfun.com/step_plan/v1` |

Aliases are `Global` and `CN`; `StepFun-Global` is accepted for compatibility. With an API key and no Region or custom Base URL, probe both endpoints using Bearer and `x-api-key`, cache the canonical result, and fall back to `StepPlan-Global`. `auth login` still requires manual selection. Speech and image commands warn about StepPlan coverage unless quiet.

## 5. Configuration and authentication

The configuration path is fixed:

```text
~/.stepfun-cli/config.json
```

Resolution precedence is fixed:

```text
flag > environment > config > default
```

Supported environment variables:

- `STEPFUN_API_KEY`
- `STEPFUN_REGION`
- `STEPFUN_BASE_URL`
- `STEPFUN_OUTPUT`
- `STEPFUN_TIMEOUT`

Authentication commands:

- `stepfun auth login`: interactively select Global or CN and read a hidden API key.
- `stepfun auth status`: show status, source, masked key, Region, and Base URL.
- `stepfun auth logout [--yes]`: clear local credentials and configuration.

`auth status` and `config show` must mask API keys. Dry run, errors, verbose output, and diagnostics must not expose keys or binary file contents.

## 6. Commands and options

Current command tree:

```text
stepfun
  update
  auth login
  auth logout [--yes]
  auth status
  auth refresh (unsupported)
  config set <key> <value> | --key <key> --value <value>
  config show
  config export-schema [--command <path>]
  models list
  text chat
  text repl (unsupported)
  speech synthesize|generate
  speech recognize
  speech voices (unsupported)
  image edit
  image generate (unsupported)
  file upload
  file list
  file get <file-id>
  file content <file-id> [-o, --out <path>]
  file delete <file-id> [--yes]
  video generate | task get | download (unsupported)
  music generate | cover (unsupported)
  search query|web (unsupported)
  vision describe (unsupported)
  quota show (unsupported)
```

Unsupported commands are discoverable in help and must return exit code 2 with a structured `UNSUPPORTED` error without authentication or network access.

Global options:

- `--api-key <key>`
- `--region <region>`
- `--base-url <url>`
- `--output <text|json>`
- `--timeout <seconds>`
- `--dry-run`
- `--non-interactive`
- `--quiet`
- `--verbose`
- `--no-color`

Dry run must:

- work without an API key;
- avoid creating an API client;
- avoid network requests;
- print a request summary;
- represent files only as path/size or path/error.

## 7. Output and errors

Default output:

- stdout is a TTY: `text`
- stdout is not a TTY: `json`
- `--output`, `STEPFUN_OUTPUT`, and configuration may override detection

Errors always go to stderr. JSON errors use:

```json
{
  "error": {
    "code": "AUTH",
    "message": "...",
    "hint": "..."
  }
}
```

Exit codes:

| Code | Type | Scenario |
| --- | --- | --- |
| `0` | OK | Success |
| `1` | API_ERROR | Non-authentication API error |
| `2` | USAGE | Invalid arguments, unknown config key, or missing confirmation |
| `3` | AUTH | Missing API key, HTTP 401, or HTTP 403 |
| `4` | QUOTA | HTTP 402 balance insufficient or 429 rate/resource limit |
| `5` | TIMEOUT | HTTP 408/504 or request timed out |
| `6` | NETWORK | Fetch, DNS, connection, or timeout failure |
| `10` | CONTENT_FILTER | HTTP 451 or content moderation blocked |

## 8. Development and release

Common commands:

```bash
npm install
npm run build
npm test
npm pack --dry-run
```

Build output:

```text
dist/
  api.js
  cli/
  client/
  commands/
  config/
  config.js
  index.js
  update.js
  version.js
```

Optional packaging:

```bash
npm run pkg
```

This downloads `pkg@5.8.1` on demand and writes `bin/{os}/x64/stepfun(.exe)`. `bin/` must not be included in the NPM package.

## 9. Documentation responsibilities

- `README.md`: English user installation, configuration, commands, development, and release documentation.
- `README-CN.md`: synchronized Chinese user documentation.
- `docs/PRD.md`: product scope, requirements, and acceptance criteria in English.
- `docs/DESIGN.md`: architecture, configuration, HTTP, output, errors, security, and testing in English.
- `AGENTS.md`: mandatory repository rules in English.

Code comments must be English. User-facing localized strings may remain Chinese where required by the interface. Do not duplicate the complete README inside `AGENTS.md`; keep only durable constraints here.

## 10. Development execution

- `npm run build` runs `tsc` only (no separate typecheck or lint step exists).
- `npm test` runs `npm run build && node --test test/*.test.js`.
- Tests use Node's built-in `node:test` runner, not Jest or Mocha.
- Each test spawns the compiled `dist/index.js` in a child process with an isolated `HOME` temp directory and local mock HTTP servers, so tests do not touch the real API or the user's `~/.stepfun-cli`.
- Config file is auto-created on first `saveConfig`; a missing or malformed file is treated as empty.
- `auth login` is interactive-only; under `--non-interactive` it exits USAGE(2). Non-interactive auth setup uses `config set api_key <key>` and `config set region <region>`.
- `auth logout` requires `--yes` under `--non-interactive`.

## 11. CLI behavior quirks

- Global flags may precede or follow nested commands, for example `stepfun text chat --message hi --region Global`.
- `--message` is a repeatable array option and supports `system:`, `user:`, and `assistant:` role prefixes.
- `--messages-file -` reads a JSON messages array from stdin.
- Streaming: auto-enabled when stdout is a TTY and `--output json` is not set; `--output json` forces non-streaming regardless of `--stream`. Reasoning deltas go to stderr only; raw reasoning is never printed to stdout. `--quiet` suppresses the `Thinking...` / `Response:` status lines.
- Dry run: validates options and region before checking for an API key; `--dry-run` never creates a client or sends a network request. Files are represented as `{ path, size }` or `{ path, error }`; binary content is never exposed.
- `--verbose` prints HTTP request and response metadata to stderr without API keys, bodies, or file contents.
- `default_text_model` and `default_speech_model` config keys are supported; each capability has its own resolver (`resolveTextModel`, `resolveSpeechTtsModel`).
