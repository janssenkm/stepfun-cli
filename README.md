# StepFun CLI

[Chinese documentation](README-CN.md)

`StepFun-CLI` is a command-line client for StepFun models. The NPM package is `@stepfun-ai/cli`, and the global executable is `stepfun`.

Supported capabilities:

- Text generation: `step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- Text-to-speech: `stepaudio-2.5-tts`
- Speech recognition: `stepaudio-2.5-asr`
- Image editing: `step-image-edit-2`

The full Resource tree also includes discoverable commands for future capabilities. Commands marked `(unsupported)` in `--help` return exit code 2 with a structured `UNSUPPORTED` error and never call an API. Detailed contracts are in [docs/resources](docs/resources).

## Installation

Node.js 18 or later is required.

```bash
npm install --global @stepfun-ai/cli
stepfun --version
```

Quick start:

```bash
stepfun auth login
stepfun auth status
stepfun text chat --message "Introduce StepFun in one sentence."
```

For CI, inject the API key through the environment and select JSON output explicitly:

```bash
export STEPFUN_API_KEY="YOUR_API_KEY"
stepfun --region Global --output json text chat --message "Hello"
```

Standalone x64 binaries may be published as optional release artifacts:

```text
bin/linux/x64/stepfun
bin/macos/x64/stepfun
bin/windows/x64/stepfun.exe
```

NPM remains the primary installation method.

## Regions and endpoints

| Region | Alias | Geography | Base URL |
| --- | --- | --- | --- |
| `StepPlan-Global` | `Global` | Global | `https://api.stepfun.ai/step_plan/v1` |
| `StepPlan-CN` | `CN` | China | `https://api.stepfun.com/step_plan/v1` |

`StepFun-Global` is accepted as a compatibility alias for `StepPlan-Global`. When an API key exists but no Region or custom Base URL is configured, the CLI probes both endpoints using Bearer and `x-api-key` authentication, caches the detected canonical Region, and falls back to `StepPlan-Global` if neither endpoint validates. `auth login` still requires an explicit user selection. StepPlan officially covers chat/reasoning endpoints only; other capabilities print a warning unless `--quiet` is set.

Configuration precedence is fixed:

```text
flag > environment > config file > default
```

The supported environment variables are:

| Variable | Purpose |
| --- | --- |
| `STEPFUN_API_KEY` | API key |
| `STEPFUN_REGION` | Region identifier |
| `STEPFUN_BASE_URL` | Custom API base URL |
| `STEPFUN_OUTPUT` | `text` or `json` |
| `STEPFUN_TIMEOUT` | Request timeout in seconds |

`--base-url` overrides the URL selected by `--region`, but the region still controls geography-dependent defaults and warnings.

Global flags may appear before a Resource or after a nested Command:

```bash
stepfun text chat --message "Hello" --region Global --output json
```

## Authentication and configuration

Interactive authentication:

```bash
stepfun auth login
stepfun auth status
stepfun auth logout
stepfun auth logout --yes
```

Non-interactive configuration:

```bash
stepfun config set region Global
stepfun config set api_key "YOUR_API_KEY"
stepfun config set output json
stepfun config set timeout 300
stepfun config set --key timeout --value 300
stepfun config show
stepfun config export-schema --command "text chat"
```

`config export-schema` emits OpenAI-compatible function tool JSON from the same command definitions used by runtime parsing and help. Omit `--command` to export every leaf command.

Supported configuration keys:

| Key | Stored field |
| --- | --- |
| `api_key` | `apiKey` |
| `base_url` | `baseUrl` |
| `region` | `region` |
| `output` | `output` |
| `timeout` | `timeout` |
| `default_text_model` | `defaultTextModel` |
| `default_speech_model` | `defaultSpeechModel` |

Selecting a named region clears a persisted custom base URL. `config show` always emits JSON and masks the API key. `auth status` shows the effective authentication source, region, and base URL after precedence resolution.

Configuration is stored in plaintext at `~/.stepfun-cli/config.json`. Restrict its permissions on shared systems:

```bash
chmod 700 ~/.stepfun-cli
chmod 600 ~/.stepfun-cli/config.json
```

## Updating

```bash
stepfun update
```

Example output:

