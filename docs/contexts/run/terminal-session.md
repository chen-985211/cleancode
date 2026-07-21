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
- 为每个可恢复运行维护进程内权威终端模型、单调输出序号和有界屏幕快照。
- 通过独立本地 Provider 承载普通终端 PTY 和权威模型；用户可以按当前会话选择应用退出后继续运行。
- 在应用重开时区分精确 live attach、只读历史恢复、自然结束和新会话，并校验完整运行身份与 Provider 证据。
- 在普通终端视图 attach、detach 和重建时协调输出投递与 terminal query 响应权。
- 统一当前与后续权威模型的滚动历史预算，并为安全打开终端链接提供精确运行上下文。
- 在 Project/BlockGraph 生命周期变更时异步硬清理匹配 PTY、恢复资料及其受管资源；应用退出只保留明确选择且可可靠 checkpoint 的普通会话。

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

`recordInput` 只允许在 `running` 状态执行。Ctrl+C 只是向当前 PTY 写入 `\x03`，不会把会话伪装成已退出；关闭会话才终止进程并标记 `exited`。普通直接启动命令运行在保留会话的交互式 shell 启动包装层中，命令自然结束或被 Ctrl+C 中断后必须回到可输入的 shell；依赖工作流有限任务和受管端口服务仍使用随命令退出的 PTY，以保留退出码调度与端口清理语义。

会话还记录 `kind`、退出保留策略和恢复类型。`interactive` 与非工作流 `direct` 会话默认使用 `terminate-on-application-exit`，用户只可对当前运行会话明确切换为 `keep-after-application-exit`。replacement 通常创建使用默认策略的新会话；唯一继承入口是用户从已保留的当前普通会话执行“启动命令”，此时新建的非工作流 `direct` 会话在自身 checkpoint 成功后继承保留策略。重开空会话、新建终端、工作流启动及其他 replacement 不继承。`workflow` 永远不能启用退出保留。恢复类型固定为 `fresh`、`warm`、`historical`、`ended`：只有 `warm` 可以同时声称进程仍运行；`historical` 必须没有进程 ID、不能写入或中断。

## 会话身份与隔离

每次启动都会创建新的 `sessionId`、`runId` 和单调递增的 `generation`。完整 `TerminalRunScope` 还包含项目 ID/目录、工作区名称/目录、Git 分支和终端积木 ID。`TerminalSessionService` 使用精确项目/目录/工作区/终端 owner 识别当前槽位：

- 同一槽位启动新会话时，先异步终止并等待旧会话清理完成。
- 相同工作区名或终端积木 ID 在不同项目、目录或 worktree 中拥有独立会话，可以同时运行。
- 进程自然退出后移除活动槽位映射，但保留最新 generation 的会话快照和有界终端模型；显式终止或后续 replacement 撤销该恢复资格。
- 输出、退出、视图、快照和服务端点事件必须同时匹配当前槽位的完整运行身份；旧运行的迟到回调不能覆盖新会话。
- 每次启动在取得 PTY 前通过 `RunRuntimeScopeValidationPort` 校验 Project 的权威项目/工作区/分支身份，并受 `RunLifecycleService` 启动闸门保护。
- 应用退出时先关闭新启动准入并等待在途启动；工作流与默认策略会话被终止，可靠 checkpoint 的明确保留会话只从应用 detach。应用断连不等于 Provider shutdown。
- 显式关闭、replacement、删除积木、checkout、归档工作区和移除项目始终是硬清理：终止精确 PTY、撤销恢复资格并删除 checkpoint，覆盖退出保留策略。

Renderer 重新进入工作区或崩溃重建时，可以批量查询应用层已经接受的会话，并只按完整运行身份收敛状态。应用完整重开时，Run 先完成 Provider 对账再允许终端节点自动启动，避免新 shell 抢占 warm/historical identity。退出事件先于启动响应抵达时，表现层先用事件中的项目、工作区、终端和运行身份建立 `exited` 投影；同一运行迟到的 `running` 启动响应不得把它降级。已经保留但不再运行的 session 收到迟到 `write`、Ctrl+C 或 resize 时，应用层不再访问 PTY，而是幂等返回当前权威快照；这些交互动作指向未知 session 时仍返回 `TERMINAL_SESSION_NOT_FOUND`。终止动作表达“确保该 session 不再存在”，因此未知 session 视为已经完成并返回空结果，不能阻断随后启动新会话。

会话的 `workingDirectory` 来自 Project 工作区 DTO；Run 不自行读取或切换 Project 聚合，而是通过调用方拥有的校验端口验证该 DTO 仍然权威。

## PTY 端口语义

Run 应用层只依赖 `TerminalProcessPort`：

