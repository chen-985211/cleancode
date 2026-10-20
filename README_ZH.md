<h1 align="center">
  <img src="./public/app-icon.png" alt="CleanCode" width="96" valign="middle" /> CleanCode
</h1>

<p align="center">
  <a href="https://github.com/chen-985211/cleancode/releases"><img src="https://img.shields.io/badge/download-Preview-orange.svg" alt="Download Preview" /></a>
  <a href="#快速开始"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="macOS, Windows and Linux" /></a>
  <a href="#核心特性"><img src="https://img.shields.io/badge/agents-33%20providers-blueviolet.svg" alt="33 Coding Agent Providers" /></a>
  <a href="#核心特性"><img src="https://img.shields.io/badge/workflow-visual%20%26%20executable-brightgreen.svg" alt="Visual and executable workflows" /></a>
</p>

<p align="center">
  <sub><strong>简体中文</strong> · <a href="./README.md">English</a></sub>
</p>

<p align="center">
  <strong>一个面向人机协同的画布式 ADE：让 AI 承担学习与操作的复杂性，让人专注目标、判断和直观交互。</strong><br />
  在同一张画布上与 Agent 共同推进工作，过程可见，随时可以直接调整。
</p>

<h3 align="center">
  <a href="https://github.com/chen-985211/cleancode/releases"><ins>下载 CleanCode Preview（macOS / Windows / Linux）</ins></a>
</h3>

<p align="center">
  <img src="./docs/assets/cleancode-workflow-demo.png" alt="CleanCode 画布中的多 Agent、终端工作流与 Git 分支工作区" width="960" />
</p>

<p align="center"><sub>同一分支工作区中的 Coding Agent、终端任务、长驻服务与真实依赖连线。</sub></p>

<p align="center"><strong>▶ 多 Agent 协作演示（0:39）</strong></p>

https://github.com/user-attachments/assets/9e157258-5604-4da6-83f9-65943c19efc5

<p align="center"><strong>▶ 完整演示（2:33，含声音）</strong></p>

https://github.com/user-attachments/assets/cafe373f-97b7-4f8c-b4a4-dfbc88ab26c3

---

## 🧩 什么是 CleanCode？

**CleanCode 是一个面向人机协同的画布式 ADE（Agentic Development Environment）。** 它把 Agent、终端和项目工作区组织在同一张画布上，让人通过表达意图和直接操作，与 Agent 共同完成开发与自动化任务。

它的设计理念借用《思考，快与慢》中的系统一与系统二：系统一偏向快速、直觉的反应，系统二偏向需要集中注意力的分析、规划和推理。CleanCode 将这两个概念用于人机分工：**把系统一的工作交给人，把系统二的工作交给 Agent。**

- **人侧重系统一式的表达与交互。** 你表达想做什么、偏好什么，通过画布观察、选择和直接调整，始终掌握目标、判断和关键取舍。
- **Agent 承担系统二式的复杂工作。** 理解软件有哪些可用能力、学习工具用法、拆解任务、规划步骤，并在已有工具和权限范围内编写脚本、配置命令、排查问题和检查结果。

完成一项任务，往往还要先学会软件：入口在哪里、参数如何设置、步骤怎样衔接。CleanCode 希望让 Agent 承担这部分学习与操作成本。无论初次使用还是已经熟悉工作台，你都可以从想完成的事情出发，把精力放在目标与结果上，也可以随时直接动手。

<a id="核心特性"></a>

## ✨ 核心特性

- 🖼️ **画布工作台**：在同一张画布上操作 Agent、终端与组合，支持堆叠、展开、网格排列和一键整理。
- 🤖 **多 Agent 支持**：接入 Codex、Claude Code 等 33 种 Agent CLI，部分工具还可在回复完成、等待输入或需要授权时发送通知。
- 🤝 **原生 Agent 协作**：通过 CleanCode MCP 操作画布、搭建工作流，并创建其他 Agent、分派任务。
- 🌿 **分支工作区**：通过 Git worktree 并行开发多个需求，每个分支拥有独立的画布、终端和 Agent 会话。
- 📝 **Issue 驱动开发**：浏览 GitHub Issues，直接为问题创建或打开关联的分支工作区。
- 🧰 **工作区预设**：为项目设置默认 Agent 和终端模板，新建分支工作区时自动添加到画布，并可设置模板自动运行。
- ⚙️ **自动化工作流**：通过连线编排终端命令、脚本和非交互式 AI CLI，按依赖顺序运行，并展示各步骤的运行状态。
- 🔌 **端口管理**：为并行开发的服务配置固定、优选或自动端口，并展示实际访问地址。
- 📦 **模板与快捷执行**：将常用终端、工作流或组合保存为模板，减少重复配置，并支持通过快捷键启动常用任务。

