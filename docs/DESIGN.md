# StepFun-CLI Design

## Architecture

The project uses Node.js 18 or later and TypeScript:

- `src/index.ts`: executable bootstrap, global options, runtime resolution, and command registration.
- `src/commands/`: Commander registrations and actions, separated into core and model-capability commands.
- `src/config.ts` and `src/config/schema.ts`: validated configuration, Region profiles, atomic persistence, and private permissions.
- `src/client/`: canonical endpoints, authenticated HTTP transport, and incremental SSE parsing.
- `src/api.ts`: capability-level chat, TTS, ASR, and image-editing client.
- `src/files/`: typed File objects and the Files API service.
- `src/cli/`: structured error handling and process-level signal/pipe behavior.
- `src/cli/schema.ts`: tool-schema generation from the live Commander tree.
- `src/cli/output.ts`: stdout result and stderr progress boundaries.
- `src/cli/validation.ts`: shared numeric and option-cardinality validation.
- `src/update.ts`: safe NPM update instructions without registry access or installation changes.
- `test/*.test.js`: unit, contract, integration, authentication, streaming, and update tests.

TypeScript emits CommonJS into `dist/`. `package.json#bin.stepfun` points to `dist/index.js`. The package publishes compiled output together with the English and Chinese README files. Optional binaries are produced through an on-demand `pkg@5.8.1` invocation and written under `bin/{os}/x64/`.

## Command tree

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

Unsupported commands are registered for discoverability and share one action boundary. They return exit code 2 with a structured `UNSUPPORTED` code, do not require authentication, and do not access the network. This keeps future command names visible without pretending that an API capability exists.

## Configuration resolution

Every runtime setting follows:

```text
flag > environment > config > default
```

Supported environment variables are `STEPFUN_API_KEY`, `STEPFUN_REGION`, `STEPFUN_BASE_URL`, `STEPFUN_OUTPUT`, and `STEPFUN_TIMEOUT`. Canonical Regions are `StepPlan-Global` and `StepPlan-CN`, with `Global` and `CN` aliases. A custom Base URL overrides the Region URL and disables automatic Region detection.

When an API key is available without a Region, capability actions invoke detection after local validation and dry-run handling but before client creation. Global and CN probes run concurrently; each endpoint tries Bearer followed by `x-api-key` against `GET /models`. Success is a 2xx response. Global wins when both validate. Failure falls back to Global. The result, including fallback, is atomically cached. JSON output suppresses detection progress so structured output remains parseable.

Persisted JSON is validated field by field before use. Writes use a private temporary file followed by an atomic rename. The configuration directory is mode `0700` and the final file is mode `0600`.

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
| File upload/list | POST/GET | `/files` |
| File metadata/delete | GET/DELETE | `/files/{file_id}` |
| Parsed file content | GET | `/files/{file_id}/content` |

Chat, TTS, and ASR use JSON. Image editing uses native multipart/form-data.

All capability methods delegate authentication, User-Agent, timeout, URL construction, and non-success response handling to the shared HTTP transport. Dry-run summaries and real requests use the same endpoint constants.

File IDs are encoded as path segments. File upload uses native multipart/form-data for both local files and remote URLs. Parsed content is handled as text, while metadata and lifecycle responses use JSON.

## Proxy constraint

The CLI uses Node.js 18 native `fetch`. Proxy configuration (`HTTP_PROXY` / `HTTPS_PROXY`) is not supported in the current release. This is a known limitation tracked for a future milestone. Use environment-level proxy settings or a local forwarder if the CLI must traverse a proxy.

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
- Global flags are accepted before or after nested commands.
- `--output` only selects `text` or `json`; a single file destination always uses command-local `--out`.
- Result writers are centralized in `src/cli/output.ts`. Progress messages use stderr so pipelines receive result data only.

## Command metadata and schema export

Commander is the canonical command metadata tree. Runtime parsing, `--help`, and `config export-schema` inspect the same registered Commands and Options. Schema export emits OpenAI-compatible function tools, converts repeatable options to arrays, merges positive/negative boolean flags, and supports selecting one command by path. This avoids maintaining a parallel command catalog.

Shared validation helpers provide strict number and integer parsing and exact-one option checks. Command actions retain capability-specific range and API validation.

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
- HTTP 402/429 to exit 4 (QUOTA);
- HTTP 408/504, `AbortError`, and `TimeoutError` to exit 5 (TIMEOUT);
- HTTP 451 and content-moderation keywords to exit 10 (CONTENT_FILTER);
- fetch, connection, and DNS failures to exit 6;
- other API and unclassified errors to exit 1.

This supports both numeric shell checks and structured JSON processing.

The executable installs process handlers for graceful SIGINT exit code 130 and successful termination when a downstream pipe closes with EPIPE.

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
- Configuration tests validate schema recovery, atomic writes, and private permissions.
- Client tests cover canonical endpoints, standard headers, error mapping, and SSE boundaries.