```text
Current version: 0.1.1

Run:
  npm update -g @stepfun-ai/cli
```

The command does not query the registry or modify the global installation. Standalone binaries instead direct users to the project releases.

## Known limitations

- **HTTP/HTTPS proxy is not currently supported.** The CLI uses Node.js 18 native `fetch`, which does not support proxy configuration. Use environment-level proxy settings or a local forwarder if needed.

## Models

```bash
stepfun models list
stepfun --output json models list
```

Model flags accept explicit model names. Text and TTS defaults can be persisted:

```bash
stepfun config set default_text_model step-3.7-flash
stepfun config set default_speech_model stepaudio-2.5-tts
```

## Text chat

```bash
stepfun text chat --message "Hello"
stepfun text chat --model step-3.7-flash --message "Explain SSE briefly."
```

`--message` is repeatable. Bare values are user messages; `system:`, `user:`, and `assistant:` prefixes set an explicit role:

```bash
stepfun text chat \
  --message "system:Answer concisely." \
  --message "user:Hello" \
  --message "assistant:Hello. How can I help?" \
  --message "Explain the available models."
```

Additional options:

| Option | Request field |
| --- | --- |
| `--system <text>` | leading system message |
| `--messages-file <path|->` | `messages` loaded from JSON or stdin |
| `--temperature <number>` | `temperature` |
| `--top-p <number>` | `top_p` |
| `--max-tokens <int>` | `max_tokens` |
| `--reasoning-effort <low|medium|high>` | `reasoning_effort` |
| `--reasoning-format <format>` | `reasoning_format` |
| `--stop <text>` | repeatable stop sequence |
| `--frequency-penalty <number>` | `frequency_penalty` |
| `--response-format <text|json_object>` | `response_format` |
| `-n, --n <count>` | `n`; values above 1 require `--output json` |
| `--stream` / `--no-stream` | streaming selection |
| `--tool <json-or-path>` | registered for discovery; currently returns `UNSUPPORTED` |

`--message` or `--messages-file` is required. Messages supplied on the command line are appended after file messages. A `system:` message overrides `--system`.

```bash
echo '[{"role":"user","content":"Hello"}]' | stepfun text chat --messages-file -
stepfun text chat --messages-file messages.json --message "Continue."
```

Text output streams automatically when stdout is a TTY. `--output json` forces a non-streaming request and preserves the complete API response. During streaming, response text is written to stdout; reasoning activity is reported on stderr without exposing raw reasoning. `--quiet` suppresses those status messages.

## Speech synthesis

```bash
stepfun speech synthesize \
  --text "Hello from StepFun." \
  --voice lively-girl \
  --format mp3 \
  --out hello.mp3
```

The default output path is `output.mp3`. The default voice is `cixingnansheng` for China regions and `lively-girl` for global regions.
`speech generate` is an alias with the same behavior and flags.

Optional request parameters:

- `--speed <number>`
- `--volume <number>`
- `--sample-rate <number>`
- `--format <wav|mp3|flac|opus|pcm>`

The synthesis command uses `--out <file>` for the audio path. Global `--output text|json` controls presentation and may appear before or after a nested command.
The registered discovery flags `--text-file`, `--pitch`, `--bitrate`, `--channels`, `--language`, `--subtitles`, `--pronunciation`, and `--stream` currently return `UNSUPPORTED`.

## Speech recognition

```bash
stepfun speech recognize \
  --file hello.wav \
  --model stepaudio-2.5-asr \
  --language en \
  --hotwords StepFun,CLI
```

Supported file extensions are `ogg`, `mp3`, `wav`, and `pcm`. Raw PCM is sent as signed 16-bit little-endian, 16 kHz, mono audio.

```bash
stepfun --quiet --output json speech recognize --file hello.wav | jq -r '.text'
```

## Image editing

```bash
stepfun image edit \
  --file input.png \
  --prompt "Convert this image to a cyberpunk style." \
  --model step-image-edit-2
```

Optional request parameters:

- `--response-format <b64_json|url>`
- `--seed <int>`
- `--steps <int>`
- `--cfg-scale <number>`
- `--negative-prompt <text>`
- `--out <path>` is registered for the destination contract but currently returns `UNSUPPORTED`.

The default response format is `b64_json`. For scripts, decode it to a file or request a URL:

