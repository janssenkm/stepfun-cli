# stepfun-cli Design

## Architecture

Node.js ≥ 18 + TypeScript (strict) → CommonJS via `tsc`. Zero runtime dependencies (native `fetch`, `FormData`, `Blob`, `AbortSignal`, `readline`). The CLI architecture mirrors the `mmx` reference implementation in `.repos/cli`: a custom flag parser and a command registry instead of an off-the-shelf CLI library.

```
src/
  index.ts            bin entry (shebang) → main()
  main.ts             argv → command path → flags → config → auth gate → execute
  args.ts             scanCommandPath(), parseFlags() — typed by OptionDef schemas
  command.ts          Command / OptionDef / defineCommand / GLOBAL_OPTIONS
  registry.ts         CommandRegistry (tree routing + help) + singleton registry
  version.ts          CLI_VERSION (bumped in lockstep with package.json)
  types/
    flags.ts          GlobalFlags — typed global flags + per-command index signature
  config/
    paths.ts          ~/.stepfun-cli/config.json (0600 file, 0700 dir, atomic writes)
    regions.ts        StepPlan-Global / StepPlan-CN → { genBase, apiBase, docsHost }
    schema.ts         Config, ConfigFile, parseConfigFile, DEFAULTS
    loader.ts         loadConfig() (flag > env > file > default), read/write helpers
  client/
    http.ts           request / requestJson / requestBytes / requestStream
                      (Bearer auth, User-Agent, timeout, verbose, error→exitcode)
    sse.ts            parseSSE() — handles chunked reads, CRLF, multi-line data
    urls.ts           genUrl() / mgmtUrl() — the dual-base routing primitive
  api/
    models.ts account.ts files.ts token.ts chat.ts image.ts audio.ts
  commands/
    auth/ config/ models/ account/ token/ text/ image/ speech/ file/
    (text/_shared.ts, image/_save.ts — shared helpers)
  output/
    formatter.ts      detectOutputFormat / formatOutput / dryRun
    text.ts json.ts   renderers
    log.ts            info/verbose + braille spinner
  errors/
    codes.ts          ExitCode
    base.ts           CLIError (with toJSON for JSON error output)
    api.ts            mapApiError(status, body, url, region)
    handler.ts        handleError() — CLIError + network/fs/timeout classification
  utils/
    env.ts            isInteractive() (TTY + --non-interactive)
    fs.ts             readStdin / saveBytes / fileToDataUrl / ensureFileExists
    messages.ts       buildConversation() — message + multimodal-attachment assembly
    mime.ts           image/audio MIME + ASR format helpers
    prompt.ts         readline prompts + requireFlag() (interactive flag resolution)
```

## Request flow

1. `main()` slices `process.argv`, scans the command path (skipping global-flag values), resolves the command via the registry, parses flags against `[...GLOBAL_OPTIONS, ...command.options]`.
2. `loadConfig(flags)` merges flag/env/file/defaults → `{ genBaseUrl, apiBaseUrl, apiKey, region, ... }`.
3. Auth gate: commands not in `NO_AUTH_SETUP` throw exit 3 unless `config.apiKey` (or `--dry-run`).
4. The command builds a request body (often via `buildConversation`), checks `dryRun`, then calls an `api/*` function.
5. `api/*` calls `request*()` with a URL from `genUrl` or `mgmtUrl`. The HTTP layer injects `Authorization: Bearer`, `User-Agent`, applies `AbortSignal.timeout`, classifies non-2xx via `mapApiError`.

## The dual-base rule

The same StepPlan key is valid on two bases per region. **Generation** endpoints live under `/step_plan/v1` and are metered against the subscription; **management** endpoints live under the public `/v1`. This was confirmed by real probes — `/accounts`, `/files`, `/audio/system_voices`, `/models/{id}` return 404 on `/step_plan/v1` but 200 on `/v1`. Each `api/*` function picks the base with `genUrl`/`mgmtUrl`.

| Base | Endpoints |
|---|---|
| gen (`/step_plan/v1`) | `/chat/completions`, `/messages`, `/responses`, `/audio/speech`, `/audio/asr/sse`, `/images/generations`, `/images/edits`, `/token/count` |
| mgmt (`/v1`) | `/models`, `/models/{id}`, `/accounts`, `/files` (CRUD), `/files/{id}/content`, `/audio/system_voices`, `/audio/voices` (list) |

Note: `POST /audio/voices` (clone) and `/audio/voices/preview` are generation (gen); `GET /audio/voices` (list) and `/audio/system_voices` are management (mgmt) — same path, different method/base.

## Streaming

Three SSE shapes, all parsed by `parseSSE()` in `client/sse.ts`:
- **Completions**: `data: {choices:[{delta:{content,reasoning,tool_calls}}]}`…`data: [DONE]`. Tool-call argument fragments are accumulated by index.
- **Messages (Anthropic)**: `event:` + `data:`; `content_block_delta` with `text_delta`.
- **Responses**: `event:` + `data:`; `response.output_text.delta` / `response.reasoning_text.delta` / `response.completed`.
- **ASR**: `transcript.text.delta` / `transcript.text.done`.
- **TTS (optional)**: `speech.audio.delta` (base64 chunks concatenated).

In text mode, deltas print live; in JSON mode, the result is buffered and emitted whole.

## Error model

`mapApiError` maps StepFun HTTP status → `ExitCode` and attaches region-aware quota hints (StepPlan Global 5h/weekly limits vs CN monthly Credit pool). `handleError` additionally classifies `AbortError`/`TimeoutError` → 5, `fetch failed`/network patterns → 6, and filesystem `E*` codes → 1 with actionable hints. `CLIError.toJSON()` produces structured JSON errors when output is JSON.

## Config resolution

`loadConfig`: `flag → STEPFUN_* env → config file → DEFAULTS`. Region drives both bases unless overridden by `--base-url` / `--api-base-url` (or their env vars / file fields). Output auto-switches to JSON when stdout is not a TTY.

## Testing

`npm test` = `tsc && node --test test/*.test.js`:
- `args.test.js` — parser unit tests.
- `config.test.js` — `parseConfigFile`, region validation, base profiles.
- `registry.test.js` — command resolution + positional passthrough.
- `contract.test.js` — spawned CLI with isolated `HOME`: help/version/unknown-command/auth-gate/dry-run.
- `mock.test.js` — in-process mock server exercising every `api/*` path (JSON, SSE, binary, multipart), including TTS binary + SSE. In-process (not spawned) because restricted sandboxes block cross-process loopback fetch.

Real-API verification (Global key) covers: models, account, files CRUD, token count, chat (stream/non-stream/tool-call/reasoning), messages, responses, image generate/edit, ASR.
