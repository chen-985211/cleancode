# 本地服务端口治理

## 文档地位

本文是当前已实现本地服务端口治理能力的统一维护入口，描述多个项目、多个 worktree 和多个终端服务并行运行时的端口意图、运行身份、租约、实际端点、监听所有权、生命周期与用户反馈。

全仓边界以[架构文档](../../engineering/architecture.md)为准；持久化服务意图以[积木图模型](../block-graph/block-graph.md)为准；普通 PTY 和工作流语义分别见[终端会话生命周期](terminal-session.md)与[终端依赖工作流](terminal-workflow.md)；稳定交互以 [UI 契约](../../product/ui-contract.md)为准。

代码和自动化测试是可执行事实的最终证据。本文的“后续候选”不是当前能力。

## 能力状态与范围

当前已经形成以下闭环：

- 服务终端可以声明 `fixed`、`preferred` 或 `auto` 端口策略。
- 动态端口通过显式环境变量或安全命令参数后缀注入；固定端口可以声明不注入。
- BlockGraph 只持久化服务意图，Run 在每次启动时分配并拥有实际端口。
- 直接启动命令、终端组合逐成员启动和依赖工作流服务节点复用同一个受管服务启动器。
- Run 使用精确项目/工作区/终端/会话/运行 identity 隔离并发和迟到事件。
- 服务就绪必须使用实际端点；受管端口还要证明监听者属于本次 PTY，不能只凭 TCP 可连接。
- 实际地址在终端节点中持续可见、可复制；HTTP/HTTPS 可以按精确 Run identity 安全打开。
- 固定冲突可以识别当前应用内的受管 owner，并区分受管、外部与未知监听者反馈。
- 明确保留的非工作流直接启动服务在应用重开后，只有重新证明同一 live session、根进程和监听所有权，才恢复实际端点与已绑定租约。
- 删除终端、归档 worktree、同步失效或目录重绑定的物理工作区和移除项目都会进入 Run 硬清理；默认工作区分支 checkout 不清理运行态。应用退出则关闭新启动准入并把默认策略、工作流和 Agent 会话一次性交给 Provider 停止，只有明确保留的普通/直接启动会话可以继续存活。

当前只治理 cleancode 通过终端“启动命令”、组合启动或终端工作流启动的服务。用户在交互式 shell 中手工输入的任意命令不自动获得端口意图、租约或实际端点。

## 统一语言

| 术语       | 含义                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ |
| 端口意图   | BlockGraph 持久化的协议、端口策略和注入方式；不包含本次实际分配                      |
| 固定端口   | `fixed(port)`；端口不可改变，冲突时失败                                              |
| 首选端口   | `preferred(port)`；先尝试指定端口，冲突或所有权不匹配时允许有限回退                  |
| 自动端口   | `auto`；Run 请求操作系统动态端口并有限重试                                           |
| 端口注入   | 把实际端口传给服务的显式方式：环境变量、命令参数后缀或不注入                         |
| 运行 owner | 项目、项目目录、工作区、工作区目录、Git 分支和终端积木组成的受管运行所有者           |
| 运行身份   | owner 加上 `sessionId + runId + generation`，唯一标识一次终端运行                    |
| 端口租约   | Run 在一次运行内维护的易失端口记录，状态为预留、激活、已绑定、释放中、已释放或已隔离 |
| 实际端点   | 本次运行确认的协议、`127.0.0.1`、实际端口、请求端口、是否回退、展示地址与是否可打开  |
| 受管监听者 | 能通过当前 Run identity 与进程祖先关系证明属于本次受管 PTY 的监听进程                |
| 外部监听者 | 已确认不属于本次受管 PTY 的监听进程                                                  |
| 未知监听者 | 当前平台或瞬时状态无法可靠证明归属的监听者；安全语义等同于不可操作的外部资源         |

## 事实所有权