```bash
stepfun --quiet --output json image edit \
  --file input.png --prompt "Improve sharpness." \
  | jq -r '.data[0].b64_json' | base64 --decode > edited.png

stepfun --quiet --output json image edit \
  --file input.png --prompt "Improve sharpness." --response-format url \
  | jq -r '.data[0].url'
```

## Files

Files provide reusable assets for multimodal features and parsed text extraction.

```bash
stepfun file upload --file report.pdf --purpose file-extract
stepfun file upload --url https://example.com/image.png --purpose storage
stepfun file list
stepfun file get file-abc123
stepfun file content file-abc123
stepfun file delete file-abc123 --yes
```

Exactly one of `--file` or `--url` is required for upload. Supported purposes are `file-extract`, `retrieval-text`, `retrieval-image`, and `storage`. China API documentation covers all four; current Global upload documentation guarantees `storage` only, so other purposes produce a warning outside China. StepPlan Regions also produce the standard endpoint-coverage warning.

Local uploads are validated before network access:

- `file-extract` and `retrieval-text`: common text, PDF, Office, CSV, HTML, and XML files up to 64 MB.
- `retrieval-image`: JPG/JPEG or PNG up to 64 MB.
- `storage`: MP4, image, MP3, or WAV files up to 128 MB.

`file content` returns parsed plain text and only applies to files uploaded with `purpose=file-extract`; it is not an original-file download command. Redirect text or write it explicitly:

```bash
stepfun --output text file content file-abc123 > report.txt
stepfun file content file-abc123 --out report.txt
```

Deletion asks for confirmation. Non-interactive use requires `--yes`. With `--quiet`, upload prints only the new file ID and delete prints `deleted`.

## Global options

Global options may appear before the Resource or after a nested Command:

```bash
stepfun --quiet --region CN text chat --message "Hello"
```

| Option | Description |
| --- | --- |
| `--api-key <key>` | Per-command API key |
| `--region <region>` | Select a supported region |
| `--base-url <url>` | Override the region URL |
| `--output <text|json>` | Select output format |
| `--timeout <seconds>` | Positive request timeout; default 300 |
| `--dry-run` | Print a safe request summary without authentication or network access |
| `--non-interactive` | Never prompt |
| `--quiet` | Suppress non-essential status output |
| `--verbose` | Print HTTP request and response metadata without credentials or bodies |
| `--no-color` | Disable ANSI color in the streaming thinking indicator |

`--verbose` never prints API keys, request bodies, response bodies, or file contents.

### Dry run

```bash
stepfun --dry-run --output json --region Global \
  text chat --model step-3.7-flash --message "Hello"

stepfun --dry-run --output json image edit \
  --file input.png --prompt "Improve sharpness."
```

Dry run does not require an API key, create a client, or send a request. Files are represented by path and byte size, or by path and error when unavailable. Credentials and binary contents are never printed.

## Errors and exit codes

Errors are always written to stderr.

| Exit code | Name | Meaning |
| --- | --- | --- |
| `0` | OK | Success |
| `1` | API_ERROR | Non-authentication API or general error |
| `2` | USAGE | Invalid arguments or missing confirmation |
| `3` | AUTH | Missing API key, HTTP 401, or HTTP 403 |
| `4` | QUOTA | HTTP 402 balance insufficient or 429 rate/resource limit |
| `5` | TIMEOUT | HTTP 408/504 or request timed out |
| `6` | NETWORK | DNS, connection, fetch, or timeout failure |
| `10` | CONTENT_FILTER | HTTP 451 or content moderation blocked |

JSON errors use a stable envelope:

```json
{
  "error": {
    "code": "AUTH",
    "message": "API key is required",
    "hint": "Run `stepfun auth login`, set `STEPFUN_API_KEY`, or pass `--api-key`."
  }
}
```

## Development

```bash
git clone https://github.com/janssenkm/stepfun-cli.git
cd stepfun-cli
npm install
npm run build
npm test
npm pack --dry-run
```

The TypeScript compiler emits CommonJS files to `dist/`. Tests use Node.js's built-in test runner and local mock HTTP servers; no real API key is required.

Optional standalone packaging downloads `pkg@5.8.1` on demand:

```bash
npm run pkg
```
