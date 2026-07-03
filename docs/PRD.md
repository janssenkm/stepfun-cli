# StepFun-CLI PRD

## 背景

StepFun-CLI 是面向开发者和终端用户的阶跃星辰模型命令行工具，NPM 包名为 `@stepfun-ai/cli`，全局命令为 `stepfun`。产品体验和交付方式以 Node.js 18+ 的 NPM 全局安装为主，命令分组清晰，凭据可持久化，一次性参数可覆盖本地配置，支持文本与 JSON 输出，便于交互终端和自动化脚本共同使用。

本项目采用 NPM 包交付，`package.json#bin.stepfun` 指向 `dist/index.js`，运行环境要求 Node.js >= 18。功能范围限定为 StepFun 当前支持的 CLI 能力；暂不支持的模态和端点，例如视频、音乐、音色克隆、Agent 工作流等，不暴露占位命令。

## 目标

1. 提供 `stepfun` 命令访问 StepFun 文本、语音和图像编辑能力。
2. 提供认证、配置、模型列表、业务命令、结构化输出和脚本友好错误处理。
3. 严格执行四个 Region 与 Base URL 的映射，避免套餐、地区和计费模式混用。
4. 在不支持的能力上保持显式边界，不提供空壳命令。

## 非目标

- 不实现 StepFun 当前未纳入本 CLI 范围的能力：视频生成、音乐生成、音色克隆、角色/Agent 工作流。
- 不实现多账号 Profile、组织/项目管理、用量账单查询。
- 不在 CLI 内保存加密密钥；配置文件仍为本地明文 JSON，文档给出安全提示。
- 不绕过 StepFun 官方 API 协议模拟未公开端点。
- 不把独立二进制作为默认安装路径；二进制仅作为可选 Release artifact。

## 用户与场景

- 开发者在本机快速调用 chat、TTS、ASR、图像编辑接口。
- CI 或自动化脚本通过环境变量注入 API Key，并消费 JSON 输出。
- 国内/国际、StepPlan/PayGo 用户需要明确选择对应 Region。
- 支持人员或开发者使用 `--dry-run` 排查端点、参数和文件路径，不暴露密钥、不发起网络请求。

## 功能需求

### 全局参数

`stepfun` 支持：

| 参数 | 要求 |
| --- | --- |
| `--api-key <key>` | 单次命令覆盖所有其他认证来源 |
| `--region <region>` | 仅允许 `StepPlan-CN`、`StepPlan-Global`、`PayGo-CN`、`PayGo-Global` |
| `--base-url <url>` | 覆盖 Region 映射，用于代理和本地调试 |
| `--output <text|json>` | 控制成功输出和错误信封格式 |
| `--timeout <seconds>` | 正数，默认 300 秒 |
| `--quiet` | 隐藏非必要进度输出 |
| `--verbose` | 预留 HTTP 诊断开关 |
| `--dry-run` | 打印请求摘要后退出，不要求 API Key，不发网络请求 |
| `--non-interactive` | 禁止交互提示 |
| `--no-color` | 预留颜色/动画禁用开关 |

配置解析优先级为 `flag > environment > config > default`。

### Region

| Region | Base URL |
| --- | --- |
| `StepPlan-CN` | `https://api.stepfun.com/step_plan/v1` |
| `StepPlan-Global` | `https://api.stepfun.ai/step_plan/v1` |
| `PayGo-CN` | `https://api.stepfun.com/v1` |
| `PayGo-Global` | `https://api.stepfun.ai/v1` |

默认 Region 为 `PayGo-CN`。StepPlan Region 官方仅承诺 chat/reasoning 端点；语音和图像命令在 StepPlan 下执行时应提示风险，`--quiet` 下不提示。

### 认证与配置

- `stepfun auth login`：交互选择 Region，再隐藏输入 API Key，保存到 `~/.stepfun-cli/config.json`。
- `stepfun auth status`：显示认证状态、认证来源、掩码后的 API Key、Region 和 Base URL。
- `stepfun auth logout [--yes]`：清除本地配置；非交互模式必须传 `--yes`。
- `stepfun config set <key> <value>`：支持 `api_key`、`base_url`、`region`、`output`、`timeout`、`default_text_model`、`default_speech_model`。
- `stepfun config show`：以 JSON 输出本地配置并掩码 API Key。

### 模型列表

`stepfun models list` 输出内置支持模型：

- Text: `step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- Speech: `stepaudio-2.5-tts`, `stepaudio-2.5-asr`
- Image: `step-image-edit-2`

### 文本对话

`stepfun text chat` 支持：

- `--message <text>`（可重复，支持 `system:` / `user:` / `assistant:` 角色前缀）
- `--prompt <text>`（`--message` 的兼容别名）
- `--model <model>`
- `--system <text>`
- `--messages-file <path|->`
- `--temperature <number>`
- `--top-p <number>`
- `--max-tokens <int>`
- `--stream` / `--no-stream`

`--message` / `--prompt` 与 `--messages-file` 至少提供一个。同时提供 `--message` 与 `--prompt` 时以 `--message` 为准。JSON 输出下禁用流式，文本输出且 stdout 为 TTY 时默认流式。

流式解析应支持标准 SSE 分片、多行 data、CRLF、注释和末尾未闭合事件。正文输出到 stdout；推理状态输出到 stderr 且不得暴露原始推理内容，`--quiet` 下不显示。内部应保留正文、推理内容、工具调用、结束原因和 usage，供后续结构化输出使用。

### 语音合成

`stepfun speech synthesize` 支持：

- `--text <text>`
- `--output <file>`
- `--voice <voice>`
- `--model <model>`
- `--format <wav|mp3|flac|opus|pcm>`
- `--speed <number>`
- `--volume <number>`
- `--sample-rate <number>`

未传 `--voice` 时，国内 Region 默认 `cixingnansheng`，国际 Region 默认 `lively-girl`。

### 语音识别

`stepfun speech recognize` 支持：

- `--file <audio-file>`
- `--model <model>`
- `--language <code>`
- `--hotwords <a,b,c>`

支持 `ogg`、`mp3`、`wav`、`pcm`。PCM 按 `pcm_s16le`、16 kHz、16 bit、单声道发送。

### 图像编辑

`stepfun image edit` 支持：

- `--file <image-file>`
- `--prompt <text>`
- `--model <model>`
- `--response-format <b64_json|url>`
- `--seed <int>`
- `--steps <int>`
- `--cfg-scale <number>`
- `--negative-prompt <text>`

## 错误与退出码

| 退出码 | 类型 | 场景 |
| --- | --- | --- |
| 0 | OK | 成功 |
| 1 | API_ERROR | 非鉴权类 API 错误 |
| 2 | USAGE | 参数非法、未知配置键、非交互命令需要确认 |
| 3 | AUTH | 缺少 API Key、401、403 |
| 6 | NETWORK | 网络失败、DNS、连接拒绝、超时 |

JSON 模式下错误输出到 stderr，格式为 `{ "error": { "code": "...", "message": "...", "hint": "..." } }`。

## 验收标准

- `npm test` 通过。
- 四个 Region 的 URL 映射有自动化测试保护。
- 凭据优先级 `flag > env > config` 有自动化测试保护。
- dry-run 不要求 API Key，不发网络请求，不输出 API Key 或文件二进制。
- README、PRD、设计文档和 `--help` 暴露的参数保持一致。