具体用法见[产品功能与快速上手](./docs/product/feature-guide.md)。

<details open>
<summary>查看完整 Agent 列表</summary>

<!-- agent-provider-wall:start -->

CleanCode 以终端为基础，内置 **33 种 Coding Agent** 的启动配置，可自动检测本机已安装的工具，方便在当前工作区使用。

其他可通过命令行启动的 Agent，也可以直接在画布终端中运行，继续使用你熟悉的工具和配置。

<p>
  <a href="https://docs.anthropic.com/claude/docs/claude-code"><img src="./docs/assets/agent-providers/badge-claude-code.svg" height="30" alt="Claude Code" /></a>
  <a href="https://developers.openai.com/codex/cli/"><img src="./docs/assets/agent-providers/badge-codex.svg" height="30" alt="Codex" /></a>
  <a href="https://opencode.ai/docs/cli/"><img src="./docs/assets/agent-providers/badge-opencode.svg" height="30" alt="OpenCode" /></a>
  <a href="https://github.com/google-gemini/gemini-cli"><img src="./docs/assets/agent-providers/badge-gemini.svg" height="30" alt="Gemini" /></a>
  <a href="https://cursor.com/cli"><img src="./docs/assets/agent-providers/badge-cursor.svg" height="30" alt="Cursor" /></a>
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><img src="./docs/assets/agent-providers/badge-copilot.svg" height="30" alt="GitHub Copilot" /></a>
  <a href="https://github.com/openclaw/openclaw"><img src="./docs/assets/agent-providers/badge-openclaw.svg" height="30" alt="OpenClaw" /></a>
  <a href="https://hermes-agent.nousresearch.com/docs/"><img src="./docs/assets/agent-providers/badge-hermes.svg" height="30" alt="Hermes" /></a>
  <a href="https://pi.dev"><img src="./docs/assets/agent-providers/badge-pi.svg" height="30" alt="Pi" /></a>
  <a href="https://docs.cline.bot/cline-cli/overview"><img src="./docs/assets/agent-providers/badge-cline.svg" height="30" alt="Cline" /></a>
  <a href="https://block.github.io/goose/docs/quickstart/"><img src="./docs/assets/agent-providers/badge-goose.svg" height="30" alt="Goose" /></a>
  <a href="https://aider.chat/docs/"><img src="./docs/assets/agent-providers/badge-aider.svg" height="30" alt="Aider" /></a>
  <a href="https://docs.continue.dev/guides/cli"><img src="./docs/assets/agent-providers/badge-continue.svg" height="30" alt="Continue" /></a>
  <a href="https://github.com/charmbracelet/crush"><img src="./docs/assets/agent-providers/badge-crush.svg" height="30" alt="Charm" /></a>
  <a href="https://kilo.ai/docs/cli"><img src="./docs/assets/agent-providers/badge-kilo.svg" height="30" alt="Kilocode" /></a>
  <a href="https://github.com/QwenLM/qwen-code"><img src="./docs/assets/agent-providers/badge-qwen-code.svg" height="30" alt="Qwen Code" /></a>
  <a href="https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html"><img src="./docs/assets/agent-providers/badge-kimi.svg" height="30" alt="Kimi" /></a>
  <a href="https://ampcode.com/manual#install"><img src="./docs/assets/agent-providers/badge-amp.svg" height="30" alt="Amp" /></a>
  <a href="https://x.ai/cli"><img src="./docs/assets/agent-providers/badge-grok.svg" height="30" alt="Grok" /></a>
  <a href="https://docs.factory.ai/cli/getting-started/quickstart"><img src="./docs/assets/agent-providers/badge-droid.svg" height="30" alt="Droid" /></a>
  <a href="https://antigravity.google/docs/cli-overview"><img src="./docs/assets/agent-providers/badge-antigravity.svg" height="30" alt="Antigravity" /></a>
  <a href="https://kiro.dev/docs/cli/"><img src="./docs/assets/agent-providers/badge-kiro.svg" height="30" alt="Kiro" /></a>
  <a href="https://github.com/mistralai/mistral-vibe"><img src="./docs/assets/agent-providers/badge-mistral-vibe.svg" height="30" alt="Mistral Vibe" /></a>
  <a href="https://mimo.xiaomi.com/coder"><img src="./docs/assets/agent-providers/badge-mimo-code.svg" height="30" alt="MiMo Code" /></a>
  <a href="https://openclaude.gitlawb.com/"><img src="./docs/assets/agent-providers/badge-openclaude.svg" height="30" alt="OpenClaude" /></a>
  <a href="https://omp.sh"><img src="./docs/assets/agent-providers/badge-omp.svg" height="30" alt="OMP" /></a>
  <a href="https://devin.ai/cli"><img src="./docs/assets/agent-providers/badge-devin.svg" height="30" alt="Devin" /></a>
  <a href="https://docs.augmentcode.com/cli/overview"><img src="./docs/assets/agent-providers/badge-aug.svg" height="30" alt="Auggie" /></a>
  <a href="https://www.codebuff.com/docs/help/quick-start"><img src="./docs/assets/agent-providers/badge-codebuff.svg" height="30" alt="Codebuff" /></a>
  <a href="https://github.com/autohandai/code-cli"><img src="./docs/assets/agent-providers/badge-autohand.svg" height="30" alt="Autohand Code" /></a>
  <a href="https://commandcode.ai/docs/quickstart"><img src="./docs/assets/agent-providers/badge-command-code.svg" height="30" alt="Command Code" /></a>
  <a href="https://github.com/AntigmaLabs/ante-preview"><img src="./docs/assets/agent-providers/badge-ante.svg" height="30" alt="Ante" /></a>
  <a href="https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/"><img src="./docs/assets/agent-providers/badge-rovo.svg" height="30" alt="Rovo Dev" /></a>
  <img src="./docs/assets/agent-providers/badge-any-cli-agent.svg" height="30" alt="Any CLI Agent" />