- `start`：以工作目录、shell、可选启动命令和行列启动 PTY，返回真实进程 ID。
- `write`：只向仍运行的 PTY 写入原始输入；已退出快照返回当前状态而不写入进程。
- `resize`：只同步仍运行的 PTY 行列，并返回当前会话快照供调用方对账。
- `pauseOutput` / `resumeOutput`：只用于模型背压和视图响应权交接，暂停读取 PTY 输出但不终止进程。
- `readWorkingDirectory`：在 macOS 通过 `lsof`、Linux 通过 `/proc/<pid>/cwd` 尽力读取；不支持或进程消失时返回 `null`。
- `stop` / `disposeAll`：异步终止一个或全部受管 PTY，并等待适配器确认退出。

基础设施默认使用系统 shell；有限任务和受管端口服务的启动命令通过 shell 参数执行，普通直接启动则使用明确的交互模式：POSIX 包装进程忽略发送给整个 PTY 前台进程组的 SIGINT，命令子进程恢复默认 SIGINT，命令结束后包装进程替换为用户 shell。该模式不解析 shell 提示符、不延迟注入输入，并且只执行一次启动命令。环境变量覆盖在子进程边界注入，Windows 环境键按大小写不敏感规则处理。POSIX 清理向 PTY 进程组发送终止信号、等待退出并在超时后升级，避免只关闭 shell 而遗留仍占用端口的子进程；端口监听关闭仍由受管服务清理流程单独确认。xterm 的行列同步与视觉排障见[终端渲染排障指南](../../terminal/rendering.md)。

## 权威终端模型与视图协议

`TerminalSession` 继续拥有 PTY 业务生命周期；`TerminalModelPort` 只拥有同一运行在当前应用进程内的屏幕技术状态。PTY 输出通过 `TerminalSessionService` 的当前身份检查后，只进入权威模型一次，再携带该运行内单调递增的 `sequence` 交给应用消费者和当前视图。

每个模型使用与可见终端一致的行列、Unicode 11 宽度规则和当前滚动历史预算，维护 ANSI 屏幕、光标、颜色、alternate buffer、已支持模式、标题、工作目录和可读 transcript。滚动历史预算只接受 1000、5000 或 10000 行，默认 1000 行；设置变更同步到当前及后续模型和视图，并随 snapshot 明确传递。`TerminalSnapshot.sequence` 与 `RestoreMarker` 表示快照已经包含到哪个输出；renderer 只接受同一 `viewId` 和完整运行身份的后续事件，并按序丢弃重复、检测缺口。

视图生命周期遵守：

1. `AttachView` 暂停 PTY 输出，等待模型完成已接受写入，生成 snapshot，并把 terminal query 响应权从隐藏模型交给该视图后恢复输出。
2. snapshot 生成和 IPC 返回期间的 live output 进入 renderer 的有界队列；renderer 先恢复 snapshot，再接续大于 snapshot sequence 的连续事件。
3. `DetachView` 只暂停输出并把响应权交还模型，不终止 PTY。旧 xterm 在主进程确认 detach 前保持可用，确认后立即销毁。
4. 缺失 sequence 或超过 1 MiB renderer 恢复队列时重新 attach；模型待解析输出达到 1 MiB 时暂停 PTY，降到 256 KiB 后恢复。
5. `ReplaceSession`、显式终止和统一硬清理同时释放 PTY、模型、视图租约、缓冲与恢复文件；自然退出和 Provider 故障只保留有界最终模型，不伪造 live 状态。

因此，普通终端的 renderer xterm 是可丢弃投影，不是输出历史、屏幕状态或恢复资格的事实来源。隐藏普通终端不接收逐字节输出；terminal query 在任意时刻只能由隐藏模型或当前视图中的一个响应。

## 输入与安全打开边界

普通键盘输入、IME 提交和粘贴最终都通过 `TerminalSessionService.write` 写入精确且仍运行的 session。Presentation 可以负责 composition 状态、剪贴板来源、用户确认、UTF-8 分片和 bracketed-paste 协议，但不得因此获得 PTY 生命周期、输入历史或当前运行身份的所有权。分片写入按调用顺序串行，取消或失败必须在已经打开 bracketed-paste 时尽力发送结束标记。

打开终端链接由 `OpenTerminalLinkUseCase` 重新建立授权边界：

1. `TerminalSessionService` 使用完整运行身份取得当前 workspace 与权威模型记录的最后工作目录；运行中的 PTY 工作目录探测成功时同时更新模型。
2. HTTP/HTTPS 目标交给平台外部打开端口；其他 URI scheme 一律拒绝。
3. 本地路径可以携带行、列提示，但必须先解析相对工作目录，再通过文件系统端口分别取得目标与 workspace 的真实路径。
4. 目标不存在、不是文件、越出 workspace、作用域已经失效或通过符号链接逃逸时失败关闭；平台打开能力只消费已经授权的绝对路径，不参与业务判断。