| 事实或能力                           | Owner                 | 持久化                     |
| ------------------------------------ | --------------------- | -------------------------- |
| 项目、目录、工作区和 Git 分支身份    | Project               | 是                         |
| 端口策略、协议、注入方式和就绪配置   | BlockGraph            | 是                         |
| 单终端与工作流不可变启动计划         | BlockGraph            | 否，启动时 DTO             |
| 精确运行身份、端口租约和实际端点     | Run                   | 否；warm attach 时重新建立 |
| 分配、PTY 注入、TCP 探测和监听所有权 | Run infrastructure    | 否                         |
| 实际地址和冲突反馈                   | Presentation 派生投影 | 否                         |
| IPC 注册、系统打开和跨上下文端口装配 | Platform              | 否                         |

实际端点不能反写 BlockGraph；界面地址和冲突提示不能成为 Run 状态事实来源；Run 不能直接读取 Project 或 BlockGraph 聚合。

## 持久化端口意图

### 策略

- `fixed(port)`：端口必须是 `1..65535` 的整数。端口被占用或最终监听者不属于本次 PTY 时，启动失败，不递增、不静默回退。
- `preferred(port)`：第一次尝试指定端口，失败后由操作系统选择其他端口；实际端点记录 `requestedPort` 和 `fallback`。
- `auto`：不保存请求端口，每次运行重新请求操作系统动态端口。

### 协议

协议为 `http`、`https` 或 `tcp`。它用于形成实际端点和决定用户能否打开地址；它不会自动修改项目服务的协议、证书或监听主机。当前宿主地址固定为 `127.0.0.1`。

### 注入

- `none`：Run 不改动命令或环境，只允许搭配 `fixed`。它适合启动命令或外部配置已经固定端口的服务。
- `environment(variableName)`：把实际端口作为字符串注入指定环境变量；变量名必须匹配 Shell 环境变量语法，不能使用 `CLEANCODE_` 保留前缀或内部 marker 名称。这是界面推荐方式。
- `argument(template)`：把模板作为参数后缀追加到启动命令。模板必须恰好包含一个 `{port}`，且只允许字母、数字、空格和受限的参数标点，不接受换行、NUL、重定向、管道、命令替换或其他 Shell 元字符。

`preferred` 和 `auto` 必须选择环境变量或参数注入。cleancode 不解析启动命令猜测框架，不修改项目源码、`.env`、CORS、OAuth 或 package script。

### 就绪组合

- TCP 就绪必须声明端口意图，并检查本次实际端点。
- 输出就绪可以不声明端口，保持既有非受管服务语义。
- 输出就绪一旦声明端口意图，Run 必须同时满足字面量输出和实际 TCP 监听，再检查监听所有权。

## 版本与迁移

服务端口意图随 BlockGraph 的规范终端执行配置持久化；图仓储 envelope 的当前版本与兼容范围由[积木图模型](../block-graph/block-graph.md)统一维护：

- 所有受支持的 BlockGraph 快照都必须包含规范执行配置和端口意图。
- 无版本、未知版本、畸形联合结构、无端口的 TCP 就绪或动态策略搭配 `none` 必须拒绝读取，不迁移、回写或静默变成任务。
- 当前实现不读取或自动迁移无版本旧 TCP 快照。

终端名称、描述、启动命令和执行配置通过一个 BlockGraph 用例原子保存，避免端口意图与命令部分提交。

## 运行身份与启动路径

`TerminalRunScope` 包含：

```txt
projectId + projectDirectory
  + workspaceId + workspaceDirectory + gitBranch(metadata)
  + ownerKind + ownerId
  + sessionId + runId + generation
```

画布 owner 的稳定身份是 `projectId + workspaceId + objectKind + objectId`；目录、分支和运行实例字段是启动元数据或精确 generation 证据，不进入 owner slot key。同一个精确 owner 的启动在 Run 内串行；启动新 generation 前等待旧会话异步终止。Run 在创建 PTY 前同时经过：