</p>

**继续使用你熟悉的 Agent，在同一张画布上协同工作。**

<!-- agent-provider-wall:end -->

</details>

<a id="快速开始"></a>

## 🚀 快速开始

如果你只是想先把 CleanCode 跑起来，不需要先理解所有概念，按下面几步就够了。

### 下载 Preview

从 [GitHub Releases](https://github.com/chen-985211/cleancode/releases) 下载对应平台的安装包：

- macOS：Universal DMG/ZIP，同时支持 Apple Silicon 和 Intel。
- Windows：x64 NSIS 安装程序。
- Linux：x64 AppImage/DEB。

> [!WARNING]
> 当前 Preview 尚未使用正式开发者证书签名。请只从本仓库的 GitHub Releases 下载，并先使用
> 同一 Release 中的 `SHA256SUMS.txt` 核对安装包。

macOS 会因为应用尚未完成 Developer ID 签名和 Apple notarization 而阻止首次打开。把
`CleanCode.app` 拖入 `/Applications`，确认安装包来源和 SHA-256 校验值无误后，可以只为这个
应用移除下载隔离属性并启动：

```bash
xattr -dr com.apple.quarantine /Applications/CleanCode.app
open /Applications/CleanCode.app
```

这条命令会绕过该应用的首次 Gatekeeper 检查。不要把目标路径替换为 `/Applications`、下载目录或
用户目录等宽泛范围。也可以按照
[Apple 官方说明](https://support.apple.com/en-asia/102445)，在“系统设置 → 隐私与安全性”中选择
“仍要打开”。

### 从源码运行的环境要求

以下要求只适用于从源码运行和参与开发；下载 Preview 不需要先安装这些开发依赖。

- Node.js `>= 24`
- pnpm `>= 10`
- macOS、Windows 或 Linux

### 本地运行

```bash
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

### 常用检查

```bash
pnpm typecheck
pnpm test
pnpm pre-commit
```

### 本地打包

```bash
# 当前平台的 unpacked 应用，用于本地验证
pnpm package

# 当前平台的发行安装包
pnpm dist

# 也可以在对应操作系统上显式选择平台
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

打包产物输出到 `release/`。

## 📚 文档

- [产品功能与快速上手](./docs/product/feature-guide.md)
- [文档中心](./docs/README.md)
- [架构文档](./docs/engineering/architecture.md)
- [上下文地图](./docs/engineering/context-map.md)
- [UI 契约](./docs/product/ui-contract.md)
- [终端依赖工作流](./docs/contexts/run/terminal-workflow.md)
- [Agent 与会话生命周期](./docs/contexts/agent/agent-session.md)
- [CleanCode 原生 MCP](./docs/contexts/agent/cleancode-mcp.md)
- [开发协作规范](./docs/engineering/development.md)

## 🤝 参与贡献

欢迎提交 Issue、讨论和 Pull Request。开始前请阅读 [贡献指南](./CONTRIBUTING.md) 与 [开发协作规范](./docs/engineering/development.md)。

## 💬 加群交流

扫描下方二维码加入 CleanCode 社区，分享新想法、提出功能建议，或反馈使用中遇到的问题，一起让 CleanCode 更好用。

<p align="center">
  <img src="./docs/assets/cleancode-qq-group.png" alt="扫码加入 CleanCode 社区（群号：186885114）" width="320" />
</p>

<p align="center">
  <strong>群号：186885114</strong><br />
  <sub>以人机协同为起点，探索 AI 原生操作系统的可能。</sub>
</p>

---

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
</p>
