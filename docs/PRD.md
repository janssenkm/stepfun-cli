# StepFun-CLI Product Requirements

## Background

StepFun-CLI is a command-line client for StepFun models. Its NPM package is `@stepfun-ai/cli`, its executable is `stepfun`, and its primary delivery path is a global NPM installation on Node.js 18 or later. The CLI supports interactive terminal use and automation through stable JSON output and structured errors.

The NPM executable is `dist/index.js`. Optional standalone binaries are release artifacts, not the default installation path. Unsupported modalities such as video, music, voice cloning, and agent workflows must not be exposed as placeholder commands.

## Goals

1. Expose StepFun text, speech, and image-editing capabilities through `stepfun`.
2. Provide authentication, configuration, model discovery, structured output, and script-friendly errors.
3. Enforce the four supported Region-to-Base-URL mappings.
4. Keep unsupported capabilities outside the command surface.

## Non-goals

- Video generation, music generation, voice cloning, and agent workflows.
- Multiple account profiles, organization management, or billing reports.
- Encrypted credential storage inside the CLI.
- Undocumented protocol emulation.
- Standalone binaries as the primary installation method.

## Users and scenarios

- Developers invoking chat, TTS, ASR, and image editing locally.
- CI jobs injecting credentials through environment variables and consuming JSON.
- China/global and StepPlan/PayGo users selecting an explicit Region.
- Support and development workflows inspecting safe requests with `--dry-run`.

## Global requirements

| Option | Requirement |
| --- | --- |
| `--api-key <key>` | Override every other authentication source |
| `--region <region>` | Accept only the four documented values |
| `--base-url <url>` | Override the Region URL |
| `--output <text|json>` | Control success and error formatting |
| `--timeout <seconds>` | Positive number; default 300 |
| `--quiet` | Suppress non-essential status output |
| `--verbose` | Reserved diagnostic switch |
| `--dry-run` | Print a safe request summary without authentication or networking |
| `--non-interactive` | Disable prompts |
| `--no-color` | Reserved color/animation switch |

Configuration precedence is `flag > environment > config > default`.

## Regions

| Region | Base URL |
| --- | --- |
| `StepPlan-CN` | `https://api.stepfun.com/step_plan/v1` |
| `StepPlan-Global` | `https://api.stepfun.ai/step_plan/v1` |
| `PayGo-CN` | `https://api.stepfun.com/v1` |
| `PayGo-Global` | `https://api.stepfun.ai/v1` |

The default is `PayGo-CN`. StepPlan officially covers chat/reasoning endpoints only. Speech and image commands must warn under StepPlan unless `--quiet` is set.

## Authentication and configuration

- `stepfun auth login`: select a Region, read a hidden API key, and persist it.
- `stepfun auth status`: show authentication state, source, masked key, Region, and Base URL.
- `stepfun auth logout [--yes]`: clear local configuration; non-interactive use requires `--yes`.
- `stepfun config set <key> <value>`: support `api_key`, `base_url`, `region`, `output`, `timeout`, `default_text_model`, and `default_speech_model`.
- `stepfun config show`: emit persisted configuration as JSON with a masked key.

The configuration path is `~/.stepfun-cli/config.json`.

## Models

- Text: `step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- Speech: `stepaudio-2.5-tts`, `stepaudio-2.5-asr`
- Image: `step-image-edit-2`

## Text chat

`stepfun text chat` supports:

- Repeatable `--message <text>` with optional `system:`, `user:`, or `assistant:` prefixes.
- Repeatable `--prompt <text>` as a compatibility alias.
- `--model`, `--system`, `--messages-file`, `--temperature`, `--top-p`, `--max-tokens`, `--stream`, and `--no-stream`.

At least one of `--message`, `--prompt`, or `--messages-file` is required. `--message` wins when both message forms are supplied. JSON output disables streaming; text output streams by default when stdout is a TTY.

Streaming must support chunked SSE input, multi-line data, CRLF, comments, and an unterminated final event. Text goes to stdout. Reasoning activity goes to stderr without exposing raw reasoning and is suppressed by `--quiet`. The parser retains text, reasoning, tool calls, finish reason, and usage internally.

## Speech synthesis

`stepfun speech synthesize` supports `--text`, `--output`, `--voice`, `--model`, `--format`, `--speed`, `--volume`, and `--sample-rate`. The fallback voice is `cixingnansheng` for China regions and `lively-girl` for global regions.

## Speech recognition

`stepfun speech recognize` supports `--file`, `--model`, `--language`, and `--hotwords`. Accepted extensions are `ogg`, `mp3`, `wav`, and `pcm`. Raw PCM uses signed 16-bit little-endian, 16 kHz, mono encoding.

## Image editing

`stepfun image edit` supports `--file`, `--prompt`, `--model`, `--response-format`, `--seed`, `--steps`, `--cfg-scale`, and `--negative-prompt`.

## Update guidance

`stepfun update` prints the current version and an explicit NPM update command. It must not query a registry or modify the global installation. Standalone binaries direct users to releases.

## Errors and exit codes

| Exit code | Type | Scenario |
| --- | --- | --- |
| 0 | OK | Success |
| 1 | API_ERROR | Non-authentication API or general failure |
| 2 | USAGE | Invalid arguments or missing confirmation |
| 3 | AUTH | Missing key, HTTP 401, or HTTP 403 |
| 6 | NETWORK | Fetch, DNS, connection, or timeout failure |

JSON errors go to stderr as `{ "error": { "code": "...", "message": "...", "hint": "..." } }`.

## Acceptance criteria

- `npm test` passes.
- Tests protect Region mappings and credential precedence.
- Dry run does not require a key, access the network, or expose credentials/binary content.
- README, PRD, design documentation, tests, and `--help` remain aligned.
