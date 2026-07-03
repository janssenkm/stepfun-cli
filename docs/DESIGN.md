# StepFun-CLI Design

## 架构

项目使用 Node.js 18+ + TypeScript 实现：

- `src/index.ts`：Commander 命令树、参数解析、配置解析、错误分类、输出格式化。
- `src/config.ts`：Region 映射和 `~/.stepfun-cli/config.json` 读写。
- `src/api.ts`：StepFun HTTP 客户端，封装 chat、TTS、ASR、image edit；HTTP 与 multipart 使用 Node 18 内置 `fetch`、`FormData`、`Blob`。
- `src/update.ts`：输出 NPM 更新指令；不联网检查或自动修改全局安装。
- `test/*.test.js`：CLI 契约、端到端模拟服务、认证边界和更新逻辑测试。

发布模式为 NPM-first。编译由 TypeScript 编译器输出 CJS 到 `dist/`，`package.json#bin.stepfun` 指向 `dist/index.js`，NPM 包只发布 `dist/`。`pkg` 仅通过 `npx pkg@5.8.1` 按需下载，用于生成可选 Release artifacts，不是默认安装路径；独立二进制统一写入 `bin/{os}/x64/stepfun(.exe)`，且不进入 NPM 包。

## 命令树

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

未纳入当前范围的能力不暴露占位命令，避免用户误以为 StepFun-CLI 当前支持视频、音乐或 Agent 工作流。

## 配置解析

运行时统一采用：

```text
flag > environment > config > default
```

环境变量包括：

- `STEPFUN_API_KEY`
- `STEPFUN_REGION`
- `STEPFUN_BASE_URL`
- `STEPFUN_OUTPUT`
- `STEPFUN_TIMEOUT`

`region` 必须命中 `REGION_PROFILES`。`baseUrl` 可被 `--base-url` 或 `STEPFUN_BASE_URL` 覆盖，此时调用方自行承担套餐/地区匹配责任。

## HTTP 设计

所有请求携带：

- `Authorization: Bearer <apiKey>`
- `User-Agent: stepfun-cli/<version>` 实际由 `src/version.ts` 生成

端点：

| 能力 | 方法 | Path |
| --- | --- | --- |
| Chat | POST | `/chat/completions` |
| Chat Stream | POST | `/chat/completions` with `stream: true` |
| TTS | POST | `/audio/speech` |
| ASR | POST | `/audio/asr/sse` |
| Image Edit | POST | `/images/edits` |

Chat、TTS、ASR 使用 JSON 请求；Image Edit 使用 multipart/form-data，并由原生 `FormData` 生成 boundary。

## 输出策略

- 成功结果默认在 TTY 输出文本，在非 TTY 输出 JSON。
- `--output text|json` 可显式覆盖。
- 错误总是输出到 stderr。
- JSON 错误信封稳定为 `{ error: { code, message, hint? } }`。
- `--quiet` 只隐藏进度提示，不隐藏结果和错误。
- 流式 chat 使用增量 SSE 解析器，支持 CRLF、多行 data、注释和跨 chunk 缓冲。
- 流式正文写入 stdout；推理仅产生 stderr 状态提示，`--quiet` 下关闭，不输出原始推理内容。
- 流式解析器累积正文、推理、工具调用、结束原因和 usage；非流式 JSON 保留原始 API 响应。

## Dry Run

`--dry-run` 是请求检查工具，设计约束：

- 不要求 API Key。
- 不创建 API client。
- 不发起网络请求。
- 输出完整 URL、HTTP 方法、命令名、模型和关键参数。
- 文件只输出 path/size 或 path/error，不读取或打印二进制内容。
- 仍执行参数合法性校验，例如数值参数、Region、`text chat` 的 message/prompt/messages-file 要求。

## 错误分类

`src/index.ts` 中的 `classifyError` 负责将异常映射为退出码：

- `UsageError` -> 2
- 缺少 API Key 或 401/403 -> 3
- fetch/Abort/网络类错误 -> 6
- 其他 APIError -> 1
- 未分类错误 -> 1

该设计让脚本可以只看退出码，也可以在 JSON 模式下解析错误类型。

## 安全边界

- API Key 只在 `Authorization` 头中发送。
- `auth status` 和 `config show` 掩码显示 API Key。
- dry-run 不输出 API Key。
- 配置文件为明文 JSON，README 明确建议限制文件权限并在 CI 使用环境变量。

## 测试策略

- 契约测试保护 Region URL、凭据优先级、输出格式、错误码、dry-run。
- 端到端测试使用本地 HTTP 服务断言请求 path、headers、body 和输出解析。
- 更新测试断言提示命令，不访问真实 NPM 或修改全局安装。