链接点击、搜索浮层、剪贴板确认和渲染器降级属于表现层交互，不写入 `TerminalSession` 或 BlockGraph。

## 启动命令与受管服务

空终端由 `TerminalSessionService` 直接建立，不执行 BlockGraph 启动命令。用户执行启动命令时，`LaunchTerminalCommandUseCase` 通过 `TerminalLaunchPlanPort` 读取不可变计划：普通任务和未声明端口的输出就绪服务进入常规会话；声明端口意图的服务进入共享 `ManagedServiceLauncher`，由其分配端口、注入命令、验证监听者并发布实际端点。

受管服务在端口分配或命令注入等 PTY 启动准备阶段失败时，本次 session 必须保留为 `failed` 权威快照并释放当前槽位，不能在已经发布精确冲突 identity 后删除 session。这样工作区切换后的状态对账和下一次“启动命令”终止旧运行都不会指向悬空 identity；下一次启动仍使用递增 generation。

直接启动、终端组合逐成员启动和依赖工作流中的服务节点必须复用同一个受管启动器。完整端口策略、租约和所有权语义见[本地服务端口治理](service-port-management.md)。

## 状态与持久化

`TerminalSession` 业务状态继续由 Run 聚合解释；BlockGraph 只持久化终端定义和启动意图，不保存运行实例。独立 Provider 在 Electron renderer/main 之外拥有普通终端 PTY、headless 模型和 live session identity，并通过带协议版本、随机认证材料、实例 ID、进程信息和单 controller 约束的本机帧协议与应用协作。PID 只是一项证据，不能在未验证 metadata、认证、协议、Provider instance 和完整 `TerminalRunScope` 时用于 attach、替换或终止。

Provider 启动协调使用短期、版本化且带唯一 owner 的本机租约。同一应用内的并发调用共享一次连接任务；空白或损坏租约先经过有界初始化宽限期，死亡 owner 和超期租约可以回收，旧 owner 迟到释放不得删除后继租约。应用退出先关闭新的连接准入并等待在途连接释放租约，再向已认证 Provider detach；断连期间只更新本地滚动历史设置，下一次任意连接在发送业务请求前统一同步最新值，不记录预期的断连设置警告。

Run 基础设施在应用数据目录保存 schema v1 checkpoint 与追加式输出记录。checkpoint 包含有界普通/alternate 屏幕、可读 normal buffer 历史、cwd、行列、标题、模式和最后 sequence；输出记录只重放 checkpoint 之后的连续 sequence。写入使用同目录临时文件、同步、原子重命名和目录同步，单 checkpoint、输出日志、冷历史数量、保留期和全局字节数都有上限；容量清理只淘汰冷历史，不为腾出空间终止 live 会话。损坏或未知版本按 session 隔离。首次启用保留无法完成 checkpoint 时动作失败并回滚；后续持久化失效时 Provider 撤销保留并通知应用，应用退出时安全终止该会话。

应用重开优先对已认证 Provider 中仍存活的精确会话执行 warm attach，先取得 Provider 权威 snapshot，再接续实时 sequence。Provider 已丢失时，新 Provider 只从 checkpoint 和连续输出记录恢复 normal-buffer 历史、cwd、尺寸与模式，产生无进程声明的只读 `historical` 会话；alternate screen 不覆盖可读历史。损坏资料不会阻断其他会话，新建 shell 必须使用新的 `sessionId + runId + generation`。

工作流执行可能复用普通终端会话作为输出承载，但工作流命令使用独立命令 PTY，并由 `TerminalSessionWorkflowRuntimeAdapter` 协调；不得把普通会话的人工输入当作工作流成功信号，也不得把 Provider 中的单个 PTY 恢复投影为已恢复的 `WorkflowRun`。

## 实现入口

