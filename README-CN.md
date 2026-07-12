# stepfun

[English](README.md)

阶跃星辰（[StepFun](https://platform.stepfun.com)）**StepPlan** 订阅的命令行工具——在终端或 Agent 中调用对话、图像、语音、文件与账户能力。

`stepfun` 面向 StepPlan（Global + CN 两站）。生成类请求（对话 / 语音 / 图像 / token 计数）通过 `/step_plan/v1` 基址按订阅计费；管理类请求（模型 / 文件 / 账户 / 系统音色）使用公共 `/v1` 基址——两个基址接受同一个 API Key。

## 安装

```bash
npm install -g @stepfun-ai/cli
# 或从源码运行：
git clone <repo> && cd stepfun-cli && npm install && npm run build
node dist/index.js --help
```

需要 Node.js ≥ 18（使用原生 `fetch`、`FormData`、`AbortSignal`）。

## 快速开始

```bash
# 1. 保存 StepPlan API Key（在 https://platform.stepfun.com 获取）
stepfun auth login --api-key sk-... --region StepPlan-Global

# 2. 检查是否生效
stepfun auth status
stepfun models list

# 3. 对话（流式）
stepfun text chat --model step-3.7-flash --message "你好，阶跃！" --stream
```

## 命令

| 资源 | 命令 |
|---|---|
| **text** | `text chat`（OpenAI Completions）、`text messages`（Anthropic Messages）、`text responses`（OpenAI Responses） |
| **image** | `image generate`、`image edit` |
| **speech** | `speech synthesize`（语音合成）、`speech recognize`（语音识别） |
| **models** | `models list`、`models get <id>` |
| **file** | `file upload`、`file list`、`file get`、`file content`、`file delete` |
| **account** | `account show` |
| **token** | `token count` |
| **auth** | `auth login`、`auth status`、`auth logout` |
| **config** | `config show`、`config set` |

任意命令加 `--help` 查看完整选项，例如 `stepfun text chat --help`。各资源 flag 参考：[docs/resources/](docs/resources/)；完整文档索引：[docs/README.md](docs/README.md)。

### 对话

```bash
# OpenAI 兼容 Completions（流式 + 推理）
stepfun text chat --model step-3.7-flash --message "计算 (80+20)/5" \
  --reasoning-effort high --stream

# 多模态（图像输入）
stepfun text chat --model step-3.7-flash --message "描述这张图" --image photo.jpg

# Anthropic 兼容 Messages
stepfun text messages --model step-3.7-flash --message "hi" --max-tokens 256

# OpenAI Responses（支持结构化输出）
stepfun text responses --input "提取情感" --json-schema schema.json --effort high

# 工具调用 / Function Calling
stepfun text chat --model step-3.7-flash --message "北京天气如何？" \
  --tool '{"type":"function","function":{"name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}'
```

### 图像

```bash
stepfun image generate --prompt "雪山脚下的宁静湖泊" --out lake.png
stepfun image edit --image input.png --prompt "改成夜晚" --out night.png
```

### 语音

```bash
stepfun speech synthesize --text "你好，阶跃" --out out.mp3
stepfun speech synthesize --text "流式合成" --stream --out out.mp3
stepfun speech recognize --file recording.mp3 --language zh
```

### 文件与账户

```bash
stepfun file upload --file image.png
stepfun file list
stepfun account show
stepfun token count --model step-3.7-flash --message "统计这些 token"
```

## 配置

配置文件位于 `~/.stepfun-cli/config.json`：

```jsonc
{
  "apiKey": "sk-...",
  "region": "StepPlan-Global",          // 或 StepPlan-CN
  "genBaseUrl": null,                   // 可选覆盖（默认由 region 推导）
  "apiBaseUrl": null,                   // 可选覆盖
  "output": "text",                     // text | json
  "timeout": 120,
  "defaultTextModel": "step-3.7-flash",
  "defaultSpeechTtsModel": "stepaudio-2.5-tts",
  "defaultSpeechAsrModel": "stepaudio-2.5-asr",
  "defaultImageModel": "step-image-edit-2"
}
```

**解析优先级**：命令行 flag > 环境变量（`STEPFUN_API_KEY`、`STEPFUN_REGION`、`STEPFUN_GEN_BASE_URL`、`STEPFUN_API_BASE_URL`、`STEPFUN_OUTPUT`、`STEPFUN_TIMEOUT`）> 配置文件 > 默认值。

## 区域

| 区域 | 生成基址 | 管理基址 |
|---|---|---|
| `StepPlan-Global` | `https://api.stepfun.ai/step_plan/v1` | `https://api.stepfun.ai/v1` |
| `StepPlan-CN` | `https://api.stepfun.com/step_plan/v1` | `https://api.stepfun.com/v1` |

同一个 StepPlan API Key 在两个基址都有效。生成类端点按订阅计费；管理类端点是开放平台通用功能。

## 全局 flag

```
--api-key <key>          StepFun API Key（覆盖配置）
--region <region>        StepPlan-Global | StepPlan-CN
--base-url <url>         覆盖生成（StepPlan）基址
--api-base-url <url>     覆盖管理（/v1）基址
--output <format>        text | json（管道时自动 json）
--timeout <seconds>      请求超时
--quiet                  抑制非必要输出
--verbose                打印 HTTP 请求/响应细节
--dry-run                只打印请求体，不调用 API
--non-interactive        关闭交互提示（CI/Agent 模式）
--help, --version
```

## 退出码

`0` 成功 · `1` 一般错误 · `2` 用法错误 · `3` 鉴权失败 · `4` 配额/限流 · `5` 超时 · `6` 网络 · `10` 内容审核。

## 开发

```bash
npm run build          # tsc → dist/
npm test               # 构建 + node --test test/*.test.js
```

架构参考 `mmx` CLI（`.repos/cli`）：自研 flag 解析器（`src/args.ts`）、命令注册树（`src/registry.ts`），每个资源一个模块（`src/commands/`）。零运行时依赖。详见 [docs/DESIGN.md](docs/DESIGN.md)（或[文档索引](docs/README.md)）。

## License

MIT
