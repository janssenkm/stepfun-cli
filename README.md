# StepFun CLI

`StepFun-CLI` 是用于在终端调用阶跃星辰（StepFun）模型能力的命令行工具。NPM 包名为 `@stepfun-ai/cli`，全局命令为 `stepfun`。

当前支持：

- 文本生成：`step-3.5-flash`、`step-3.5-flash-2603`、`step-3.7-flash`
- 语音合成：`stepaudio-2.5-tts`
- 语音识别：`stepaudio-2.5-asr`
- 图像编辑：`step-image-edit-2`

## 安装

StepFun-CLI 采用 NPM-first 发布模式。推荐通过 NPM 全局安装；运行环境需要 Node.js 18 或更高版本：

```bash
npm install -g @stepfun-ai/cli
stepfun --version
```

首次使用的最短流程：

```bash
stepfun auth login
stepfun auth status
stepfun text chat --prompt "用一句话介绍阶跃星辰"
```

在 CI 或其他非交互环境中，建议通过环境变量注入密钥，并显式指定输出格式：

```bash
export STEPFUN_API_KEY="YOUR_API_KEY"
stepfun --region PayGo-CN --output json text chat --prompt "返回一句问候"
```

如需在没有 Node.js/npm 的环境运行，也可以从项目 Release 获取可选的独立二进制附件：Linux 为 `bin/linux/x64/stepfun`，macOS 为 `bin/macos/x64/stepfun`，Windows 为 `bin/windows/x64/stepfun.exe`。独立二进制不是默认安装路径，且不能通过 `stepfun update` 自升级。

## Region 与 API 地址

**术语约定**：
- **PayGo**（按量计费）= 无套餐，按 API 调用量计费。对应 Region 为 `PayGo-CN` / `PayGo-Global`，覆盖全部模型与端点（chat、语音、图像）。
- **StepPlan**（套餐）= 订阅制套餐。对应 Region 为 `StepPlan-CN` / `StepPlan-Global`，官方文档仅承诺覆盖 chat / reasoning 端点。

Region 必须使用下列标识符，套餐类型和国内/国际地址不能混用：

| Region | 计费/套餐 | 使用场景 | Base URL |
| --- | --- | --- | --- |
| `StepPlan-CN` | 套餐（StepPlan） | 国内版（stepfun.com）StepPlan 套餐 | `https://api.stepfun.com/step_plan/v1` |
| `StepPlan-Global` | 套餐（StepPlan） | 国际版（stepfun.ai）StepPlan 套餐 | `https://api.stepfun.ai/step_plan/v1` |
| `PayGo-CN` | 无套餐 / 按量计费 | 国内版（stepfun.com）API 按量计费 | `https://api.stepfun.com/v1` |
| `PayGo-Global` | 无套餐 / 按量计费 | 国际版（stepfun.ai）API 按量计费 | `https://api.stepfun.ai/v1` |

未配置 Region 时默认使用 `PayGo-CN`。

运行时配置统一按 `flag > 环境变量 > 配置文件 > 默认值` 解析：

1. API Key：`--api-key` > `STEPFUN_API_KEY` > `~/.stepfun-cli/config.json` 中的 `apiKey`。
2. Region：`--region` > `STEPFUN_REGION` > 配置文件中的 `region` > `PayGo-CN`。
3. Base URL：`--base-url` > `STEPFUN_BASE_URL` > 配置文件中的 `baseUrl` > 当前 Region 对应的 URL。
4. 输出格式：`--output` > `STEPFUN_OUTPUT` > 配置文件中的 `output` > stdout 是终端时为 `text`，否则为 `json`（便于在 CI、管道、脚本中用 JSON 处理）。
5. 超时：`--timeout` > `STEPFUN_TIMEOUT` > 配置文件中的 `timeout` > `300` 秒。

> 注意：自本版本起，**环境变量优先级高于配置文件**（此前版本是配置文件优先）。若同时配置了二者，环境变量的值会生效。

`--base-url` 用于代理、兼容服务或本地调试，它会绕过 Region 的 URL 映射。请确认自定义地址与所用套餐及网络区域匹配。

## 模型差异说明（国内版 stepfun.com / 国际版 stepfun.ai）

国内版（stepfun.com）与国际版（stepfun.ai）官方文档在个别模型上存在差异，CLI 默认与文档以国际版列出的模型名为准：

