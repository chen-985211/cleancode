<h1 align="center">
  <img src="./public/app-icon.png" alt="CleanCode" width="96" valign="middle" /> CleanCode
</h1>

<p align="center">
  <a href="https://github.com/chen-985211/cleancode/releases"><img src="https://img.shields.io/badge/download-Preview-orange.svg" alt="Download Preview" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="macOS, Windows and Linux" /></a>
  <a href="#core-features"><img src="https://img.shields.io/badge/agents-33%20providers-blueviolet.svg" alt="33 Coding Agent Providers" /></a>
  <a href="#core-features"><img src="https://img.shields.io/badge/workflow-visual%20%26%20executable-brightgreen.svg" alt="Visual and executable workflows" /></a>
</p>

<p align="center">
  <sub><a href="./README_ZH.md">简体中文</a> · <strong>English</strong></sub>
</p>

<p align="center">
  <strong>A canvas ADE for human–AI collaboration: AI handles the complexity of learning and operating tools, so you can focus on goals, judgment, and intuitive interaction.</strong><br />
  Work alongside Agents on one canvas, with visible progress and direct control whenever you need it.
</p>

<h3 align="center">
  <a href="https://github.com/chen-985211/cleancode/releases"><ins>Download CleanCode Preview (macOS / Windows / Linux)</ins></a>
</h3>

<p align="center">
  <img src="./docs/assets/cleancode-workflow-demo.png" alt="Multiple Agents, terminal workflows, and Git branch workspaces on the CleanCode canvas" width="960" />
</p>

<p align="center"><sub>Coding Agents, terminal tasks, long-running services, and real dependency connections in one branch workspace.</sub></p>

<p align="center"><strong>▶ Multi-Agent Collaboration Demo (0:39)</strong></p>

https://github.com/user-attachments/assets/9e157258-5604-4da6-83f9-65943c19efc5

<p align="center"><strong>▶ Full demo (2:33, with sound)</strong></p>

https://github.com/user-attachments/assets/cafe373f-97b7-4f8c-b4a4-dfbc88ab26c3

---

## 🧩 What Is CleanCode?

**CleanCode is a canvas ADE (Agentic Development Environment) for human–AI collaboration.** It brings Agents, terminals, and project workspaces onto one canvas, so you can express intent, interact directly, and work with Agents on development and automation tasks.

Its design draws on System 1 and System 2 from _Thinking, Fast and Slow_: System 1 describes fast, intuitive responses, while System 2 involves focused analysis, planning, and reasoning. CleanCode applies these ideas to human–AI collaboration: **people handle System 1 work, while Agents handle System 2 work.**

- **People focus on intuitive expression and direct interaction.** Describe what you want and what you prefer, then observe, select, and adjust on the canvas, retaining control of goals, judgment, and key decisions.
- **Agents handle work that requires analysis and planning.** Within their tools and permissions, Agents identify available capabilities, learn how to use tools, break down tasks, plan steps, write scripts, configure commands, troubleshoot, and check results.

Completing a task often means learning the software first: where to find an action, which parameters to set, and how the steps fit together. CleanCode aims to let Agents handle that learning and the steps that follow. Whether you are new to the workbench or already know it well, you can start with your goal, focus on the result, and take direct control whenever you want.

<a id="core-features"></a>

## ✨ Core Features

- 🖼️ **Canvas Workbench**: Arrange Agents, terminals, and groups on one canvas, with stacking, expansion, grid layout, and automatic organization.
- 🤖 **Multiple Agents**: Use 33 Agent CLIs, including Codex and Claude Code, with notifications from some tools when a reply finishes, input is needed, or approval is required.
- 🤝 **Native Agent Collaboration**: Use CleanCode MCP to let Agents operate the canvas, build workflows, create other Agents, and assign tasks.
- 🌿 **Branch Workspaces**: Work on multiple changes in parallel with Git worktrees, giving each branch its own canvas, terminals, and Agent sessions.
- 📝 **Issue-Driven Development**: Browse GitHub Issues and create or open a branch workspace linked to an issue.
- 🧰 **Workspace Presets**: Set default Agents and terminal templates for a project, add them to new branch workspaces automatically, and optionally run the templates.
- ⚙️ **Automated Workflows**: Connect terminal commands, scripts, and non-interactive AI CLIs, run them according to their dependencies, and view the state of every step.
- 🔌 **Port Management**: Choose fixed, preferred, or automatically assigned ports for services running in parallel, and see their actual addresses.
- 📦 **Templates and Quick Execution**: Save frequently used terminals, workflows, or groups as templates to avoid repeated setup, and launch common tasks with keyboard shortcuts.

