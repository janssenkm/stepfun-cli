# StepFun-CLI 设计与实现方案

## 1. 项目定位
本项目名为 `StepFun-CLI`，发布至 NPM 的包名为 `@stepfun-ai/cli`，命令行全局命令为 `stepfun`。编译出的独立二进制文件名为 `stepfun.exe` (Windows)、`stepfun-linux`、`stepfun-macos`。
该工具对标 MiniMax (`mmx`) 的 CLI 交互体验，主要用于在终端调用阶跃星辰（StepFun）的各项模型能力。

## 2. 核心架构与技术栈
- **语言**：Node.js + TypeScript
- **CLI 框架**：`commander` (处理参数解析与命令分发)
- **交互组件**：`prompts` (用于提供流畅的终端方向键选择和密码输入交互)
- **网络请求**：`node-fetch`
- **打包工具**：`tsup` (编译 TS -> CJS), `pkg` (打包全平台独立可执行文件)

## 3. 支持的模型能力
命令行内部已封装以下模型调用，未来若新增模型请遵循该结构：
- **文本生成 (Text/Chat)**：`step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- **语音合成 (Speech/TTS)**：`stepaudio-2.5-tts`
- **语音识别 (Speech/ASR)**：`stepaudio-2.5-asr`
- **图像编辑 (Image/Edit)**：`step-image-edit-2`

## 4. API 区域 (Region) 设计规范
为适配 StepFun 的不同计费和网络隔离场景，制定了 4 组特定的 Region 标识符。
任何智能体在处理本仓库 API URL 时，必须严格遵循以下映射，不允许混用：

1. **StepPlan-CN**
   - 描述：国内版 StepPlan 套餐专用
   - URL: `https://api.stepfun.com/step_plan/v1`
2. **StepPlan-Global**
   - 描述：国际版 StepPlan 套餐专用
   - URL: `https://api.stepfun.ai/step_plan/v1`
3. **PayGo-CN**
   - 描述：国内版纯 API 按量计费（标准版）
   - URL: `https://api.stepfun.com/v1`
4. **PayGo-Global**
   - 描述：国际版纯 API 按量计费（标准版）
   - URL: `https://api.stepfun.ai/v1`

## 5. 鉴权与交互逻辑 (参考 mmx)
- **登录指令**：`stepfun auth login`
- **状态查询**：`stepfun auth status`
- **交互流程**：
  1. 使用 `prompts` 组件在终端弹出上述 4 个 Region 的选项菜单。
  2. 用户通过方向键选择后，再弹出隐藏输入的框让用户输入对应 Region 的 API Key。
- **持久化存储**：
  - 工具将用户选择的 `region` 和 `apiKey` 以 JSON 格式保存在 `~/.stepfun-cli/config.json` 中。
  - 读取时，优先使用单次命令传入的 `--api-key` 和 `--region`，若未传参则读取 `config.json`。

## 6. 使用说明与参数结构 (兼容 mmx 设计)
- **全局参数**：`--api-key`, `--region`, `--base-url`, `--output`, `--quiet`, `--verbose`, `--no-color`
- **认证状态**：`stepfun auth status`
- **模型列表**：`stepfun models list`
- **文本对话**：`stepfun text chat --prompt <text> --model <model>`
- **语音合成**：`stepfun speech synthesize --text <text> --output <file> --model <model>`
- **语音识别**：`stepfun speech recognize --file <audio-file> --model <model>`
- **图像编辑**：`stepfun image edit --file <image-file> --prompt <text> --model <model>`

*(注：本文件为当前 Workspace 的核心行为规范与设计架构总览，智能体后续对此仓库进行修改和功能扩展时，需严格参考本文件中的 Region 映射、持久化存储方案以及交互设计。)*

---

## 附录：原 README 内容 (使用说明)

# StepFun CLI

A command-line interface for [StepFun](https://stepfun.com) AI models, compatible with Windows, Linux, and MacOS. The CLI interface is designed similarly to the `mmx` (MiniMax-AI) CLI.

## Models Supported
- Text: `step-3.5-flash`, `step-3.5-flash-2603`, `step-3.7-flash`
- Speech: `stepaudio-2.5-tts`, `stepaudio-2.5-asr`
- Image: `step-image-edit-2`

## Installation

### From NPM
```bash
npm install -g @stepfun-ai/cli
```

### Standalone Binary
Pre-compiled binaries for Windows (`.exe`), Linux, and macOS are available in the `bin/` directory or releases page.

## Configuration

Interactive login:
```bash
stepfun auth login
```

Check authentication status:
```bash
stepfun auth status
```

Set your API Key manually:
```bash
stepfun config set api_key "YOUR_API_KEY"
```

List supported models:
```bash
stepfun models list
```

## Usage

### Text (Chat)
```bash
stepfun text chat --prompt "Hello, who are you?" --model step-3.5-flash
```

### Speech (Synthesize TTS)
```bash
stepfun speech synthesize --text "你好，我是阶跃星辰的大模型。" --output hello.wav --model stepaudio-2.5-tts
```

### Speech (Recognize ASR)
```bash
stepfun speech recognize --file hello.wav --model stepaudio-2.5-asr
```

### Image (Edit)
```bash
stepfun image edit --file input.png --prompt "Make it cyberpunk style" --model step-image-edit-2
```

## Development

Build the project:
```bash
npm install
npm run build
```

Compile standalone binaries (Windows, MacOS, Linux):
```bash
npm run pkg
```