- **图像编辑**：CLI 默认使用 `step-image-edit-2`（输入图片最大 4096×4096，官方文档未声明最小尺寸），国际版与国内版均列出此模型。国内版文档另列出 `step-1x-edit`（另一图像编辑模型），其尺寸约束不同：最小 64px、最大 1728px、像素面积 ≤ 1024×1024；**国际版（stepfun.ai）文档未列出 `step-1x-edit`**。CLI 不内置 `step-1x-edit`，如需使用可通过 `--model step-1x-edit` 显式指定（仅在国内版 Region 可用）。
- **语音识别**：CLI 默认使用 `stepaudio-2.5-asr`（国际版文档列出）。国际版文档提到的 `step-asr-1.1-stream` 是 `stepaudio-2.5-asr` 的向后兼容别名，当前二者等同。国内版 ASR 文档另列出 `stepaudio-2-asr-pro`；CLI 未内置该模型，需要时可通过 `--model` 显式指定。

## 认证与配置

推荐使用交互式登录。命令会先显示四个 Region 的方向键菜单，再以隐藏输入方式读取 API Key：

```bash
stepfun auth login
stepfun auth status
```

也可以非交互配置：

```bash
stepfun config set region StepPlan-CN
stepfun config set api_key "YOUR_API_KEY"
stepfun config show
```

清除已保存的凭据与配置：

```bash
stepfun auth logout
stepfun auth logout --yes   # 跳过确认，常用于脚本
```

`auth logout` 会清空 `~/.stepfun-cli/config.json` 中的 `apiKey`、`region`、`baseUrl`、`output`、`timeout` 以及默认模型等字段。默认会弹出确认提示，加 `--yes` 可直接执行；配合 `--non-interactive` 时必须传 `--yes`，否则报错退出。

设置自定义 API 地址：

```bash
stepfun config set base_url "https://proxy.example.com/v1"
```

`config set <key> <value>` 支持的全部键：

| 键 | 说明 | 等价配置字段 |
| --- | --- | --- |
| `api_key` | API Key | `apiKey` |
| `base_url` | 自定义 API 地址 | `baseUrl` |
| `region` | Region 标识符 | `region`（并清除 `baseUrl`） |
| `output` | 默认输出格式（`text` / `json`） | `output` |
| `timeout` | HTTP 请求超时（秒，必须为正数） | `timeout` |
| `default_text_model` | `text chat` 的默认模型 | `defaultTextModel` |
| `default_speech_model` | `speech synthesize` 的默认模型 | `defaultSpeechModel` |

设置默认模型后，`text chat` 和 `speech synthesize` 在未传 `-m` / `--model` 时会使用配置中的默认模型，否则回退到内置默认（`step-3.5-flash` 与 `stepaudio-2.5-tts`）：

```bash
stepfun config set default_text_model step-3.7-flash
stepfun text chat --prompt "你好"          # 实际使用 step-3.7-flash

stepfun config set default_speech_model stepaudio-2.5-tts
stepfun speech synthesize --text "你好"    # 实际使用 stepaudio-2.5-tts
```

`config show` 会掩码显示 API Key 后输出当前完整配置。该命令始终输出 JSON，并且只展示配置文件内容，不会合并环境变量或命令行参数。要查看一次 API 调用最终采用的认证来源、Region 和 Base URL，请使用 `auth status`。

或者只对单次调用传入认证信息：

```bash
stepfun --region PayGo-Global --api-key "YOUR_API_KEY" models list
```

也可通过环境变量提供密钥：

```bash
export STEPFUN_API_KEY="YOUR_API_KEY"
stepfun --region PayGo-CN auth status
```

除 API Key 外，CLI 还识别以下环境变量，优先级高于配置文件、低于命令行 flag：

| 环境变量 | 作用 | 等价 flag |
| --- | --- | --- |
| `STEPFUN_API_KEY` | API Key | `--api-key` |
| `STEPFUN_REGION` | Region 标识符 | `--region` |
| `STEPFUN_BASE_URL` | 自定义 API 地址 | `--base-url` |
| `STEPFUN_OUTPUT` | 输出格式（`text` / `json`） | `--output` |
| `STEPFUN_TIMEOUT` | HTTP 请求超时（秒） | `--timeout` |

非交互场景（CI、管道、被其他程序调用）中 stdout 通常不是终端，此时若未显式指定 `--output`，CLI 会自动选择 `json`，方便下游程序解析；在交互终端中则默认 `text`。