1. `RunLifecycleService` 的启动闸门，防止物理工作区归档/移除、删除终端或应用退出期间重启。
2. `RunRuntimeScopeValidationPort` 对 Project 权威项目、`workspaceId` 和物理目录的校验；Git 分支不参与 owner 身份。
3. BlockGraph 不可变启动计划，确保命令和端口意图来自同一次已提交定义。

直接启动由 `LaunchTerminalCommandUseCase` 进入；组合启动逐成员调用该用例；工作流服务节点由 `TerminalWorkflowService` 进入。三条路径最终复用 `ManagedServiceLauncher`，普通任务和无端口的输出就绪服务继续使用常规 PTY 路径。

端口分配冲突发生在 PTY 启动准备阶段时，Run 仍保留带有本次精确 identity 的 `failed` session 快照，同时释放槽位供下一 generation 使用。冲突事件、renderer 对账和后续终止因此引用同一个可查询事实；不能发布冲突 identity 后再删除对应 session。终止一个已经不存在的旧 session 是幂等完成，但已存在的受管 session 仍必须等待监听关闭并完成租约释放或隔离。

## 分配、租约与竞争

Run 通过 `LocalPortReservationPort` 在回环地址创建临时 TCP Server：

1. `fixed` 或 `preferred` 首次尝试请求端口；`auto` 和回退尝试请求端口 `0`，由操作系统选择端口。
2. 同一应用进程内先检查活动租约，再获取操作系统预留，随后再次检查租约，防止本进程并发重复分配。
3. 建立 `reserved` 租约并形成实际端点。
4. 在 PTY 启动闸门内应用端口注入，释放临时预留，再启动目标服务；租约进入 `activating`。
5. 服务满足就绪和所有权校验后，租约进入 `bound`，实际端点才对外确认。

临时 TCP Server 无法把监听句柄通用地移交给任意项目进程，因此“释放预留—目标进程监听”仍有竞争窗口。Run 不把预检查当成无竞争保证，而是使用有限分配与激活重试。重试耗尽返回结构化失败，不无限循环。

同一固定或首选端口的旧租约已经进入 `releasing` 时，新启动会按精确 lease identity 有界等待其进入 `released` 或 `quarantined`，不会把清理窗口误报为普通活动冲突。`quarantined` 不会仅凭进程退出记录自动释放；只有旧精确 session 已由 Run 权威快照确认 `exited/failed`，并且 Run 在旧租约仍存在时重新取得该端口的真实操作系统 reservation，才允许原子移除旧隔离并建立新租约。reservation 失败表示仍有监听者，隔离继续保留；系统不自动终止外部进程。

## 监听所有权与就绪

TCP 可连接只证明某个进程在监听，不能证明它属于本次运行。macOS、Linux 和 Windows 适配器按以下顺序验证：

1. 确认受管 PTY 根进程仍存活。
2. 用平台端口表读取实际端口的监听 PID 集合。
3. 沿平台进程父链确认每个监听者是受管根进程或其后代。
4. 再次读取监听集合、确认根进程存活并复核祖先关系，拒绝检查期间发生的监听者替换。

全部监听者属于本次进程树时为 `owned`；明确没有任何监听者属于本次进程树时为 `external`；工具不可用、平台不支持、进程消失、集合变化或所有权混合时为 `unknown`。

平台取证入口分别为 macOS `lsof/ps`、Linux `/proc/net/tcp*`＋进程 fd/父链和 Windows `netstat`＋PowerShell CIM。`preferred`/`auto` 遇到明确外部监听者时会先清理本次尝试并有限重试；`fixed` 失败。`unknown` 不能安全重试或释放为普通可用状态：Run 停止本次 PTY 并隔离租约，以 `SERVICE_LISTENER_OWNERSHIP_UNVERIFIED` 失败关闭。任一平台工具不可用或证据不稳定时都不能降低“必须证明所有权”的不变量。

服务自守护、double-fork 后脱离受管进程树，或在所有权证明前把监听转交给无祖先关系进程，不属于当前支持范围。

