# cleancode

AI-driven block-based desktop workbench.

cleancode 是一个基于 Electron、React、React Flow 和本地 PTY 的积木式开发工作台，当前支持项目/worktree 管理、终端积木与依赖工作流，以及带原生 MCP 工具的 Codex Agent 控制台。

## 开始使用

需要 Node.js，以及仓库 `package.json` 中声明版本的 pnpm。

```sh
pnpm install
pnpm dev
```

常用验证：

```sh
pnpm test
pnpm check:docs
pnpm pre-commit
pnpm build
```

## 文档

- [文档中心](docs/README.md)：按限界上下文、产品语义和工程治理导航全部文档。
- [架构文档](docs/engineering/architecture.md)：DDD、Clean Architecture、事实 owner 和依赖规则。
- [开发协作规范](docs/engineering/development.md)：任务分级、Spec、Plan、TDD 和质量门禁。
- [上下文地图](docs/engineering/context-map.md)：当前 Project、BlockGraph、Run、Agent 及其协作契约。

AI 协作入口见 [AGENTS.md](AGENTS.md)。当前能力与未来候选必须在文档中明确区分；可执行脚本与依赖以 `package.json` 为准。