See [Product Features and Quick Start](./docs/product/feature-guide.md) for details.

<details open>
<summary>View all Agents</summary>

<!-- agent-provider-wall:start -->

CleanCode is built on terminals and includes launch configurations for **33 Coding Agents**, with automatic detection of tools installed on your machine so you can use them in the current workspace.

Other Agents that run from the command line can also run directly in a canvas terminal, using your familiar tools and configuration.

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

**Keep using the Agents you know and collaborate on one canvas.**

<!-- agent-provider-wall:end -->

</details>

<a id="quick-start"></a>

## 🚀 Quick Start

If you just want to get CleanCode running, you do not need to understand every concept first. The steps below are enough.

### Download the Preview

Download the installer for your platform from [GitHub Releases](https://github.com/chen-985211/cleancode/releases):

- macOS: Universal DMG/ZIP for both Apple Silicon and Intel.
- Windows: x64 NSIS installer.
- Linux: x64 AppImage/DEB.

> [!WARNING]
> The current Preview is not signed with official developer certificates. Download it only from this repository's GitHub Releases, and verify the package against `SHA256SUMS.txt` from the same release.

Because the app has not yet completed Developer ID signing and Apple notarization, macOS will block it the first time it opens. After moving `CleanCode.app` to `/Applications` and verifying the source and SHA-256 checksum, you can remove the download quarantine attribute for this app only and launch it:

```bash
xattr -dr com.apple.quarantine /Applications/CleanCode.app
open /Applications/CleanCode.app
```

This command bypasses the initial Gatekeeper check for this app. Do not replace the target with a broad path such as `/Applications`, your Downloads folder, or your home directory. Alternatively, follow [Apple's official instructions](https://support.apple.com/en-asia/102445) and choose **Open Anyway** under **System Settings → Privacy & Security**.

### Source Development Requirements

These requirements apply only when running from source or contributing to development. You do not need to install these development dependencies before downloading the Preview.

- Node.js `>= 24`
- pnpm `>= 10`
- macOS, Windows, or Linux

### Run Locally

```bash
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

### Common Checks

```bash
pnpm typecheck
pnpm test
pnpm pre-commit
```

### Build Locally

```bash
# Unpacked app for the current platform, intended for local verification
pnpm package

# Distribution installer for the current platform
pnpm dist

# You can also select a target explicitly on the corresponding operating system
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

Build artifacts are written to `release/`.

## 📚 Documentation

- [Product Features and Quick Start](./docs/product/feature-guide.md)
- [Documentation Center](./docs/README.md)
- [Architecture Guide](./docs/engineering/architecture.md)
- [Context Map](./docs/engineering/context-map.md)
- [UI Contract](./docs/product/ui-contract.md)
- [Terminal Dependency Workflows](./docs/contexts/run/terminal-workflow.md)
- [Agent and Session Lifecycle](./docs/contexts/agent/agent-session.md)
- [Native CleanCode MCP](./docs/contexts/agent/cleancode-mcp.md)
- [Development Guidelines](./docs/engineering/development.md)

## 🤝 Contributing

Issues, discussions, and pull requests are welcome. Before you begin, read the [Contributing Guide](./CONTRIBUTING.md) and [Development Guidelines](./docs/engineering/development.md).

## 💬 Join the Community

Scan the code below to join the CleanCode community, share ideas, suggest features, or report problems, and help make CleanCode better.

<p align="center">
  <img src="./docs/assets/cleancode-qq-group.png" alt="Scan to join the CleanCode community (group number: 186885114)" width="320" />
</p>

<p align="center">
  <strong>Group number: 186885114</strong><br />
  <sub>Explore the possibilities of an AI-native operating system through human–AI collaboration.</sub>
</p>

---

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
</p>