应用重开后的端点恢复使用 live Provider 给出的候选证据，不读取 renderer 缓存，也不从 checkpoint 猜测。Run 必须先接受同一完整 `TerminalRunScope` 的 warm session，确认根进程 ID 与候选一致，再重新执行上述监听祖先校验；只有结果为 `owned` 才通过 `adoptBound` 建立当前应用内的新租约并发布端点。`external`、`unknown`、历史会话、PID 不一致或 generation 失配都丢弃候选，不能显示地址或占用租约。Provider 故障后的 cold restore 没有 live 根进程，因此不恢复实际端点。

## 实际端点与事件

实际端点固定包含：

- `protocol` 与 `host: 127.0.0.1`。
- `port`、可空 `requestedPort` 和 `fallback`。
- `displayAddress`，例如 `http://127.0.0.1:41001`。
- `openable`；只有 HTTP/HTTPS 为 `true`。

启动、就绪、工作流节点快照、运行事件和界面都使用同一个实际端点。事件按项目、工作区、终端和完整 `sessionId + runId + generation` 投影；旧会话迟到的 endpoint/exit/conflict 事件不得覆盖当前运行。

“打开服务”IPC 不接受 renderer 提供的任意 URL，只接受精确 Run identity。主进程重新查询仍活动的受管 endpoint，确认 identity 和 HTTP/HTTPS 协议后才调用系统打开；TCP 端点只允许复制。

## 冲突反馈：当前 6a

当前已经交付轻量、所有权感知的冲突反馈：

- 首选端口回退成功：终端常驻地址条显示实际地址，并说明首选端口与实际端口。
- 当前应用内活动租约占用固定端口：结构化错误携带受管项目、工作区、终端、租约状态和运行身份；界面展示用户可读 owner 并可定位，只有已绑定服务可以打开。
- 受管冲突同时携带 `reserved/activating/bound/releasing/quarantined` 状态；只有 `bound` owner 可以打开，释放中和隔离状态只提供准确说明与安全定位。
- 操作系统端口已占用但没有当前受管租约：按外部占用处理，只提供编辑配置和关闭提示。
- 监听所有权不匹配或无法确认：分别显示外部或未知归属，不自动终止占用者。
- 分配耗尽和清理失败使用稳定错误码，不把 raw 异常或终端输出作为用户判断依据。

当前界面不展示外部 PID，不提供“停止已有服务并重试”，也不自动杀死外部或未知监听者。这些属于后续 6b，必须先设计重新验证 owner、PID 复用、操作确认和失败恢复。

## 停止与跨上下文生命周期

停止受管服务时，Run 依次取消就绪等待、把租约标记为释放中、终止 PTY/进程组、等待实际监听关闭，再释放租约。进程退出事件只证明 PTY 已结束，不代表端口已经释放；Run 继续发布精确运行身份的 `releasing`，并在监听关闭后发布 `released`，或在清理无法确认时发布 `quarantined`。监听未在清理时限内关闭时返回 `SERVICE_PORT_CLEANUP_FAILED`，不能把仍占用的端口重新分配。

以下外部生命周期通过调用方拥有的端口进入同一个 `RunLifecycleService`：

- Project 的 worktree 归档、外部 Git 同步清理失效或目录重绑定的物理工作区和移除项目使用 `WorkspaceRunLifecyclePort`；默认工作区分支 checkout 不调用该端口。
- BlockGraph 删除终端使用 `TerminalRunLifecyclePort`。
- Platform 应用退出先阻止新 Run、工作流和受管服务启动，abort 就绪/激活等待并排空退出前已经接纳的启动；随后由 `TerminalSessionService` 通过一次 application detach 把 PTY 停止职责交给 Provider。只有用户明确保留、Provider checkpoint 可靠且非 workflow/Agent 的普通或直接启动会话可以继续存活，应用重开后仍按监听所有权规则重建端点租约。

