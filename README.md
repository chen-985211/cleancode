<div align="center">
  <img src="./public/app-icon.png" alt="cleancode" width="112" />

  <h1>cleancode</h1>

  <p><strong>让每个代码库拥有一个人类与 Agent 共享的开发世界。</strong></p>

  <p>
    <a href="https://github.com/chen-985211/cleancode/actions/workflows/agent-terminal-platform.yml"><img src="https://github.com/chen-985211/cleancode/actions/workflows/agent-terminal-platform.yml/badge.svg" alt="跨平台质量门禁" /></a>
    <a href="https://github.com/chen-985211/cleancode/actions/workflows/e2e.yml"><img src="https://github.com/chen-985211/cleancode/actions/workflows/e2e.yml/badge.svg" alt="Electron 端到端测试" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="macOS, Windows and Linux" />
  </p>
</div>

---

编码 Agent 已经会修改代码，但它仍然很难看见完整的开发现场：

- 这个任务属于哪个分支和 worktree？
- 哪些服务需要先启动，哪些命令只是一次性任务？
- 当前实际监听的是哪个端口，它属于哪个工作区？
- 哪个终端可以恢复，哪个 Agent 会话可以继续？
- 一次停止、重启或清理会影响哪些对象？

**cleancode 是一个本地优先、可执行的开发工作空间。** 它把项目、分支、终端、服务、依赖、端口和编码 Agent 组织成同一个可见、可操作、可恢复的开发世界，让人和 Agent 面对同一份运行事实。

它不是把终端平铺到无限画布上。画布只是开发模型的投影；真正的价值在于，开发环境第一次成为了可以被理解、执行和治理的对象。

## 一次典型的开发流程

1. 为一个需求创建独立分支工作区，项目与 worktree 生命周期保持对应。
2. 把开发服务器、测试、构建和辅助进程组织成终端任务或长驻服务。
3. 用依赖关系表达启动顺序，由 cleancode 管理端口、就绪状态和停止顺序。
4. Agent 在同一工作空间中读取计划、创建和编排终端积木；需要破坏性操作时，由人确认。
5. 人通过画布查看真实运行状态、实际端点和失败原因，并在中断后继续现场。

在这里，Agent 不只是“替你敲命令”，而是开始进入一个有边界、有状态、有事实来源的开发环境。

## 核心能力

### 分支就是独立工作面

一个项目可以同时维护多个分支工作区。cleancode 负责登记 worktree、同步分支状态，并把终端与 Agent 会话绑定到正确的工作目录，减少多个任务并行时的上下文串线。

### 开发环境可以被执行

普通终端、一次性任务和长驻服务都可以成为画布上的积木。积木之间的连线表达真实依赖，而不只是视觉关系；启动计划、就绪检查、失败传播和反向停止由运行模型统一处理。

### 运行事实有唯一来源

端口、进程、就绪状态和实际访问地址来自运行时，而不是画布上的静态标签。cleancode 会管理端口租约、校验监听归属，并把最终端点回写到工作空间。

### Agent 有能力，也有边界

Agent 可以检查画布、创建终端积木、连接依赖、查看执行计划并整理布局。改变进程或工作区状态的操作必须经过明确授权，所有工具调用都遵循同一套作用域与审批模型。

## 支持的 Agent

**你选择 Agent，不必围着 Agent 选择工作方式。**

<!-- agent-provider-wall:start -->

cleancode 内建 **33 个 Coding Agent Provider**。它们都可以进入同一个可见、可执行的开发世界，与终端、服务、分支和运行状态一起工作。

