# 技术栈说明

## 推荐主栈

- 包管理：pnpm
- 桌面壳：Electron
- 前端框架：React
- 类型系统：TypeScript
- 构建工具：Vite
- 积木画布：React Flow
- 终端组件：xterm.js
- 伪终端：node-pty
- 代码编辑器：Monaco Editor
- 本地运行时：Node.js + TypeScript
- 本地数据库：SQLite
- ORM：Drizzle ORM
- 状态管理：Zustand
- 进程通信：Electron IPC
- 实时事件：WebSocket 或 EventEmitter
- 运行期 Agent 工具协议：MCP + 自定义 JSON-RPC tools
- 打包发布：electron-builder 或 Electron Forge

## 包管理和版本策略

项目使用 pnpm 作为唯一包管理器。

依赖版本必须使用精确版本号，不得使用 `^`、`~`、范围版本或通配版本。

`.npmrc` 必须保持 `save-exact=true`。

依赖版本门禁由 `pnpm check:deps` 执行；可执行脚本以根目录 `package.json` 为唯一事实来源。

## 选择 Electron 的原因

cleancode 需要深度集成本地 CLI、伪终端、文件系统、日志流、插件和多进程运行。Electron 的 Node.js 能力和桌面生态更适合快速搭建这类运行期 Agent 工作台。

## 架构约束

架构规则以 [架构文档](architecture.md) 为唯一事实来源。本文只说明技术选择，不重新定义分层、依赖方向或业务事实来源。

## 工程质量工具

项目使用以下工程质量工具：

- ESLint：检查 TypeScript、React、Node.js 配置脚本和测试代码质量。
- Prettier：统一代码和配置文件格式。
- Vitest：运行应用开发测试。
- dependency-cruiser：检查循环依赖、未声明依赖、不可解析依赖和 DDD/Clean Architecture 依赖方向。
- Knip：检查未使用文件、导出、依赖和脚本配置。
- Husky：接入 Git pre-commit 钩子。
- lint-staged：保留暂存文件级检查能力，作为轻量门禁扩展点。
- 自定义 `check:deps`：确保依赖版本全部精确锁定。
- 自定义 `check:logging`：确保生产代码使用统一日志、错误码和 IPC 错误边界。

本地质量门禁统一通过 `pnpm pre-commit` 执行。

`pnpm pre-commit` 的执行顺序必须由根目录 `package.json` 的 `pre-commit` 脚本定义。当前门禁必须覆盖依赖版本检查、代码行数检查、日志规范检查、格式检查、Lint、类型检查、测试、依赖方向检查和未使用代码检查。

## 前端层

React 负责主要界面结构，React Flow 负责节点式画布，Zustand 负责轻量界面状态管理。业务状态必须通过应用层用例读取和修改。

## 运行时层

Node.js 运行时承载基础设施适配器和应用层用例执行环境。积木执行编排必须进入应用层用例，文件读写、运行期 Agent 子进程、运行记录保存和事件推送必须通过应用层端口完成。

## 运行期 Agent 集成

第一版优先支持运行期本地 CLI Agent。node-pty 只作为基础设施适配器启动交互式终端，运行期 Agent 工具协议必须进入应用层用例后才能操作积木图。

Codex Agent 对话通过 Codex CLI thread UUID 恢复。cleancode 在应用层仓储中保存工作区 Agent 的稳定身份、名称、画布布局，以及“项目、工作区、Git 分支、agentId”到 UUID 的绑定；PTY、进程号、终端输出和运行中的 turn 不持久化。同一工作区可同时启动多个以 sessionId 隔离的 Codex PTY 和 MCP 端点。嵌入式 Codex 子进程通过进程级 `notify` 配置向仅监听本机回环地址的随机令牌通道报告 UUID，不修改用户的全局 Codex 配置。

## 存储层

当前桌面应用在 Electron 应用数据目录中使用版本化 JSON 保存项目、积木图、工作区 Agent 定义和 Agent 会话绑定，使用 JSONL 保存 Agent 审计记录。Agent 存储 schema 升级必须迁移旧版分支 thread 绑定。需要原子替换的 JSON 仓储必须采用临时文件、同步和重命名流程。所有读写必须通过应用层仓储端口完成；文件型产物保存在当前分支工作区对应的本地目录。SQLite 可在数据规模或查询需求增长后作为基础设施替代实现评估。

## 后续可评估技术

- Tauri：当包体、内存、安全边界成为主要问题时评估。
- tldraw：当产品从流程图更偏向自由画布和白板协作时评估。
- Yjs：当需要多人协作或离线冲突合并时评估。
