# 终端会话生命周期

## 文档地位

本文是当前已实现普通终端 PTY 会话的统一维护入口。终端依赖图、任务/服务调度与 `WorkflowRun` 由[终端依赖工作流](terminal-workflow.md)单独维护。

全仓边界以[架构文档](../../engineering/architecture.md)为准；终端界面的稳定交互以 [UI 契约](../../product/ui-contract.md)为准。

## 能力状态与范围

普通终端会话负责：

- 在指定工作区目录启动交互式 shell 或带启动命令的 PTY。
- 转发输出、写入键盘输入、发送 Ctrl+C、调整行列和终止进程。
- 记录精确运行作用域、进程 ID、状态、输入历史、退出码或启动失败原因。
- 查询运行中 PTY 的当前工作目录，用于工作区切换安全判断。
- 保持同一项目/工作区/终端槽位只有一个当前会话，并隔离旧 generation 的迟到事件。
- 在 Project/BlockGraph 生命周期变更和应用退出时异步硬清理匹配 PTY 及其受管资源。

它不拥有终端积木配置、工作区选择或终端依赖图；这些事实分别属于 BlockGraph 与 Project。

## 聚合与状态

`TerminalSession` 是 Run 上下文的聚合根之一。状态机为：

```txt
idle -> running -> stopping -> exited
  \-> failed       \-----> exited
```

| 状态       | 含义                                         |
| ---------- | -------------------------------------------- |
| `idle`     | 聚合已创建，但尚未成功取得 PTY 进程          |
| `running`  | PTY 已启动，允许记录和转发输入               |
| `stopping` | 已发起异步终止，不再接受新的交互操作         |
| `exited`   | 进程自然退出或被终止；自然退出保存真实退出码 |
| `failed`   | PTY 启动失败，保存失败原因且进程 ID 保持为空 |

`recordInput` 只允许在 `running` 状态执行。Ctrl+C 只是向当前 PTY 写入 `\x03`，不会把会话伪装成已退出；关闭会话才终止进程并标记 `exited`。

## 会话身份与隔离

每次启动都会创建新的 `sessionId`、`runId` 和单调递增的 `generation`。完整 `TerminalRunScope` 还包含项目 ID/目录、工作区名称/目录、Git 分支和终端积木 ID。`TerminalSessionService` 使用精确项目/目录/工作区/终端 owner 识别当前槽位：

- 同一槽位启动新会话时，先异步终止并等待旧会话清理完成。
- 相同工作区名或终端积木 ID 在不同项目、目录或 worktree 中拥有独立会话，可以同时运行。
- 进程退出后移除槽位映射，但保留进程内的会话快照供当前调用读取。
- 输出、退出和服务端点事件必须同时匹配当前槽位的 `sessionId + runId + generation`；旧运行的迟到回调不能覆盖新会话。
- 每次启动在取得 PTY 前通过 `RunRuntimeScopeValidationPort` 校验 Project 的权威项目/工作区/分支身份，并受 `RunLifecycleService` 启动闸门保护。
- 应用退出或统一清理时先关闭新启动准入，再等待在途启动并终止全部 PTY，把运行中会话标记为退出。

Renderer 重新进入工作区时，可以按本地仍标记为运行中的 session ID 批量查询这些保留快照，并只按完整运行身份收敛状态。退出事件先于启动响应抵达时，表现层先用事件中的项目、工作区、终端和运行身份建立 `exited` 投影；同一运行迟到的 `running` 启动响应不得把它降级。已经保留但不再运行的 session 收到迟到 `write`、Ctrl+C 或 resize 时，应用层不再访问 PTY，而是幂等返回当前权威快照；这些交互动作指向未知 session 时仍返回 `TERMINAL_SESSION_NOT_FOUND`。终止动作表达“确保该 session 不再存在”，因此未知 session 视为已经完成并返回空结果，不能阻断随后启动新会话。

会话的 `workingDirectory` 来自 Project 工作区 DTO；Run 不自行读取或切换 Project 聚合，而是通过调用方拥有的校验端口验证该 DTO 仍然权威。

## PTY 端口语义

Run 应用层只依赖 `TerminalProcessPort`：

- `start`：以工作目录、shell、可选启动命令和行列启动 PTY，返回真实进程 ID。
- `write`：只向仍运行的 PTY 写入原始输入；已退出快照返回当前状态而不写入进程。
- `resize`：只同步仍运行的 PTY 行列，并返回当前会话快照供调用方对账。
- `readWorkingDirectory`：在 macOS 通过 `lsof`、Linux 通过 `/proc/<pid>/cwd` 尽力读取；不支持或进程消失时返回 `null`。
- `stop` / `disposeAll`：异步终止一个或全部受管 PTY，并等待适配器确认退出。

