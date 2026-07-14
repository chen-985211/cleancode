# 终端会话生命周期

## 文档地位

本文是当前已实现普通终端 PTY 会话的统一维护入口。终端依赖图、任务/服务调度与 `WorkflowRun` 由[终端依赖工作流](terminal-workflow.md)单独维护。

全仓边界以[架构文档](../../engineering/architecture.md)为准；终端界面的稳定交互以 [UI 契约](../../product/ui.md)为准。

## 能力状态与范围

普通终端会话负责：

- 在指定工作区目录启动交互式 shell 或带启动命令的 PTY。
- 转发输出、写入键盘输入、发送 Ctrl+C、调整行列和终止进程。
- 记录进程 ID、状态、输入历史、退出码或启动失败原因。
- 查询运行中 PTY 的当前工作目录，用于工作区切换安全判断。
- 保持同一工作区内同一终端积木只有一个当前会话。

它不拥有终端积木配置、工作区选择或终端依赖图；这些事实分别属于 BlockGraph 与 Project。

## 聚合与状态

`TerminalSession` 是 Run 上下文的聚合根之一。状态机为：

```txt
idle -> running -> exited
  \-> failed
```

| 状态      | 含义                                         |
| --------- | -------------------------------------------- |
| `idle`    | 聚合已创建，但尚未成功取得 PTY 进程          |
| `running` | PTY 已启动，允许记录和转发输入               |
| `exited`  | 进程自然退出或被终止；自然退出保存真实退出码 |
| `failed`  | PTY 启动失败，保存失败原因且进程 ID 保持为空 |

`recordInput` 只允许在 `running` 状态执行。Ctrl+C 只是向当前 PTY 写入 `\x03`，不会把会话伪装成已退出；关闭会话才终止进程并标记 `exited`。

## 会话身份与隔离

每次启动都会创建新的 `sessionId`。`TerminalSessionService` 使用 `workspaceName + terminalBlockId` 识别当前槽位：

- 同一槽位启动新会话时，先终止旧会话。
- 相同终端积木 ID 在不同工作区拥有独立会话，可以同时运行。
- 进程退出后移除槽位映射，但保留进程内的会话快照供当前调用读取。
- 应用退出或统一清理时终止全部 PTY，并把运行中会话标记为退出。

会话的 `workingDirectory` 由表现层/平台根据 Project 当前工作区提供。服务不会自行读取或切换 Project 聚合。

## PTY 端口语义

Run 应用层只依赖 `TerminalProcessPort`：

- `start`：以工作目录、shell、可选启动命令和行列启动 PTY，返回真实进程 ID。
- `write`：向已存在的 PTY 写入原始输入。
- `resize`：同步 PTY 行列。
- `readWorkingDirectory`：在 macOS 通过 `lsof`、Linux 通过 `/proc/<pid>/cwd` 尽力读取；不支持或进程消失时返回 `null`。
- `stop` / `disposeAll`：终止一个或全部受管 PTY。

基础设施默认使用系统 shell；启动命令通过 shell 参数执行，不以解析 shell 提示符判断完成。xterm 的行列同步与视觉排障见[终端渲染排障指南](../../engineering/terminal-rendering.md)。

## 状态与持久化

普通 `TerminalSession`、PTY 进程、输入历史和输出都是当前进程内的易失状态，不写入仓储。应用重启后由已持久化的 BlockGraph 终端配置重新建立空会话或启动命令，但不会恢复旧进程与输入历史。

工作流执行可能复用普通终端会话作为输出承载，但工作流命令使用独立命令 PTY，并由 `TerminalSessionWorkflowRuntimeAdapter` 协调；不得把普通会话的人工输入当作工作流成功信号。

## 实现入口

| 层级           | 入口                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | [`TerminalSession.ts`](../../../src/contexts/run/domain/aggregates/TerminalSession.ts)                                                                                                                   |
| Application    | [`TerminalSessionService.ts`](../../../src/contexts/run/application/use-cases/TerminalSessionService.ts)、[`TerminalProcessPort.ts`](../../../src/contexts/run/application/ports/TerminalProcessPort.ts) |
| Infrastructure | [`NodePtyTerminalProcessAdapter.ts`](../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter.ts)                                                                                      |
| Platform       | [`terminalIpcHandlers.ts`](../../../src/platform/electron-main/terminalIpcHandlers.ts)                                                                                                                   |

## 验证矩阵

| 层级           | 证明内容                                 | 主要测试                                                                                                                        |
| -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unit / Domain  | 状态迁移与仅运行中可输入                 | [`run.terminal-session.spec.ts`](../../../tests/unit/contexts/run/run.terminal-session.spec.ts)                                 |
| Unit / Service | 替换、Ctrl+C、关闭、失败与工作区隔离     | [`run.terminal-session-service.spec.ts`](../../../tests/unit/contexts/run/run.terminal-session-service.spec.ts)                 |
| Integration    | 真实 node-pty 启动、输入、退出与工作目录 | [`run.pty-terminal.spec.ts`](../../../tests/integration/contexts/run/run.pty-terminal.spec.ts)                                  |
| Unit / UI 协作 | 工作区切换时终端会话迁移                 | [`terminal-session-workspace-migration.spec.ts`](../../../tests/unit/presentation/terminal-session-workspace-migration.spec.ts) |
| E2E            | 用户启动、输入和关闭终端的主路径         | [`run-terminal-sessions.e2e.spec.ts`](../../../tests/e2e/run-terminal-sessions.e2e.spec.ts)                                     |

## 维护规则

改变会话槽位、状态机、输入/中断语义、工作目录查询或持久化策略时，必须同步聚合、服务、端口、适配器、测试和本文。工作流专属状态不得并入本文的普通会话状态机。