生命周期先阻止匹配作用域的新启动，再等待在途启动并清理已登记资源。一次 Project 同步同时改变多个工作区时，通过一个项目级批量 lease 排空全部匹配资源，避免逐个 lease 相互等待；进入 quarantine 后仍为每个 workspace key 保留独立 blocker。调用方持有 release/resolve/quarantine lease 到自己的外部副作用和持久化提交收束。失败释放闸门不会自动重启已经停止的服务；外部状态不确定时 quarantine，只有 Project 后续权威同步/重新打开才能解除对应隔离。

应用退出不同于用户显式停止和 Project/BlockGraph 硬清理。`TerminalWorkflowService.prepareApplicationShutdown()` 会先调用 `ManagedServiceLauncher.prepareApplicationShutdown()`，关闭准入、abort readiness/activation，并等待已接纳的启动收束；退出分支不逐 session 调用 `terminateProcess`，也不在 Electron main 中逐端口等待监听关闭。Provider 是该路径唯一的物理 PTY 停止 owner；workflow 与 Agent 没有保留资格，Provider 终止其进程后端口才随操作系统进程资源关闭。

Electron 的 complete 阶段只注销 workflow/managed lifecycle 与 managed terminator，清空当前 main 进程中的 active service、activation controller、易失租约和 endpoint 引用，并以 `null` 结束仅属于该进程的租约等待。它不会把仍为 `bound`/`releasing` 的租约伪造为 `released`，也不表示 main 已确认监听关闭；若 Provider 清理越过 Electron deadline，Provider 仍继续持有并完成物理清理。

普通工作流显式停止在端口租约确认释放后可以把终端交还为空交互式 shell；删除终端、物理工作区归档/移除和移除项目仍是硬清理，不执行交还，但继续等待监听关闭并落到 `released` 或 `quarantined`。默认工作区分支 checkout 保留现有服务运行态。这些既有路径不改走应用退出的轻量交接。

## 稳定错误

| 错误码                                  | 语义                                     |
| --------------------------------------- | ---------------------------------------- |
| `RUN_SCOPE_STALE`                       | Project 已不再拥有请求的运行作用域       |
| `RUN_START_BLOCKED`                     | 生命周期变更或退出正在阻止该作用域启动   |
| `SERVICE_PORT_FIXED_CONFLICT`           | 固定端口已被当前租约或操作系统监听占用   |
| `SERVICE_PORT_ALLOCATION_EXHAUSTED`     | 有限分配/激活尝试耗尽                    |
| `SERVICE_LISTENER_OWNERSHIP_MISMATCH`   | 实际监听者明确不属于本次 PTY             |
| `SERVICE_LISTENER_OWNERSHIP_UNVERIFIED` | 当前平台或瞬时状态无法证明监听者归属     |
| `SERVICE_PORT_CLEANUP_FAILED`           | PTY 结束后实际监听未确认关闭，租约已隔离 |
| `SERVICE_ENDPOINT_NOT_OPENABLE`         | 端点不是当前精确 HTTP/HTTPS 受管运行     |
| `SERVICE_PORT_MANAGEMENT_UNSUPPORTED`   | 所需受管端口能力没有可用装配             |

## 当前非目标

- 自动推断 Vite、Next.js 等框架的端口参数，或写入项目源码、`.env`、CORS、OAuth 和 webhook 配置。
- 服务监听端口 `0` 后通过自报告/结构化握手回传端点；当前 `auto` 使用临时预留、注入和有限重试。
- 自动终止外部、未知或重启后仅由陈旧 PID 指向的进程。
- 持久化端口租约或在 Provider 故障后的 cold restore 中恢复实际端点；只有仍存活且重新通过所有权校验的 warm 服务可以恢复端点投影。
- 让下游节点通过表达式引用上游实际端点。
- 稳定本地域名、反向代理、HTTPS 证书、HMR/WebSocket 代理或公开 `0.0.0.0` 监听。
- 强制 Docker、Dev Container、虚拟机或远程环境；容器网络只作为后续可选适配。
- 让 CleanCode MCP 启动、查询或停止终端/工作流；当前 MCP 只提供画布创作与检查工具，完整工具目录由 [cleancode 原生 MCP](../agent/cleancode-mcp.md)维护。