配置保存在 `~/.stepfun-cli/config.json`。`auth status` 和 `config show` 会掩码显示 API Key，但文件本身以明文 JSON 保存。不要提交、分享或备份该文件到不受信任的位置；在多用户系统上建议限制文件权限：

```bash
chmod 700 ~/.stepfun-cli
chmod 600 ~/.stepfun-cli/config.json
```

在 CI 中优先使用密钥管理服务注入 `STEPFUN_API_KEY`，不要将密钥写入仓库、脚本参数或构建日志。命令行参数可能出现在 shell 历史和进程列表中。

## 命令

### 更新 CLI

检查 NPM 上的最新版但不安装：

```bash
stepfun update --check
```

升级通过 NPM 全局安装的 CLI：

```bash
stepfun update
```

命令会显示当前版本和最新版；检查或 `npm install --global @stepfun-ai/cli@latest` 失败时返回非零退出码。独立可执行文件不能通过 NPM 自升级，命令会停止并提示从项目 Releases 页面下载最新版。私有镜像可通过 `--registry <url>` 指定：

```bash
stepfun update --check --registry https://registry.npmmirror.com
```

查看内置帮助和模型列表：

```bash
stepfun --help
stepfun models list
stepfun --output json models list
```

### 文本对话

```bash
stepfun text chat \
  --prompt "Hello, who are you?" \
  --model step-3.5-flash
```

默认模型为 `step-3.5-flash`（未传 `-m` 时按 `--model` > 配置 `default_text_model` > `step-3.5-flash` 解析，可通过 `config set default_text_model` 修改）。需要原始 API 响应时，将全局参数放在子命令之前：

```bash
stepfun --output json text chat --prompt "你好" --model step-3.7-flash
```

可选参数（仅在传入时写入请求体，未传则保持服务端默认）：

| 参数 | 说明 | 对应字段 |
| --- | --- | --- |
| `-p, --prompt <text>` | 用户提示词；与 `--messages-file` 至少传一个 | 追加为末尾 `{role:'user'}` |
| `--system <text>` | 系统消息，置于所有消息最前 | messages 首条 `{role:'system'}` |
| `--messages-file <path\|->` | 从文件或 stdin（`-`）读取 JSON 数组作为 messages | body.messages |
| `--temperature <number>` | 采样温度 | body.temperature |
| `--top-p <number>` | 核采样概率 | body.top_p |
| `--max-tokens <int>` | 最大生成 token 数 | body.max_tokens |

`--prompt` 与 `--messages-file` 的组合规则：二者至少传一个，否则报错退出。`--messages-file` 提供的消息数组按原样发送，传入 `--prompt` 时会作为末尾 user 消息追加；`--system` 始终插在最前。从 stdin 读取示例：

```bash
echo '[{"role":"user","content":"hi"}]' | stepfun text chat --messages-file -
```

消息文件示例（`messages.json`）：

```json
[
  { "role": "user", "content": "北京有哪些适合周末参观的博物馆？" },
  { "role": "assistant", "content": "可以考虑国家博物馆、首都博物馆等。" }
]
```

在已有上下文后追加一轮提问：

```bash
stepfun text chat --messages-file messages.json --prompt "请按城区分类"
```

流式输出：当输出格式不是 `--output json` 且 stdout 是终端（TTY）时，`text chat` 默认开启流式，逐 token 打印响应内容直至结束换行。可用 `--stream` 显式开启、`--no-stream` 显式关闭。`--output json` 与流式不兼容（需要完整 JSON 对象），即使传入 `--stream` 也会强制走非流式路径并输出完整响应。流式同样透传 `--temperature`/`--top-p`/`--max-tokens` 等可选参数。

### 语音合成

```bash
stepfun speech synthesize \
  --text "你好，我是阶跃星辰的大模型。" \
  --voice cixingnansheng \
  --output hello.mp3 \
  --model stepaudio-2.5-tts
```

默认输出文件为 `output.mp3`。未传 `--voice` 时，国内 Region 兜底音色为 `cixingnansheng`，国际 Region 兜底音色为 `lively-girl`（官方文档未定义服务端默认音色，`lively-girl` 为示例音色）；也可通过 `--voice` 使用官方或已复刻的 Voice ID。另外，使用 `stepaudio-2.5-tts` 时，`--text` 中圆括号 `()` 内的内容会被当作指令默认不发音。