| 层级           | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain         | [`TerminalSession.ts`](../../../src/contexts/run/domain/aggregates/TerminalSession.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Application    | [`TerminalSessionService.ts`](../../../src/contexts/run/application/use-cases/TerminalSessionService.ts)、[`LaunchTerminalCommandUseCase.ts`](../../../src/contexts/run/application/use-cases/LaunchTerminalCommandUseCase.ts)、[`OpenTerminalLinkUseCase.ts`](../../../src/contexts/run/application/use-cases/OpenTerminalLinkUseCase.ts)、[`RunLifecycleService.ts`](../../../src/contexts/run/application/use-cases/RunLifecycleService.ts)、[`TerminalProcessPort.ts`](../../../src/contexts/run/application/ports/TerminalProcessPort.ts)、[`TerminalModelPort.ts`](../../../src/contexts/run/application/ports/TerminalModelPort.ts)、[`TerminalLinkPorts.ts`](../../../src/contexts/run/application/ports/TerminalLinkPorts.ts)                 |
| Infrastructure | [`NodePtyTerminalProcessAdapter.ts`](../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter.ts)、[`HeadlessTerminalModelAdapter.ts`](../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter.ts)、[`TerminalProviderServer.ts`](../../../src/contexts/run/infrastructure/provider/TerminalProviderServer.ts)、[`PersistentTerminalProviderClient.ts`](../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClient.ts)、[`FileTerminalRecoveryStore.ts`](../../../src/contexts/run/infrastructure/persistence/FileTerminalRecoveryStore.ts)、[`NodeTerminalLinkFileSystemAdapter.ts`](../../../src/contexts/run/infrastructure/filesystem/NodeTerminalLinkFileSystemAdapter.ts) |
| Platform       | [`terminal-runtime-provider.ts`](../../../src/platform/electron-main/terminal-runtime-provider.ts)、[`terminalIpcHandlers.ts`](../../../src/platform/electron-main/terminalIpcHandlers.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 验证矩阵

| 层级           | 证明内容                                                                                                                                      | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / Domain  | 状态迁移、退出策略、恢复资格与仅运行中可输入                                                                                                  | [`run.terminal-session.spec.ts`](../../../tests/unit/contexts/run/run.terminal-session.spec.ts)、[`run.terminal-runtime-recovery.spec.ts`](../../../tests/unit/contexts/run/run.terminal-runtime-recovery.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Unit / Service | 精确作用域、替换、迟到事件、sequence、视图 attach/detach、Ctrl+C、链接授权、异步关闭、启动校验与 lifecycle gate                               | [`run.terminal-session-service.spec.ts`](../../../tests/unit/contexts/run/run.terminal-session-service.spec.ts)、[`run.terminal-session-model-lifecycle.spec.ts`](../../../tests/unit/contexts/run/run.terminal-session-model-lifecycle.spec.ts)、[`run.open-terminal-link.spec.ts`](../../../tests/unit/contexts/run/run.open-terminal-link.spec.ts)、[`run.run-lifecycle-service.spec.ts`](../../../tests/unit/contexts/run/run.run-lifecycle-service.spec.ts)、[`run.launch-terminal-command.spec.ts`](../../../tests/unit/contexts/run/run.launch-terminal-command.spec.ts)                                                                                                                                                                                                                                                                                                    |
| Integration    | 真实 node-pty、Provider 启动租约、并发连接、attach/detach、checkpoint/cold restore、headless 模型、alternate buffer、背压、路径边界和进程清理 | [`run.pty-terminal.spec.ts`](../../../tests/integration/contexts/run/run.pty-terminal.spec.ts)、[`run.terminal-provider-launch-lock.spec.ts`](../../../tests/integration/contexts/run/run.terminal-provider-launch-lock.spec.ts)、[`run.terminal-provider-client-lifecycle.spec.ts`](../../../tests/integration/contexts/run/run.terminal-provider-client-lifecycle.spec.ts)、[`run.terminal-provider-server.spec.ts`](../../../tests/integration/contexts/run/run.terminal-provider-server.spec.ts)、[`run.file-terminal-recovery-store.spec.ts`](../../../tests/integration/contexts/run/run.file-terminal-recovery-store.spec.ts)、[`run.headless-terminal-model.spec.ts`](../../../tests/integration/contexts/run/run.headless-terminal-model.spec.ts)、[`run.terminal-link-filesystem.spec.ts`](../../../tests/integration/contexts/run/run.terminal-link-filesystem.spec.ts) |
| Contract       | snapshot、scrollback、restore marker、视图身份、链接命令、定向输出和 renderer 销毁清理                                                        | [`run.terminal-view-ipc.spec.ts`](../../../tests/contract/contexts/run/run.terminal-view-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Unit / UI 协作 | 工作区切换时终端会话迁移                                                                                                                      | [`terminal-session-workspace-migration.spec.ts`](../../../tests/unit/presentation/terminal-session-workspace-migration.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| E2E            | 输入/视图重建、应用与 renderer/main/Provider 故障、中断启动租约、并发终端重启、warm/history 区分、永久关闭、项目移除和工作流不恢复            | [`run-terminal-sessions.e2e.spec.ts`](../../../tests/e2e/run-terminal-sessions.e2e.spec.ts)、[`git-branch-workspaces.e2e.spec.ts`](../../../tests/e2e/git-branch-workspaces.e2e.spec.ts)、[`terminal-daily-interactions.e2e.spec.ts`](../../../tests/e2e/terminal-daily-interactions.e2e.spec.ts)、[`terminal-runtime-recovery.e2e.spec.ts`](../../../tests/e2e/terminal-runtime-recovery.e2e.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 维护规则

改变会话槽位、状态机、输入/中断语义、模型和视图交接、输出 sequence、工作目录查询或持久化策略时，必须同步聚合、服务、端口、适配器、测试和本文。工作流专属状态不得并入本文的普通会话状态机。