## 实现入口

| 层级               | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BlockGraph domain  | [`TerminalWorkflowRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowRules.ts)、[`TerminalDefinitionRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalDefinitionRules.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| BlockGraph storage | [`BlockGraphStore.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/BlockGraphStore.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Run domain         | [`ServicePortIntent.ts`](../../../src/contexts/run/domain/value-objects/ServicePortIntent.ts)、[`ActualServiceEndpoint.ts`](../../../src/contexts/run/domain/value-objects/ActualServiceEndpoint.ts)、[`TerminalRunScope.ts`](../../../src/contexts/run/domain/value-objects/TerminalRunScope.ts)、[`ServicePortLeaseRegistry.ts`](../../../src/contexts/run/domain/services/ServicePortLeaseRegistry.ts)                                                                                                                                                                                                                                                                                            |
| Run application    | [`LocalPortAllocator.ts`](../../../src/contexts/run/application/services/LocalPortAllocator.ts)、[`ManagedServiceLauncher.ts`](../../../src/contexts/run/application/services/ManagedServiceLauncher.ts)、[`ManagedServiceApplicationShutdown.ts`](../../../src/contexts/run/application/services/ManagedServiceApplicationShutdown.ts)、[`TerminalWorkflowApplicationShutdown.ts`](../../../src/contexts/run/application/services/TerminalWorkflowApplicationShutdown.ts)、[`LaunchTerminalCommandUseCase.ts`](../../../src/contexts/run/application/use-cases/LaunchTerminalCommandUseCase.ts)、[`RunLifecycleService.ts`](../../../src/contexts/run/application/use-cases/RunLifecycleService.ts) |
| Run infrastructure | [`TerminalProviderShutdownCoordinator.ts`](../../../src/contexts/run/infrastructure/provider/TerminalProviderShutdownCoordinator.ts)、[`NodeLocalPortReservationAdapter.ts`](../../../src/contexts/run/infrastructure/network/NodeLocalPortReservationAdapter.ts)、[`NodeTcpListenerInspectionAdapter.ts`](../../../src/contexts/run/infrastructure/network/NodeTcpListenerInspectionAdapter.ts)、[`NodePtyTerminalProcessAdapter.ts`](../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter.ts)                                                                                                                                                                                |
| Platform           | [`applicationRuntimeShutdown.ts`](../../../src/platform/electron-main/applicationRuntimeShutdown.ts)、[`runLifecycleAdapters.ts`](../../../src/platform/electron-main/runLifecycleAdapters.ts)、[`runRuntimeScopeValidationAdapter.ts`](../../../src/platform/electron-main/runRuntimeScopeValidationAdapter.ts)、[`terminalIpcHandlers.ts`](../../../src/platform/electron-main/terminalIpcHandlers.ts)                                                                                                                                                                                                                                                                                             |
| Presentation       | [`TerminalServiceRuntimeBar.tsx`](../../../src/contexts/run/presentation/components/TerminalServiceRuntimeBar.tsx)、[`terminalServiceRunProjection.ts`](../../../src/contexts/run/presentation/view-models/terminalServiceRunProjection.ts)、[`TerminalMetadataForm.tsx`](../../../src/contexts/block-graph/presentation/components/TerminalMetadataForm.tsx)、[`terminalExecutionConfigDraft.ts`](../../../src/contexts/block-graph/presentation/view-models/terminalExecutionConfigDraft.ts)                                                                                                                                                                                                       |

## 验证矩阵

| 层级                | 证明内容                                                                    | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / BlockGraph   | 端口意图不变量、原子定义、单终端计划和删除清理                              | [`block-graph.service-port-intent.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.service-port-intent.spec.ts)、[`block-graph.update-terminal-definition.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.update-terminal-definition.spec.ts)、[`block-graph.get-terminal-launch-plan.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.get-terminal-launch-plan.spec.ts)、[`block-graph.delete-terminal-lifecycle.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.delete-terminal-lifecycle.spec.ts)                                                                                                                                                 |
| Unit / Run          | 策略/注入、租约状态、有限分配、受管启动、精确身份、硬生命周期和应用退出交接 | [`run.service-port-intent.spec.ts`](../../../tests/unit/contexts/run/run.service-port-intent.spec.ts)、[`run.service-port-lease-registry.spec.ts`](../../../tests/unit/contexts/run/run.service-port-lease-registry.spec.ts)、[`run.local-port-allocator.spec.ts`](../../../tests/unit/contexts/run/run.local-port-allocator.spec.ts)、[`run.managed-service-launcher.spec.ts`](../../../tests/unit/contexts/run/run.managed-service-launcher.spec.ts)、[`run.terminal-workflow-application-shutdown.spec.ts`](../../../tests/unit/contexts/run/run.terminal-workflow-application-shutdown.spec.ts)、[`run.run-lifecycle-service.spec.ts`](../../../tests/unit/contexts/run/run.run-lifecycle-service.spec.ts) |
| Unit / Project      | checkout 保留运行态，以及归档、同步和移除项目的 Run lease 语义              | [`project.run-lifecycle.spec.ts`](../../../tests/unit/contexts/project/project.run-lifecycle.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Unit / Presentation | 端口表单、实际端点、回退、冲突 owner 与迟到事件                             | [`block-graph.terminal-metadata-form.presentation.spec.tsx`](../../../tests/unit/contexts/block-graph/block-graph.terminal-metadata-form.presentation.spec.tsx)、[`run.terminal-service-runtime-bar.presentation.spec.tsx`](../../../tests/unit/contexts/run/run.terminal-service-runtime-bar.presentation.spec.tsx)、[`run.terminal-service-runtime-projection.spec.ts`](../../../tests/unit/contexts/run/run.terminal-service-runtime-projection.spec.ts)                                                                                                                                                                                                                                                    |
| Integration         | 版本迁移、真实端口预留/监听、Provider 应用退出、PTY 注入和计划适配          | [`block-graph.store-versioning.spec.ts`](../../../tests/integration/contexts/block-graph/block-graph.store-versioning.spec.ts)、[`run.local-port-infrastructure.spec.ts`](../../../tests/integration/contexts/run/run.local-port-infrastructure.spec.ts)、[`run.terminal-provider-shutdown.spec.ts`](../../../tests/integration/contexts/run/run.terminal-provider-shutdown.spec.ts)、[`run.pty-terminal.spec.ts`](../../../tests/integration/contexts/run/run.pty-terminal.spec.ts)、[`run.terminal-launch-plan-adapter.spec.ts`](../../../tests/integration/contexts/run/run.terminal-launch-plan-adapter.spec.ts)                                                                                           |
| Contract            | 原子终端定义、Run IPC/事件和 MCP `0.3.1` 自描述 Schema                      | [`block-graph.resize-terminal-layout-ipc.spec.ts`](../../../tests/contract/contexts/block-graph/block-graph.resize-terminal-layout-ipc.spec.ts)、[`run.service-port-ipc.spec.ts`](../../../tests/contract/contexts/run/run.service-port-ipc.spec.ts)、[`agent.tool-protocol.spec.ts`](../../../tests/contract/contexts/agent/agent.tool-protocol.spec.ts)                                                                                                                                                                                                                                                                                                                                                      |

关键 E2E 覆盖低层测试不能单独证明的跨上下文用户目标：两个 worktree 使用同一首选端口时都能从界面成功启动并看到不同实际端点；默认工作区因另一 worktree 占用固定端口而直接“启动命令”失败后，可以切换过去停止服务，再返回默认工作区用同一“启动命令”入口成功重试。测试必须使用确定性本地服务、精确运行 identity/endpoint 事件作为完成条件，不能使用固定等待；策略边界、所有权失败和清理分支继续由低层测试证明。

## 交付进度

| 阶段                   | 状态     | 当前结果                                                                            |
| ---------------------- | -------- | ----------------------------------------------------------------------------------- |
| 1. Spec 与可行性       | 已完成   | 用户确认策略、绑定、所有权、迁移与非目标；真实端口、node-pty 注入和进程清理原型通过 |
| 2. 运行身份与生命周期  | 已完成   | 精确作用域、generation、异步 PTY 清理、Project/BlockGraph 到 Run lease 与启动校验   |
| 3. 持久化服务意图      | 已完成   | 规范端口意图、原子定义和严格快照校验                                                |
| 4. 分配与启动          | 已完成   | 回环预留、租约、环境/参数注入、有限重试，以及直接/组合/工作流统一启动               |
| 5. 所有权就绪与错误    | 已完成   | 实际端点、macOS 监听祖先校验、失败关闭、稳定错误与清理隔离                          |
| 6a. 端点与轻量冲突 UI  | 已完成   | 地址复制/安全打开、首选回退、受管 owner 定位与外部/未知安全反馈                     |
| 6b. 进程详情与停止重试 | 后续候选 | PID/进程详情、重新验证 owner 和“停止已有服务并重试”需要独立安全设计                 |
| 7. 下游引用与稳定地址  | 后续候选 | 结构化端点引用、本地域名/代理、HMR/WebSocket 和可选 HTTPS                           |
| 8. 可选容器隔离        | 后续候选 | 只为已采用容器的项目提供网络/宿主机映射适配                                         |

## 平台限制与剩余风险

- 监听所有权依赖操作系统进程表和端口表；macOS、Linux 或 Windows runner 缺失对应系统工具、权限不足或检查期间证据变化时会安全失败。
- 预留释放到项目进程监听的竞争只能通过有限重试收束，不能完全消除。
- 当前租约表只协调当前 cleancode 应用 controller；持久 Provider 拒绝第二个 controller，外部工具仍表现为操作系统外部监听者。
- POSIX 进程组清理覆盖正常受管子进程；主动脱离进程树的 daemon 不受支持，清理后监听仍存在时租约会隔离。
- 应用被操作系统强制杀死时无法运行退出清理；明确保留的会话可由已认证 live Provider 继续承载，其他会话由 Provider 在 controller 异常断开时停止。Provider 自身丢失后只恢复历史，不依据 checkpoint 中的陈旧 PID 终止任何进程。

## 成熟做法参考

- [Node.js `net` 文档](https://nodejs.org/api/net.html)：端口 `0` 由操作系统分配，并可从监听地址读取实际端口。
- [Vite Server Options](https://vite.dev/config/server-options)：默认端口可回退，`strictPort` 表达固定端口失败语义。
- [Docker Compose 网络](https://docs.docker.com/compose/how-tos/networking/)：容器网络可使用稳定服务名，宿主机端口独立映射。
- [VS Code Remote SSH 端口转发](https://code.visualstudio.com/docs/remote/ssh)：冲突时映射其他本地端口并展示最终地址。

这些参考说明成熟模式；cleancode 的 owner、失败关闭和交互语义仍以本仓库领域模型、用例和测试为准。

## 维护规则

- 改变策略、协议、注入或迁移时，同步 BlockGraph 模型、仓储、MCP Schema、测试和[积木图模型](../block-graph/block-graph.md)。
- 改变运行身份、租约、实际端点、所有权或清理时，同步 Run 模型、端口、测试、[终端会话生命周期](terminal-session.md)和[终端依赖工作流](terminal-workflow.md)。
- 改变 Project/BlockGraph 到 Run 协作时，同步[架构文档](../../engineering/architecture.md)、[上下文地图](../../engineering/context-map.md)和调用方 lifecycle 测试。
- 改变稳定交互时，同步 [UI 契约](../../product/ui-contract.md)和表现层测试；未来能力只进入 [UI 路线图](../../product/ui-roadmap.md)。
- 改变 Node、node-pty、系统进程检查或平台范围时，同步[技术栈说明](../../engineering/tech-stack.md)和真实集成测试。
- 每次更新本文后运行 `pnpm check:docs`。
