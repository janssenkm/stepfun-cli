# stepfun-cli — Repository Guidelines

## 1. Project identity

`stepfun-cli` is the command-line client for the StepFun **StepPlan** subscription. Package: `@stepfun-ai/cli`; executable: `stepfun`; Node.js ≥ 18; TypeScript → CommonJS via `tsc`. Zero runtime dependencies.

Command grammar: `stepfun <resource> <command> [flags]`. Resources: `text`, `image`, `speech`, `models`, `file`, `account`, `token`, `auth`, `config`.

## 2. Architecture (mirrors `.repos/cli` / mmx)

- `src/args.ts` — custom flag parser (`scanCommandPath`, `parseFlags`). Types derived from `OptionDef` schemas; **no Commander**.
- `src/command.ts` — `Command`/`OptionDef`/`defineCommand` + `GLOBAL_OPTIONS`.
- `src/registry.ts` — `CommandRegistry` (tree routing, help rendering) + the singleton `registry` that imports every command module.
- `src/main.ts` — entry: argv → command path → flags → config → auth gate → execute.
- `src/config/` — `paths.ts` (`~/.stepfun-cli/config.json`), `regions.ts` (StepPlan-Global/CN → gen+api base profiles), `schema.ts` (`Config`/`ConfigFile`/`parseConfigFile`/`DEFAULTS`), `loader.ts`.
- `src/client/` — `http.ts` (fetch wrapper + auth + error→exitcode), `sse.ts` (SSE parser), `urls.ts` (`genUrl`/`mgmtUrl`).
- `src/api/` — one module per domain (`models`, `account`, `files`, `token`, `chat`, `image`, `audio`). Pure functions returning typed data.
- `src/commands/<resource>/` — one file per command, via `defineCommand`.
- `src/errors/` — `codes.ts`, `base.ts` (`CLIError`), `api.ts` (HTTP→exit mapping), `handler.ts`.

To add a command: create `src/commands/<res>/<cmd>.ts` with `defineCommand({...})`, then import + register it in `src/registry.ts`.

## 3. The dual-base rule (critical)

StepPlan splits endpoints across two bases on the **same host**, both using the same key:

- **Generation** (`genUrl`, `/step_plan/v1`): `chat/completions`, `messages`, `responses`, `audio/speech`, `audio/asr/sse`, `images/generations`, `images/edits`, `token/count` — billed against the subscription.
- **Management** (`mgmtUrl`, `/v1`): `models`, `models/{id}`, `accounts`, `files` CRUD, `audio/system_voices`, `audio/voices` (list) — general open-platform features.

This split was verified by real probes (`/accounts` etc. return 404 on `/step_plan/v1`). Pick the base via `genUrl`/`mgmtUrl` in `src/api/`.

## 4. Config & auth

Config at `~/.stepfun-cli/config.json` (camelCase; snake_case also accepted on read). Resolution: flag > `STEPFUN_*` env > file > default. Commands in `NO_AUTH_SETUP` (`auth *`, `config *`) skip the key check; `--dry-run` also skips it. Everything else throws exit 3 if no key.

## 5. Output

`detectOutputFormat`: explicit `--output` else `json` when stdout is not a TTY, else `text`. `--dry-run` prints `{method, path, body}` and exits 0. Binary outputs (image/audio) write raw bytes to stdout unless `--out` is given.

## 6. Verification

- Real API (Global key in `~/.stepfun-cli/config.json`): models, account, files CRUD, token count, chat (stream/non-stream/tool-call), messages, responses, image generate/edit, ASR all live-verified. TTS shares the same HTTP/SSE path as ASR; the `stepaudio-2.5-tts` engine was intermittently overloaded during verification, so TTS save/stream behavior is additionally covered by `test/mock.test.js`.
- `npm test` runs unit (args/config/registry), contract (spawned CLI: help/version/dry-run/auth-gate), and in-process mock tests (every api path). Mock tests run in-process because spawned-child loopback fetch is blocked in restricted sandboxes.

## 7. Out of scope (documented for later)

Voice management (system/list/clone/preview), WebSocket streaming TTS, realtime voice (`stepaudio-2.5-realtime`), voice chat (`stepaudio-2.5-chat`), smart router (`step-router-v1`), MCP — not in StepPlan Global yet; extend on the same architecture when available (CN key needed).