可选参数（仅在传入时写入请求体，未传则保持服务端默认）：

| 参数 | 说明 | 对应字段 |
| --- | --- | --- |
| `--format <wav\|mp3\|flac\|opus\|pcm>` | 响应音频格式 | body.response_format |
| `--speed <number>` | 语速 | body.speed |
| `--volume <number>` | 音量 | body.volume |
| `--sample-rate <number>` | 采样率 | body.sample_rate |

示例：

```bash
stepfun speech synthesize --text "你好" --voice cixingnansheng --speed 1.2 --format wav --output hello.wav
```

这里的 `speech synthesize --output <file>` 是子命令的音频文件路径，不是全局输出格式。全局 `--output text|json` 必须放在一级命令前，例如 `stepfun --output json speech recognize ...`。

### 语音识别

```bash
stepfun speech recognize \
  --file hello.wav \
  --model stepaudio-2.5-asr
```

识别接口支持 `ogg`、`mp3`、`wav` 和 `pcm`。CLI 会按官方 HTTP/SSE 协议发送 Base64 音频并输出最终识别文本；`.pcm` 按 `pcm_s16le`、16 kHz、16 bit、单声道处理。

可选参数（仅在传入时写入请求体，未传则保持服务端默认）：

| 参数 | 说明 | 对应字段 |
| --- | --- | --- |
| `--language <code>` | 语言代码，如 `zh`、`en` | audio.input.transcription.language |
| `--hotwords <a,b,c>` | 逗号分隔的热词列表 | audio.input.transcription.hotwords |

示例：

```bash
stepfun speech recognize --file hello.wav --language zh --hotwords 阶跃,星辰
```

输出 JSON：

```bash
stepfun --output json speech recognize --file hello.wav
```

JSON 结果包含最终文本和产生该结果的 SSE 事件，例如可用 `jq` 只取文本：

```bash
stepfun --quiet --output json speech recognize --file hello.wav | jq -r '.text'
```

### 图像编辑

```bash
stepfun image edit \
  --file input.png \
  --prompt "Make it cyberpunk style" \
  --model step-image-edit-2
```

默认请求 `b64_json` 并将 Base64 结果输出到终端；可通过 `--response-format url` 请求 URL 响应。输入图片最大分辨率为 4096×4096（官方文档未声明最小尺寸）。

`b64_json` 可能很长。脚本中建议使用 JSON 输出并解码到文件，或改为请求 URL：

```bash
stepfun --quiet --output json image edit \
  --file input.png --prompt "提升清晰度" \
  | jq -r '.data[0].b64_json' | base64 --decode > edited.png

stepfun --quiet --output json image edit \
  --file input.png --prompt "提升清晰度" --response-format url \
  | jq -r '.data[0].url'
```

可选参数（仅在传入时写入表单，未传则保持服务端默认）：

| 参数 | 说明 | 对应字段 |
| --- | --- | --- |
| `--seed <int>` | 随机种子 | seed |
| `--steps <int>` | 推理步数 | steps |
| `--cfg-scale <number>` | CFG scale | cfg_scale |
| `--negative-prompt <text>` | 负向提示词 | negative_prompt |

示例：

```bash
stepfun image edit \
  --file input.png \
  --prompt "cyberpunk style" \
  --seed 1 --steps 30 --cfg-scale 7 --negative-prompt "blurry"
```

### 全局参数

全局参数应放在一级命令之前，例如 `stepfun --quiet speech synthesize ...`。

| 参数 | 含义 |
| --- | --- |
| `--api-key <key>` | 单次调用使用的 API Key |
| `--region <region>` | 选择四个受支持 Region 之一 |
| `--base-url <url>` | 覆盖 Region 对应的 API 地址 |
| `--output <format>` | 输出格式：`text` 或 `json`；未指定时，stdout 是终端默认 `text`，否则默认 `json` |
| `--timeout <seconds>` | 单次 HTTP 请求超时秒数（默认 300） |
| `--dry-run` | 只打印将要发送的请求摘要（命令、HTTP 方法、完整 URL、模型与关键参数）后退出，不要求 API Key，不发起任何网络请求；输出格式随 `--output` 切换，绝不打印 API Key 与文件二进制内容 |
| `--non-interactive` | 永不弹出交互提示；需要交互的命令（如 `auth login`、未带 `--yes` 的 `auth logout`）会直接报错退出 |
| `--quiet` | 隐藏非必要进度信息 |
| `--verbose` | 请求详细输出（保留参数） |
| `--no-color` | 禁用 ANSI 颜色和动画（保留参数） |

