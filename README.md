<p align="center">
  <img src="public/app-icon.png" width="96" alt="cleancode 应用图标" />
</p>

<h1 align="center">cleancode</h1>

<p align="center">
  <strong>面向人类与编码 Agent 的持续开发工作空间。</strong>
</p>

<p align="center">
  <a href="https://github.com/chen-985211/cleancode/actions/workflows/agent-terminal-platform.yml"><img src="https://github.com/chen-985211/cleancode/actions/workflows/agent-terminal-platform.yml/badge.svg" alt="跨平台质量门禁" /></a>
  <a href="https://github.com/chen-985211/cleancode/actions/workflows/e2e.yml"><img src="https://github.com/chen-985211/cleancode/actions/workflows/e2e.yml/badge.svg" alt="Electron 端到端测试" /></a>
</p>

你的代码库井然有序，开发现场往往不是。

终端、本地服务、worktree、端口和编码 Agent 会话通常散落在不同窗口里，
它们之间的关系只能依赖开发者的记忆。cleancode 把这些对象带入同一个
本地优先的空间化开发工作台。

每个分支工作区都对应一个可持续存在的画布。真实终端、可执行依赖和本地
编码 Agent 在这里共享同一个可见、可信的开发现场。

> cleancode 不是编辑器替代品，也不是又一个 Agent 标签页管理器。
> 它试图让开发工作空间本身成为一等对象。

## 当前能力

- 管理项目和 Git worktree，为每个分支工作区提供一套完整工作面。
- 在空间画布上放置、缩放、组合并恢复真实的本地 PTY 终端。
- 将终端定义为任务或服务，组成可执行的依赖工作流。
- 支持依赖调度、就绪检查、失败传播和工作流停止。
- 管理并行项目与 worktree 的本地服务端口，支持固定、首选和自动分配策略。
- 在同一工作区中运行多个本地编码 Agent 控制台。
- 提供本地 CLI Agent 目录；Codex、Claude Code 和 OpenCode 当前具备一等的
  会话恢复与 cleancode MCP 集成。
- 通过有作用域约束的 MCP 工具，让受支持的 Agent 读取和创作终端工作流。
- 在画布中展示破坏性 Agent 操作的审批意图并保留审计记录。
- 维护权威终端模型，并为符合条件的终端会话提供可选的跨应用恢复。

## 核心模型

```text
项目
└── 分支工作区
    ├── BlockGraph：终端定义、组合、布局和依赖
    ├── Run：PTY 会话、工作流状态、端口和实际端点
    ├── Agent：Provider 身份、会话、MCP、审批和审计
    └── Presentation：共享工作空间的一次性投影
```

画布只是这个模型的一种视图，不是事实来源。人类操作与 Agent 工具会进入
同一组应用用例，并受到相同领域规则的约束。

## 快速开始

### 环境要求

- Node.js 24
- pnpm 10.33.0
- 受支持的本地 shell
- 可选：已经安装在本机的编码 Agent CLI

### 从源码运行

```sh
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

常用验证命令：

```sh
pnpm test
pnpm check:docs
pnpm pre-commit
pnpm build
```

项目持续在 macOS、Linux 和 Windows 上接受检查。目前尚未发布桌面安装包。

## 当前边界

cleancode 正在积极开发中，当前版本存在以下明确边界：

- 积木图当前包含终端积木和有类型的终端组合；预览、HTTP、测试、文件和插件
  积木仍是未来候选。
- Agent MCP 工具可以创作和读取终端工作流，但还不能启动、查询或停止工作流。
- 应用完全重启后，执行中的工作流不会恢复。
- Agent 终端不会在应用退出后继续存活，但受支持的 Provider 会话可以恢复。
- 远程运行时 Provider 和公开插件系统尚未实现。
- 当前仓库主要面向从源码运行的贡献者；桌面安装包将在后续提供。

当前行为与未来候选会被明确分开记录。详见
[UI 契约](docs/product/ui-contract.md)和
[UI 路线图](docs/product/ui-roadmap.md)。

## 为什么做 cleancode

编码 Agent 能写代码，但代码只是一个运行中开发环境的一部分。随着 Agent
数量增加，开发者还需要协调分支、终端、服务、端口、运行状态和破坏性操作意图。

cleancode 探索的是一种工作空间优先的路径：

- 即使 Agent 会话结束，分支工作区仍然保持完整和连贯。
- 运行时事实不依赖终端输出或 Agent 的口头描述。
- Agent 是可替换的参与者，而不是工作空间状态的所有者。
- 人类和 Agent 的操作共享类型化作用域、领域规则和可见的审批边界。

更长期的目标很简单：每个代码库都应该拥有一个人类和 Agent
都能理解、操作并持续维护的开发世界。

## 文档

- [文档中心](docs/README.md)
- [架构文档](docs/engineering/architecture.md)
- [上下文地图](docs/engineering/context-map.md)
- [UI 契约](docs/product/ui-contract.md)
- [终端依赖工作流](docs/contexts/run/terminal-workflow.md)
- [cleancode 原生 MCP](docs/contexts/agent/cleancode-mcp.md)

## 参与贡献与安全报告

欢迎参与贡献。修改仓库前，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和
[AGENTS.md](AGENTS.md)。

如果发现安全漏洞，请按照 [SECURITY.md](SECURITY.md) 私下报告。

## 开源许可证

cleancode 基于 [MIT License](LICENSE) 开源。