<p>
  <a href="https://docs.anthropic.com/claude/docs/claude-code"><kbd><img src="./docs/assets/agent-providers/claude-code.svg" width="18" height="18" alt="" /> Claude Code</kbd></a>
  <a href="https://developers.openai.com/codex/cli/"><kbd><img src="./docs/assets/agent-providers/codex.svg" width="18" height="18" alt="" /> Codex</kbd></a>
  <a href="https://opencode.ai/docs/cli/"><kbd><img src="./docs/assets/agent-providers/opencode.svg" width="18" height="18" alt="" /> OpenCode</kbd></a>
  <a href="https://github.com/google-gemini/gemini-cli"><kbd><img src="./docs/assets/agent-providers/gemini.png" width="18" height="18" alt="" /> Gemini</kbd></a>
  <a href="https://cursor.com/cli"><kbd><img src="./docs/assets/agent-providers/cursor.png" width="18" height="18" alt="" /> Cursor</kbd></a>
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><kbd><img src="./docs/assets/agent-providers/copilot.svg" width="18" height="18" alt="" /> GitHub Copilot</kbd></a>
  <a href="https://github.com/openclaw/openclaw"><kbd><img src="./docs/assets/agent-providers/openclaw.png" width="18" height="18" alt="" /> OpenClaw</kbd></a>
  <a href="https://hermes-agent.nousresearch.com/docs/"><kbd><img src="./docs/assets/agent-providers/hermes.png" width="18" height="18" alt="" /> Hermes</kbd></a>
  <a href="https://pi.dev"><kbd><img src="./docs/assets/agent-providers/pi.svg" width="18" height="18" alt="" /> Pi</kbd></a>
  <a href="https://docs.cline.bot/cline-cli/overview"><kbd><img src="./docs/assets/agent-providers/cline.png" width="18" height="18" alt="" /> Cline</kbd></a>
  <a href="https://block.github.io/goose/docs/quickstart/"><kbd><img src="./docs/assets/agent-providers/goose.png" width="18" height="18" alt="" /> Goose</kbd></a>
  <a href="https://aider.chat/docs/"><kbd><img src="./docs/assets/agent-providers/aider.svg" width="18" height="18" alt="" /> Aider</kbd></a>
  <a href="https://docs.continue.dev/guides/cli"><kbd><img src="./docs/assets/agent-providers/continue.png" width="18" height="18" alt="" /> Continue</kbd></a>
  <a href="https://github.com/charmbracelet/crush"><kbd><img src="./docs/assets/agent-providers/crush.png" width="18" height="18" alt="" /> Charm</kbd></a>
  <a href="https://kilo.ai/docs/cli"><kbd><img src="./docs/assets/agent-providers/kilo.svg" width="18" height="18" alt="" /> Kilocode</kbd></a>
  <a href="https://github.com/QwenLM/qwen-code"><kbd><img src="./docs/assets/agent-providers/qwen-code.png" width="18" height="18" alt="" /> Qwen Code</kbd></a>
  <a href="https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html"><kbd><img src="./docs/assets/agent-providers/kimi.png" width="18" height="18" alt="" /> Kimi</kbd></a>
  <a href="https://ampcode.com/manual#install"><kbd><img src="./docs/assets/agent-providers/amp.png" width="18" height="18" alt="" /> Amp</kbd></a>
  <a href="https://x.ai/cli"><kbd><img src="./docs/assets/agent-providers/grok.png" width="18" height="18" alt="" /> Grok</kbd></a>
  <a href="https://docs.factory.ai/cli/getting-started/quickstart"><kbd><img src="./docs/assets/agent-providers/droid.svg" width="18" height="18" alt="" /> Droid</kbd></a>
  <a href="https://antigravity.google/docs/cli-overview"><kbd><img src="./docs/assets/agent-providers/antigravity.png" width="18" height="18" alt="" /> Antigravity</kbd></a>
  <a href="https://kiro.dev/docs/cli/"><kbd><img src="./docs/assets/agent-providers/kiro.png" width="18" height="18" alt="" /> Kiro</kbd></a>
  <a href="https://github.com/mistralai/mistral-vibe"><kbd><img src="./docs/assets/agent-providers/mistral-vibe.png" width="18" height="18" alt="" /> Mistral Vibe</kbd></a>
  <a href="https://mimo.xiaomi.com/coder"><kbd><img src="./docs/assets/agent-providers/mimo-code.png" width="18" height="18" alt="" /> MiMo Code</kbd></a>
  <a href="https://openclaude.gitlawb.com/"><kbd><img src="./docs/assets/agent-providers/openclaude.png" width="18" height="18" alt="" /> OpenClaude</kbd></a>
  <a href="https://omp.sh"><kbd><img src="./docs/assets/agent-providers/omp.svg" width="18" height="18" alt="" /> OMP</kbd></a>
  <a href="https://devin.ai/cli"><kbd><img src="./docs/assets/agent-providers/devin.png" width="18" height="18" alt="" /> Devin</kbd></a>
  <a href="https://docs.augmentcode.com/cli/overview"><kbd><img src="./docs/assets/agent-providers/aug.png" width="18" height="18" alt="" /> Auggie</kbd></a>
  <a href="https://www.codebuff.com/docs/help/quick-start"><kbd><img src="./docs/assets/agent-providers/codebuff.png" width="18" height="18" alt="" /> Codebuff</kbd></a>
  <a href="https://github.com/autohandai/code-cli"><kbd><img src="./docs/assets/agent-providers/autohand.png" width="18" height="18" alt="" /> Autohand Code</kbd></a>
  <a href="https://commandcode.ai/docs/quickstart"><kbd><img src="./docs/assets/agent-providers/command-code.png" width="18" height="18" alt="" /> Command Code</kbd></a>
  <a href="https://github.com/AntigmaLabs/ante-preview"><kbd><img src="./docs/assets/agent-providers/ante.png" width="18" height="18" alt="" /> Ante</kbd></a>
  <a href="https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/"><kbd><img src="./docs/assets/agent-providers/rovo.png" width="18" height="18" alt="" /> Rovo Dev</kbd></a>
