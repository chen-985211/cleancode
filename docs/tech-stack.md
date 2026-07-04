# 技术栈说明

## 推荐主栈

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

## 选择 Electron 的原因

cleancode 需要深度集成本地 CLI、伪终端、文件系统、日志流、插件和多进程运行。Electron 的 Node.js 能力和桌面生态更适合快速搭建这类运行期 Agent 工作台。

## 架构约束

架构规则以 [架构文档](architecture.md) 为唯一事实来源。本文只说明技术选择，不重新定义分层、依赖方向或业务事实来源。

## 前端层

React 负责主要界面结构，React Flow 负责节点式画布，Zustand 负责轻量界面状态管理。业务状态必须通过应用层用例读取和修改。

## 运行时层

Node.js 运行时承载基础设施适配器和应用层用例执行环境。积木执行编排必须进入应用层用例，文件读写、运行期 Agent 子进程、运行记录保存和事件推送必须通过应用层端口完成。

## 运行期 Agent 集成

第一版优先支持运行期本地 CLI Agent。node-pty 只作为基础设施适配器启动交互式终端，运行期 Agent 工具协议必须进入应用层用例后才能操作积木图。

## 存储层

SQLite 用于保存项目、积木图、运行历史和运行期 Agent 操作记录。所有读写必须通过应用层仓储端口完成。文件型产物保存在项目工作区，并在数据库中记录引用。

## 后续可评估技术

- Tauri：当包体、内存、安全边界成为主要问题时评估。
- tldraw：当产品从流程图更偏向自由画布和白板协作时评估。
- Yjs：当需要多人协作或离线冲突合并时评估。