其中 `--verbose` 与 `--no-color` 当前为兼容性保留参数，现有命令尚未产生额外 HTTP 调试日志、ANSI 颜色或动画。

### Dry run 与脚本化调用

`--dry-run` 可用于核对最终 URL、模型和请求参数。它不读取 API Key、不创建 API client，也不发起网络请求：

```bash
stepfun --dry-run --output json --region PayGo-Global \
  text chat --model step-3.7-flash --prompt "你好"

stepfun --dry-run --output json image edit \
  --file input.png --prompt "提升清晰度"
```

文件型命令只在摘要中显示文件路径与字节数；文件不存在时显示路径和错误，不输出文件内容。`--dry-run` 仍会校验 Region、输出格式和命令参数，因此可用于 CI 中的调用契约检查。

各子命令的完整参数以 `--help` 为准：

```bash
stepfun text chat --help
stepfun speech synthesize --help
stepfun speech recognize --help
stepfun image edit --help
```

## 退出码与错误处理

CLI 按错误类别返回结构化退出码，便于脚本与 CI 判定失败原因：

| 退出码 | 含义 | 触发场景 |
| --- | --- | --- |
| `0` | 成功 | 正常完成 |
| `1` | 通用 / API 错误 | HTTP 非 2xx（非 401/403），如 429 限流、400 参数错误、500 服务端错误 |
| `2` | USAGE（参数非法） | 未知 Region、`--temperature`/`--top-p`/`--max-tokens`/`--timeout` 等数值参数为 NaN、`text chat` 既无 `--prompt` 又无 `--messages-file`、`config set` 未知键、`--non-interactive` 下的 `auth login`/`auth logout` |
| `3` | AUTH（鉴权） | 缺少 API Key、401、403 |
| `6` | NETWORK（网络） | fetch 网络失败、连接拒绝、DNS 解析失败、`--timeout` 触发的 abort |

**文本模式**下错误输出形如：

```
Error: API key is required. Run `stepfun auth login` or use --api-key
Hint: Run `stepfun auth login`, set `STEPFUN_API_KEY`, or pass `--api-key`.
(exit code 3)
```

**JSON 模式**（`--output json`，或在非交互管道中自动启用）下错误以结构化信封输出到 **stderr**，成功结果仍走 stdout：

```json
{
  "error": {
    "code": "AUTH",
    "message": "API key is required. Run `stepfun auth login` or use --api-key",
    "hint": "Run `stepfun auth login`, set `STEPFUN_API_KEY`, or pass `--api-key`."
  }
}
```

`code` 字段取值为可读名字：`OK` / `API_ERROR` / `USAGE` / `AUTH` / `NETWORK`，分别对应退出码 0 / 1 / 2 / 3 / 6。

## 开发

需要 Node.js 18 或更高版本；CLI 使用 Node 18 内置的 `fetch`、`FormData` 和 `Blob`，不再引入额外 HTTP/multipart 运行时依赖。

```bash
git clone https://github.com/janssenkm/stepfun-cli.git
cd stepfun-cli
npm install
npm run build
```

构建使用 TypeScript 编译器，产物位于 `dist/`。在仓库中直接运行：

```bash
node dist/index.js --help
```

运行测试：

```bash
npm test
```

测试命令会先构建项目，再使用 Node.js 内置测试运行器执行 `test/*.test.js`。端到端测试使用本地模拟 HTTP 服务，不需要真实 API Key。

可选：打包 Windows、Linux 和 macOS 的 Node.js 18 x64 独立可执行文件，用作 Release artifacts。主发布路径仍是 NPM 包；该命令会通过 `npx pkg@5.8.1` 按需下载打包工具：

```bash
npm run pkg
```

打包结果写入：

```text
bin/
  linux/x64/stepfun
  macos/x64/stepfun
  windows/x64/stepfun.exe
```

这些二进制文件不进入 NPM 包。发布 NPM 包前，`prepublishOnly` 会自动执行构建；也可以先用以下命令检查待发布内容：

```bash
npm pack --dry-run
```
