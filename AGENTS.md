# StepFun-CLI 仓库工作规范

## 1. 项目定位

本项目名为 `StepFun-CLI`，NPM 包名为 `@stepfun-ai/cli`，全局命令为 `stepfun`。工具用于在终端调用阶跃星辰（StepFun）的模型能力。

发布模式为 NPM-first：

- NPM 包运行入口：`dist/index.js`
- `package.json#bin.stepfun`：`dist/index.js`
- 运行环境：Node.js 18 或更高版本
- 可选独立二进制仅作为 Release artifacts，不作为默认安装路径

可选独立二进制产物路径固定为：

```text
bin/
  linux/x64/stepfun
  macos/x64/stepfun
  windows/x64/stepfun.exe
```

## 2. 核心架构与技术栈

- **语言**：Node.js 18+ + TypeScript
- **CLI 框架**：`commander`
- **交互组件**：`prompts`
- **网络请求**：Node.js 18 内置 `fetch`
- **multipart**：Node.js 18 内置 `FormData` / `Blob`
- **构建**：`tsc` 输出 CommonJS 到 `dist/`
- **可选二进制打包**：`npm run pkg` 通过 `npx pkg@5.8.1` 按需下载打包工具

不得重新引入 `node-fetch`、`form-data`、`dotenv`、`tsup` 或本地 `pkg` devDependency，除非有明确需求并同步更新本文档、README、PRD 和设计文档。

## 3. 支持的模型能力

当前内置模型列表：

- **文本生成 (Text/Chat)**：`step-3.5-flash`、`step-3.5-flash-2603`、`step-3.7-flash`
- **语音合成 (Speech/TTS)**：`stepaudio-2.5-tts`
- **语音识别 (Speech/ASR)**：`stepaudio-2.5-asr`
- **图像编辑 (Image/Edit)**：`step-image-edit-2`

新增模型能力时，应同步更新：

- `src/index.ts` 中的模型列表和命令参数
- `src/api.ts` 中的 API 封装
- `README.md`
- `docs/PRD.md`
- `docs/DESIGN.md`
- 相关测试

## 4. API Region 映射

任何修改 API URL、Region、Base URL 解析逻辑时，必须严格遵循以下映射，不允许混用套餐、地区和计费模式：

| Region | 描述 | Base URL |
| --- | --- | --- |
| `StepPlan-CN` | 国内版 StepPlan 套餐专用 | `https://api.stepfun.com/step_plan/v1` |
| `StepPlan-Global` | 国际版 StepPlan 套餐专用 | `https://api.stepfun.ai/step_plan/v1` |
| `PayGo-CN` | 国内版纯 API 按量计费 | `https://api.stepfun.com/v1` |
| `PayGo-Global` | 国际版纯 API 按量计费 | `https://api.stepfun.ai/v1` |

默认 Region 为 `PayGo-CN`。StepPlan Region 官方仅承诺覆盖 chat / reasoning 端点；语音和图像命令在 StepPlan Region 下执行时应给出风险提示，`--quiet` 下不提示。

## 5. 配置与鉴权

配置文件固定为：

```text
~/.stepfun-cli/config.json
```

配置读取优先级固定为：

```text
flag > environment > config > default
```

支持的环境变量：

- `STEPFUN_API_KEY`
- `STEPFUN_REGION`
- `STEPFUN_BASE_URL`
- `STEPFUN_OUTPUT`
- `STEPFUN_TIMEOUT`

认证命令：

- `stepfun auth login`：交互选择四个 Region 之一，再隐藏输入 API Key
- `stepfun auth status`：输出认证状态、认证来源、掩码后的 API Key、Region、Base URL
- `stepfun auth logout [--yes]`：清除本地凭据与配置

`auth status` 和 `config show` 必须掩码显示 API Key。dry-run、错误输出、调试输出不得泄露 API Key 或文件二进制内容。

## 6. 命令与参数边界

当前命令树：

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

全局参数：

- `--api-key <key>`
- `--region <region>`
- `--base-url <url>`
- `--output <text|json>`
- `--timeout <seconds>`
- `--dry-run`
- `--non-interactive`
- `--quiet`
- `--verbose`
- `--no-color`

`--dry-run` 必须满足：

- 不要求 API Key
- 不创建 API client
- 不发起网络请求
- 输出请求摘要
- 文件只显示 path/size 或 path/error

## 7. 输出与错误处理

默认输出策略：

- stdout 是 TTY 时默认 `text`
- stdout 不是 TTY 时默认 `json`
- `--output`、`STEPFUN_OUTPUT` 和配置文件可覆盖

错误固定输出到 stderr。JSON 错误信封格式：

```json
{
  "error": {
    "code": "AUTH",
    "message": "...",
    "hint": "..."
  }
}
```

退出码：

| 退出码 | 类型 | 场景 |
| --- | --- | --- |
| `0` | OK | 成功 |
| `1` | API_ERROR | 非鉴权类 API 错误 |
| `2` | USAGE | 参数非法、未知配置键、非交互命令需要确认 |
| `3` | AUTH | 缺少 API Key、401、403 |
| `6` | NETWORK | 网络失败、DNS、连接拒绝、超时 |

## 8. 开发与发布

常用命令：

```bash
npm install
npm run build
npm test
npm pack --dry-run
```

构建输出：

```text
dist/
  api.js
  config.js
  index.js
  update.js
  version.js
```

可选二进制打包：

```bash
npm run pkg
```

该命令会按需下载 `pkg@5.8.1`，生成 `bin/{os}/x64/stepfun(.exe)`。`bin/` 不进入 NPM 包。

## 9. 文档职责

- `README.md`：用户安装、配置、命令、开发与发布说明
- `docs/PRD.md`：产品范围、功能需求、验收标准
- `docs/DESIGN.md`：架构、命令树、配置解析、HTTP、输出、错误、安全和测试策略
- `AGENTS.md`：智能体修改本仓库时必须遵守的核心行为规范

不要在 `AGENTS.md` 附带 README 的完整副本。README 内容更新时，应只在必要时同步本文件中的硬性约束。
