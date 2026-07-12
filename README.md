# stepfun

A command-line interface for the [StepFun](https://platform.stepfun.ai) **StepPlan** subscription — chat, image, speech, files, and account management, from your terminal or agent.

`stepfun` targets StepPlan (Global + CN). Generation requests (chat / audio / image / token-count) are billed against your StepPlan quota via the `/step_plan/v1` base; management requests (models / files / account / system voices) use the public `/v1` base — both accept the same API key.

## Install

```bash
npm install -g @stepfun-ai/cli
# or run from source:
git clone <repo> && cd stepfun-cli && npm install && npm run build
node dist/index.js --help
```

Requires Node.js ≥ 18 (uses native `fetch`, `FormData`, `AbortSignal`).

## Get started

```bash
# 1. Save your StepPlan API key (get one at https://platform.stepfun.ai)
stepfun auth login --api-key sk-... --region StepPlan-Global

# 2. Check it works
stepfun auth status
stepfun models list

# 3. Chat (streaming)
stepfun text chat --model step-3.7-flash --message "Hello, StepFun!" --stream
```

## Commands

| Resource | Commands |
|---|---|
| **text** | `text chat` (OpenAI Completions), `text messages` (Anthropic Messages), `text responses` (OpenAI Responses) |
| **image** | `image generate`, `image edit` |
| **speech** | `speech synthesize` (TTS), `speech recognize` (ASR) |
| **models** | `models list`, `models get <id>` |
| **file** | `file upload`, `file list`, `file get`, `file content`, `file delete` |
| **account** | `account show` |
| **token** | `token count` |
| **auth** | `auth login`, `auth status`, `auth logout` |
| **config** | `config show`, `config set` |

Add `--help` to any command for full options, e.g. `stepfun text chat --help`. Per-resource flag reference: [docs/resources/](docs/resources/); full doc index: [docs/README.md](docs/README.md).

### Chat

```bash
# OpenAI-compatible Completions (streaming, with reasoning)
stepfun text chat --model step-3.7-flash --message "Solve: (80+20)/5" \
  --reasoning-effort high --stream

# Multimodal (image input)
stepfun text chat --model step-3.7-flash --message "describe this" --image photo.jpg

# Anthropic-compatible Messages
stepfun text messages --model step-3.7-flash --message "hi" --max-tokens 256

# OpenAI Responses (supports structured output)
stepfun text responses --input "extract sentiment" --json-schema schema.json --effort high

# Function/tool calling
stepfun text chat --model step-3.7-flash --message "weather in Beijing?" \
  --tool '{"type":"function","function":{"name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}'
```

### Image

```bash
stepfun image generate --prompt "a serene alpine lake at sunset" --out lake.png
stepfun image edit --image input.png --prompt "make it night time" --out night.png
```

### Speech

```bash
stepfun speech synthesize --text "你好，阶跃" --out out.mp3
stepfun speech synthesize --text "streaming tts" --stream --out out.mp3
stepfun speech recognize --file recording.mp3 --language zh
```

### Files & account

```bash
stepfun file upload --file image.png
stepfun file list
stepfun account show
stepfun token count --model step-3.7-flash --message "count these tokens"
```

## Configuration

Config lives at `~/.stepfun-cli/config.json`:

```jsonc
{
  "apiKey": "sk-...",
  "region": "StepPlan-Global",          // or StepPlan-CN
  "genBaseUrl": null,                   // optional override (defaults to region)
  "apiBaseUrl": null,                   // optional override
  "output": "text",                     // text | json
  "timeout": 120,
  "defaultTextModel": "step-3.7-flash",
  "defaultSpeechTtsModel": "stepaudio-2.5-tts",
  "defaultSpeechAsrModel": "stepaudio-2.5-asr",
  "defaultImageModel": "step-image-edit-2"
}
```

**Resolution priority:** flag > env (`STEPFUN_API_KEY`, `STEPFUN_REGION`, `STEPFUN_GEN_BASE_URL`, `STEPFUN_API_BASE_URL`, `STEPFUN_OUTPUT`, `STEPFUN_TIMEOUT`) > config > default.

## Regions

| Region | Generation base | Management base |
|---|---|---|
| `StepPlan-Global` | `https://api.stepfun.ai/step_plan/v1` | `https://api.stepfun.ai/v1` |
| `StepPlan-CN` | `https://api.stepfun.com/step_plan/v1` | `https://api.stepfun.com/v1` |

The same StepPlan API key is valid on both bases. Generation endpoints are metered against your StepPlan subscription; management endpoints are general open-platform features.

## Global flags

```
--api-key <key>          StepFun API key (overrides config)
--region <region>        StepPlan-Global | StepPlan-CN
--base-url <url>         Override the generation (StepPlan) base URL
--api-base-url <url>     Override the management (/v1) base URL
--output <format>        text | json (auto: json when piped)
--timeout <seconds>      Request timeout
--quiet                  Suppress non-essential output
--verbose                Print HTTP request/response details
--dry-run                Print the request body without calling the API
--non-interactive        Disable prompts (CI/agent mode)
--help, --version
```

## Exit codes

`0` success · `1` general · `2` usage · `3` auth · `4` quota/rate-limit · `5` timeout · `6` network · `10` content-filter.

## Development

```bash
npm run build          # tsc → dist/
npm test               # build + node --test test/*.test.js
```

The architecture mirrors the `mmx` CLI (`.repos/cli`): a custom flag parser (`src/args.ts`), a command registry (`src/registry.ts`), and one module per resource under `src/commands/`. No runtime dependencies. See [docs/DESIGN.md](docs/DESIGN.md) (or the [doc index](docs/README.md)).

## License

MIT