基础设施默认使用系统 shell；启动命令通过 shell 参数执行，不以解析 shell 提示符判断完成。环境变量覆盖在子进程边界注入，Windows 环境键按大小写不敏感规则处理。POSIX 清理向 PTY 进程组发送终止信号、等待退出并在超时后升级，避免只关闭 shell 而遗留仍占用端口的子进程；端口监听关闭仍由受管服务清理流程单独确认。xterm 的行列同步与视觉排障见[终端渲染排障指南](../../engineering/terminal-rendering.md)。

## 启动命令与受管服务

空终端由 `TerminalSessionService` 直接建立，不执行 BlockGraph 启动命令。用户执行启动命令时，`LaunchTerminalCommandUseCase` 通过 `TerminalLaunchPlanPort` 读取不可变计划：普通任务和未声明端口的输出就绪服务进入常规会话；声明端口意图的服务进入共享 `ManagedServiceLauncher`，由其分配端口、注入命令、验证监听者并发布实际端点。

受管服务在端口分配或命令注入等 PTY 启动准备阶段失败时，本次 session 必须保留为 `failed` 权威快照并释放当前槽位，不能在已经发布精确冲突 identity 后删除 session。这样工作区切换后的状态对账和下一次“启动命令”终止旧运行都不会指向悬空 identity；下一次启动仍使用递增 generation。

直接启动、终端组合逐成员启动和依赖工作流中的服务节点必须复用同一个受管启动器。完整端口策略、租约和所有权语义见[本地服务端口治理](service-port-management.md)。

## 状态与持久化

普通 `TerminalSession`、PTY 进程、输入历史、输出、端口租约和实际端点都是当前进程内的易失状态，不写入仓储。应用重启后由已持久化的 BlockGraph 终端配置重新建立空会话或启动命令，但不会恢复旧进程、输入历史、PID 或端口分配。

工作流执行可能复用普通终端会话作为输出承载，但工作流命令使用独立命令 PTY，并由 `TerminalSessionWorkflowRuntimeAdapter` 协调；不得把普通会话的人工输入当作工作流成功信号。

## 实现入口

| 层级           | 入口                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | [`TerminalSession.ts`](../../../src/contexts/run/domain/aggregates/TerminalSession.ts)                                                                                                                                                                                                                                                                                                                                             |
| Application    | [`TerminalSessionService.ts`](../../../src/contexts/run/application/use-cases/TerminalSessionService.ts)、[`LaunchTerminalCommandUseCase.ts`](../../../src/contexts/run/application/use-cases/LaunchTerminalCommandUseCase.ts)、[`RunLifecycleService.ts`](../../../src/contexts/run/application/use-cases/RunLifecycleService.ts)、[`TerminalProcessPort.ts`](../../../src/contexts/run/application/ports/TerminalProcessPort.ts) |
| Infrastructure | [`NodePtyTerminalProcessAdapter.ts`](../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter.ts)                                                                                                                                                                                                                                                                                                                |
| Platform       | [`terminalIpcHandlers.ts`](../../../src/platform/electron-main/terminalIpcHandlers.ts)                                                                                                                                                                                                                                                                                                                                             |

## 验证矩阵

| 层级           | 证明内容                                                                | 主要测试                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / Domain  | 状态迁移与仅运行中可输入                                                | [`run.terminal-session.spec.ts`](../../../tests/unit/contexts/run/run.terminal-session.spec.ts)                                                                                                                                                                                                                                           |
| Unit / Service | 精确作用域、替换、迟到事件、Ctrl+C、异步关闭、启动校验与 lifecycle gate | [`run.terminal-session-service.spec.ts`](../../../tests/unit/contexts/run/run.terminal-session-service.spec.ts)、[`run.run-lifecycle-service.spec.ts`](../../../tests/unit/contexts/run/run.run-lifecycle-service.spec.ts)、[`run.launch-terminal-command.spec.ts`](../../../tests/unit/contexts/run/run.launch-terminal-command.spec.ts) |
| Integration    | 真实 node-pty 启动、环境注入、进程清理、退出与工作目录                  | [`run.pty-terminal.spec.ts`](../../../tests/integration/contexts/run/run.pty-terminal.spec.ts)                                                                                                                                                                                                                                            |
| Unit / UI 协作 | 工作区切换时终端会话迁移                                                | [`terminal-session-workspace-migration.spec.ts`](../../../tests/unit/presentation/terminal-session-workspace-migration.spec.ts)                                                                                                                                                                                                           |
| E2E            | 用户启动、输入和关闭终端的主路径                                        | [`run-terminal-sessions.e2e.spec.ts`](../../../tests/e2e/run-terminal-sessions.e2e.spec.ts)                                                                                                                                                                                                                                               |

## 维护规则

改变会话槽位、状态机、输入/中断语义、工作目录查询或持久化策略时，必须同步聚合、服务、端口、适配器、测试和本文。工作流专属状态不得并入本文的普通会话状态机。