</p>

**33 个主流 Coding Agent，全部可以在 cleancode 中拥有一个真正的开发现场。**

<!-- agent-provider-wall:end -->

## cleancode MCP

内建 MCP 让 Agent 通过稳定工具操作同一个工作空间，而不是直接修改画布内部状态。当前工具覆盖：

- 读取画布、终端积木和连接；
- 创建、更新、删除和连接终端积木；
- 查看启动计划与依赖验证结果；
- 对齐、分布和自动整理画布布局。

启动与停止工作流仍由人通过应用界面控制。这是当前有意保留的权限边界。

## 快速开始

### 环境要求

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

## 当前边界

cleancode 正在积极开发，当前版本需要注意：

- 画布目前只提供终端积木与终端组合；Preview、HTTP、Test、File 和 Plugin 等积木仍在路线图中。
- Agent 可以编排和检查终端依赖，但暂不能通过 MCP 启动、查询或停止工作流。
- 应用退出后，活动工作流和 Agent 终端进程不会自动继续运行；可恢复的终端与上游对话会按各自能力重新连接。
- 插件扩展体系尚未公开，暂不承诺第三方插件兼容性。
- 当前需要从源码运行，预构建安装包仍在准备中。

## 设计原则

- **画布不是事实来源。** 它只投影领域模型与运行状态。
- **人和 Agent 共享用例。** Agent 不绕过应用边界直接操纵内部实现。
- **工作区隔离优先。** 分支、目录、端口和会话都必须有明确归属。
- **危险操作必须可见。** 改变进程、文件或工作区状态的能力需要审批和审计。
- **失败必须能够解释。** 计划、就绪、端点和错误都应回到用户可理解的对象上。

架构和领域边界详见 [架构文档](./docs/engineering/architecture.md) 与 [上下文地图](./docs/engineering/context-map.md)。

## 文档

- [文档中心](./docs/README.md)
- [UI 契约](./docs/product/ui-contract.md)
- [终端依赖工作流](./docs/contexts/run/terminal-workflow.md)
- [Agent 与会话生命周期](./docs/contexts/agent/agent-session.md)
- [cleancode 原生 MCP](./docs/contexts/agent/cleancode-mcp.md)
- [开发协作规范](./docs/engineering/development.md)

## 参与贡献

欢迎提交 Issue、讨论和 Pull Request。开始前请阅读 [贡献指南](./CONTRIBUTING.md) 与 [开发协作规范](./docs/engineering/development.md)。

## 许可证

[MIT](./LICENSE)
