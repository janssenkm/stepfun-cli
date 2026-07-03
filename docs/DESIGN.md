# StepFun-CLI Design

## Architecture

The project uses Node.js 18 or later and TypeScript:

- `src/index.ts`: Commander command tree, option validation, configuration resolution, output, and error classification.
- `src/config.ts`: Region profiles and `~/.stepfun-cli/config.json` persistence.
- `src/api.ts`: HTTP client for chat, TTS, ASR, and image editing using native `fetch`, `FormData`, and `Blob`.
- `src/update.ts`: safe NPM update instructions without registry access or installation changes.
- `test/*.test.js`: contract, integration, authentication, streaming, and update tests.

TypeScript emits CommonJS into `dist/`. `package.json#bin.stepfun` points to `dist/index.js`. The package publishes compiled output together with the English and Chinese README files. Optional binaries are produced through an on-demand `pkg@5.8.1` invocation and written under `bin/{os}/x64/`.

## Command tree

```text
stepfun
  update
  auth login
  auth logout [--yes]
  auth status
  config set <key> <value>
  config show
  models list
  text chat
  speech synthesize
  speech recognize
  image edit
```

Unsupported capabilities do not receive placeholder commands.

## Configuration resolution

Every runtime setting follows:

```text
flag > environment > config > default
```

Supported environment variables are `STEPFUN_API_KEY`, `STEPFUN_REGION`, `STEPFUN_BASE_URL`, `STEPFUN_OUTPUT`, and `STEPFUN_TIMEOUT`. Region identifiers must exist in `REGION_PROFILES`. A custom Base URL overrides the Region URL, while the Region still controls geography-dependent defaults and warnings.

## HTTP client

Every model API request carries:

- `Authorization: Bearer <apiKey>`
- `User-Agent: stepfun-cli/<version>`

| Capability | Method | Path |
| --- | --- | --- |
| Chat | POST | `/chat/completions` |
| Streaming chat | POST | `/chat/completions` with `stream: true` |
| TTS | POST | `/audio/speech` |
| ASR | POST | `/audio/asr/sse` |
| Image editing | POST | `/images/edits` |

Chat, TTS, and ASR use JSON. Image editing uses native multipart/form-data.

## Streaming chat

The SSE parser incrementally buffers decoded bytes and supports LF/CRLF lines, comments, multi-line `data` fields, cross-chunk events, and a final event without a blank-line terminator.

The stream accumulator retains:

- response text;
- reasoning content;
- incremental tool calls;
- finish reason;
- usage.

Text is written to stdout. Reasoning only triggers status messages on stderr; raw reasoning is not displayed. `--quiet` suppresses status messages. JSON output uses a non-streaming request and preserves the complete server response.

## Output

- Successful TTY output defaults to text; non-TTY output defaults to JSON.
- `--output text|json` overrides detection.
- Errors always go to stderr.
- JSON errors use `{ error: { code, message, hint? } }`.
- `--quiet` suppresses progress/status output, not results or errors.

## Dry run

Dry run:

- does not require an API key;
- does not instantiate the HTTP client;
- does not send network requests;
- emits method, complete URL, command, model, and key parameters;
- represents files as path/size or path/error;
- still validates options, Regions, and chat message requirements.

## Error classification

`classifyError` maps:

- `UsageError` to exit 2;
- missing credentials and HTTP 401/403 to exit 3;
- fetch, abort, timeout, and connection failures to exit 6;
- other API and unclassified errors to exit 1.

This supports both numeric shell checks and structured JSON processing.

## Security

- API keys are sent only through the Authorization header.
- `auth status` and `config show` mask keys.
- Dry run never prints credentials or binary file contents.
- The plaintext configuration format and recommended filesystem permissions are documented.

## Testing

- Contract tests protect Region URLs, precedence, output formats, exit codes, and dry run.
- Integration tests use local HTTP servers to validate paths, headers, bodies, and response parsing.
- Streaming tests cover reasoning suppression, tool-call accumulation, CRLF, and SSE parsing.
- Update tests validate instructions without accessing NPM or changing global installation state.
