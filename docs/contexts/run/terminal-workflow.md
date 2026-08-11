# 终端依赖工作流

## 文档地位

本文是当前已实现“终端依赖工作流”能力的统一维护入口，集中描述统一语言、上下文协作、状态所有权、执行语义、实现入口和验证矩阵。

本文不重新定义全仓架构和 UI 总则：

- 限界上下文、依赖方向和事实来源以[架构文档](../../engineering/architecture.md)为准。
- 用户可见的稳定交互以[UI 契约](../../product/ui-contract.md)为准。
- 积木动作的功能意图和作用对象以[积木动作模型](../block-graph/block-action-model.md)为准。
- 测试层级和组织以[测试规范](../../testing/testing.md)为准。

代码和自动化测试是当前可执行行为的最终证据。本文与实现不一致时，必须先确认目标语义，再在同一任务中同步领域模型、用例、测试和本文。

## 能力状态与范围

终端依赖工作流已经实现。当前只编排 `Terminal` 积木；终端组合可以提供精确成员作用域，但组合本身、Codex Agent 控制台和未来其他积木类型都不是工作流节点。

当前能力包括：

- 保存终端之间的有向依赖连接。
- 从指定终端运行该终端及其全部后代。
- 从终端组合生成一个成员精确的不可变计划，并在同一次运行中并行推进独立终端和互不依赖的流程子图。
- 按任务退出码或服务就绪条件判断上游是否可以放行下游。
- 对声明端口意图的服务分配实际回环端口、注入启动命令并验证监听所有权。
- 支持并行根节点、汇合等待、失败传播、超时和停止。
- 在终端节点、连线和应用通知中投影工作流状态与活动期控制。

当前不包括：

- 在节点之间自动传递标准输出、文件或结构化产物。
- 把 Agent、Preview、HTTP 请求或终端组合本身作为流程节点。
- 持久化或恢复一次正在进行的运行实例。
- 分布式执行、远程主机和跨项目工作流。

## 统一语言

| 术语       | 含义                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| 终端依赖   | 一条从上游终端指向下游终端的有向连接                                                     |
| 上游       | 必须先成功或就绪的终端                                                                   |
| 下游       | 等待全部直接上游满足条件后才可运行的终端                                                 |
| 工作流范围 | 本次计划包含的终端集合；当前 UI 使用“指定终端及其后代”“精确组合成员”或“精确模板实例成员” |
| 任务       | 通过真实进程退出码判断完成结果的有限命令                                                 |
| 服务       | 达到输出文本或 TCP 端口条件后视为就绪、并继续保持运行的命令                              |
| 就绪       | 服务已经满足依赖条件，可以放行下游，但进程仍在运行                                       |
| 实际端点   | Run 为本次服务确认的协议、回环主机和端口；可随每次运行变化                               |
| 阻塞       | 由于某个上游失败而不会再运行                                                             |
| 停止       | 用户停止活动工作流后，运行中、就绪或尚未开始的节点进入的终止结果                         |

## 上下文边界

终端依赖工作流跨越 BlockGraph 与 Run，但运行生命周期由 Run 上下文拥有。

| 责任                               | Owner                | 稳定协作方式                                    |
| ---------------------------------- | -------------------- | ----------------------------------------------- |
| 终端、执行配置、端口意图和有向连接 | `BlockGraph` 聚合    | BlockGraph 应用层用例和持久化仓储               |
| 自连接、重复连接和环校验           | BlockGraph 领域规则  | 聚合根与领域服务                                |
| 从图生成不可变执行计划             | BlockGraph 领域服务  | `TerminalWorkflowPlanPort` 返回 DTO             |
| 当前运行状态和状态迁移             | Run 的 `WorkflowRun` | Run 领域模型                                    |
| 调度、超时、就绪和停止协调         | Run 应用层           | `TerminalWorkflowService`                       |
| PTY 命令执行与进程停止             | Run 基础设施         | `TerminalWorkflowRuntimePort`                   |
| 端口租约、注入和实际端点           | Run 应用层/领域层    | `ManagedServiceLauncher`                        |
| TCP 就绪与监听所有权               | Run 基础设施         | `TcpReadinessPort`、`TcpListenerInspectionPort` |
| IPC 注册和依赖装配                 | Platform             | Electron main/preload 契约                      |
| 节点、连线和状态反馈               | Presentation         | 订阅运行事件形成派生视图                        |

Run 不得直接读取或修改 `BlockGraph` 聚合。它只能通过 `TerminalWorkflowPlanPort` 获取启动时生成的不可变计划；计划中的后续运行状态不反写为图结构事实。

## 状态所有权与持久化

以下内容随工作区持久化：

- 终端启动命令。
- 任务或服务执行配置，包括服务端口策略、协议和注入方式。
- 终端之间的依赖连接。
- 终端组合及成员关系；终端、流程和组合的结构定义由[画布语义契约](../../product/canvas-semantic-contract.md)统一，Run 只在启动时从已提交精确成员计划派生可并行的独立终端与流程子图。

以下内容只存在于当前应用进程：

- 活动 `WorkflowRun`。
- 节点的等待、运行、就绪、成功、失败、阻塞和停止状态。
- 工作流命令 PTY、计时器、TCP 探测和输出匹配缓冲。
- 端口预留、租约、实际端点、监听者所有权结果和有限重试状态。

活动运行以项目 ID/目录、工作区名称/目录和 Git 分支作为权威作用域，并继续以“项目目录 + 工作区名称”索引当前活动工作流。同一项目的同一工作区同时只保留一个活动运行；不同项目即使都使用 `main` 工作区，也必须独立启动、查询和停止，不能互相替换或消费对方的运行事件。每个节点 PTY 还使用完整 `sessionId + runId + generation` 隔离迟到事件。

表现层中的节点徽标、连线颜色和应用通知都是运行快照的派生投影，不是新的事实来源。通知关闭不得改变工作流、节点状态或终端输出，也不得隐式触发停止。应用重启后恢复连接和执行配置，但不恢复上一次活动工作流或通知。

普通终端的退出保留不扩大到 `WorkflowRun` 或 Agent 会话。`workflow` kind 与 agent-owned session 都没有跨应用保留资格；应用正常退出和 Electron main 异常断开时，Provider 都会停止其命令 PTY。持久化恢复存储发现工作流 checkpoint 时删除而不 revive。即使某个普通终端 PTY 能 warm attach，应用也不得据此重建调度器、节点状态、就绪结果、端口租约或活动通知，更不得显示为已经恢复的工作流。

## 图与计划规则

依赖方向使用 `source -> target`：source 是上游，target 是下游。

BlockGraph 必须保持：

1. 连接两端都是当前图中的终端。
2. 不允许终端连接自己。
3. 不允许同一对终端存在重复方向连接。
4. 不允许新增连接后形成有向环。
5. 删除终端时同时删除关联连接。
6. 连接、执行配置和终端元数据通过聚合根修改并一起保存。

生成计划时：

- “从此处运行流程”只包含起点和从该起点可达的后代。
- “启动组合命令”只包含该组合成员，并只保留连接两端都在组合内的依赖；无内部依赖的成员成为并行根，不同连通子图可以并行推进。
- 组合成员在创建组合或加入终端时已经按完整弱连通流程扩展；运行计划只读取已提交的精确成员，不在启动时再次沿后来新增的跨组合连接扩大范围。
- 终端或流程模板实例使用本次新建终端的精确集合，并只保留集合内部依赖；组合模板实例使用本次新建组合的精确成员作用域。两种范围都不能沿模板之外的连接扩散。
- 计划内每个终端都必须配置启动命令，缺失时拒绝启动。
- 计划按稳定拓扑顺序排列，并保存每个节点的直接依赖 ID。
- 正常连接入口和计划生成入口都必须拒绝环；组合作用域必须在任何成员 PTY 启动前完成整组校验。
- 工作流启动后使用该不可变计划；运行中的图编辑不改变已经启动的计划。

## 执行模式

### 任务

任务适合安装依赖、构建、测试、生成文件等会自行退出的命令。

- 使用独立命令 PTY 执行，不解析 shell 提示符。
- 真实退出码出现在 `successExitCodes` 中时成功。
- 退出码不在允许集合、无法取得退出码或启动失败时失败。
- `timeoutMs` 非空时，超时会终止任务并标记失败。
- 任务结束后保留原命令会话及其已产生的输出，不自动创建空交互式 shell；只有用户显式执行“重开空终端”或其他 replacement 动作时才替换会话。

默认配置是任务模式、成功退出码 `[0]`、不设置超时。

### 服务

服务适合开发服务器、数据库代理和 watcher 等持续运行命令。

- 输出就绪：PTY 输出按字面量包含配置文本时就绪。
- TCP 就绪：Run 为本次运行分配的实际端点可连接，并且监听者经所有权检查证明属于本次受管 PTY 时就绪。
- 服务在就绪后继续运行；“就绪”不是进程结束。
- 服务在用户停止工作流前意外退出时失败。
- 未在 `readinessTimeoutMs` 内就绪时失败并停止。

输出匹配不是正则表达式，也不解析 shell 提示符。带端口意图的输出就绪服务仍必须同时确认实际端点监听及所有权，避免旧监听者让输出匹配放行错误服务。TCP 探测只面向 `127.0.0.1`；TCP 就绪必须有端口意图，未声明端口的输出就绪服务继续作为非受管服务运行。

端口意图支持 `fixed`、`preferred`、`auto`，以及 `none`、环境变量、参数后缀注入。工作流不复制分配规则，而是与直接启动、组合批量启动共同调用 Run 的 `ManagedServiceLauncher`；完整规则见[本地服务端口治理](service-port-management.md)。

## 调度与状态迁移

工作流节点初始为 `waiting`。

```txt
waiting
  -> running
      -> succeeded   (任务成功退出)
      -> ready       (服务满足就绪条件)
      -> failed      (启动、退出码、超时或就绪失败)
      -> stopped     (用户停止)
  -> blocked         (任一上游失败或已阻塞)
  -> stopped         (尚未运行时用户停止)
```

调度规则：

1. 没有上游的根节点可以并行启动。
2. 下游等待全部直接上游进入 `succeeded` 或 `ready`。
3. 汇合节点不会因为其中一个上游先完成而提前启动。
4. 上游失败只阻塞其后代；互不依赖的分支继续运行。
5. 服务就绪可以放行下游，同时让整体工作流保持活动状态。

工作流聚合状态：

- 存在 `running` 或 `waiting` 节点时为运行中。
- 没有等待/运行节点但仍有就绪服务时为就绪。
- 存在失败节点且没有仍可推进的节点时为失败。
- 全部任务成功且没有活动服务时为成功。
- 用户请求停止且所有活动节点已停止时为已停止。

## 启动与停止

同一项目的同一工作区同一时间只保留一个活动工作流。启动新工作流时，Run 应用服务先停止该复合作用域已有工作流，再生成并运行新计划；其他项目的同名工作区不受影响。

当前 UI 可以从终端节点的“从此处运行流程”、组合的“启动组合命令”、模板库的“放置并运行”或工作区快捷执行键位发起，不提供空闲态全局运行按钮。快捷执行栏本身只展示映射，点击格子不得启动；`Command/Ctrl + 1` 至 `5` 才把 BlockGraph 拥有的对象引用交给既有入口。流程按绑定时精确成员调用既有 `block-set` 作用域，组合按组合 ID 调用既有组合入口，快捷执行不拥有或复制计划、调度与运行状态。普通“启动命令”只运行当前终端，不触发依赖级联。组合启动通过一次工作流请求提交成员作用域，表现层不得逐成员直接启动；同一组合中的独立根和不同流程可以并行，但每条流程仍按直接依赖推进。模板运行必须使用实例化返回的精确作用域，不能重新从模板快照拼装或复制调度规则。

停止时：

1. 禁止继续调度新的等待节点。
2. 尚未启动的等待节点标记为停止。
3. 按逆拓扑顺序停止运行中或已就绪的 PTY。
4. 清理任务超时、服务就绪超时和 TCP 探测。
5. 对受管服务等待 PTY 退出和监听关闭，释放或隔离端口租约。
6. 租约释放确认后保留原工作流会话及已有终端输出，并把会话标记为已结束；不自动创建空交互式会话。

受管节点的 PTY 退出与端口清理完成是两个事件：界面在监听关闭前保持 `releasing`，只有 `released` 才清除实际端点；清理无法确认时显示 `quarantined`。同端口后续节点或直接启动会按精确旧租约有界等待，并继续遵守隔离恢复的操作系统 reservation 证明。

工作流活动期间，右上角活动通知提供“停止本次运行”，本次计划的根终端也将“从此处运行流程”切换为同名兜底动作；顶部工具栏不展示工作流状态或停止动作。“停止本次运行”精确停止当前工作区的活动 `WorkflowRun`，包括计划中尚未开始以及已经运行或就绪的全部节点，不影响同画布无关的独立终端命令、其他工作区或其他项目。单个终端的“停止当前命令”只中断该终端当前 PTY，两者是不同作用范围的动作。

应用退出不是上述用户显式停止，也不是物理工作区归档/移除、删除终端或移除项目触发的 Run 硬清理。默认工作区分支 checkout 不触发硬清理。应用退出使用两阶段交接：

1. `TerminalWorkflowService` 与 `ManagedServiceLauncher` 先关闭新工作流/服务准入，abort 节点计时器、就绪等待和仍在激活的受管启动，并排空退出前已经接纳的启动。
2. 该阶段不逐个调用 `stop` 或 `terminateProcess`，不等待每个监听关闭，也不把终端交还为交互式 shell。Run 通过一次 application detach 把 PTY 停止职责交给持久 Provider；Provider 按权威会话快照停止所有 workflow/Agent 和默认退出策略会话。
3. Electron 的 complete 阶段只移除当前 main 进程中的活动运行、节点 guard、lifecycle 注册、managed terminator、易失端口租约和 endpoint 引用。它不把租约状态伪造为 `released`，也不发布“监听已关闭”的结论；实际端口是在 Provider 终止进程后由操作系统关闭。

显式“停止本次运行”、`stopAll` 和 Project/BlockGraph 发起的硬生命周期仍沿用原有逐作用域停止、监听关闭确认以及 `released`/`quarantined` 收束语义，不走应用退出的轻量交接路径。

## 失败与用户反馈

以下失败必须具有稳定错误码或运行失败原因：

- 计划内终端缺少启动命令。
- 图或终端不存在。
- 自连接、重复连接或形成环。
- 同一连接不存在却请求删除。
- 命令 PTY 启动失败。
- 任务退出码不符合成功条件。
- 任务或服务超时。
- 服务就绪前意外退出。
- 固定端口冲突或有限分配耗尽。
- 实际监听者不属于本次 PTY，或当前平台无法证明所有权。
- 终止后监听未关闭，端口租约进入隔离。

上游失败后，下游显示阻塞而不是伪装成未运行。连线和节点可以辅助展示状态，但颜色不得成为唯一信息载体。

工作流开始后，表现层按运行 ID 创建一条可关闭的活动通知，展示起点、精确终端数量和“停止本次运行”，并在运行、服务就绪、成功、失败或已停止之间原地更新。所有工作流状态都复用应用通知的唯一固定宽高两行卡片：第一行显示状态，第二行显示起点与终端数量或失败摘要。停止动作使用独立停止图标进入卡片最右侧控制轨，位于关闭按钮之前，默认不显示背景或边框，只在悬停、聚焦或进行中投影必要反馈，并始终保留完整 Tooltip 与可访问名称。成功和已停止可以短暂显示后自动关闭；失败默认保留，通过错误语义色与图标区分，并使用失败终端名称和结构化退出码生成稳定用户文案，不直接展示未经映射的底层异常文本。同一次运行的终态重复更新以及工作区切换后重新加载的同一终态快照不得重复通知。用户主动关闭活动通知不得停止运行，后续普通状态不得重新打开它；返回仍在活动的工作区时必须恢复活动通知和停止入口，如果该运行随后失败或在离开期间首次失败，必须重新弹出一次错误通知。连接、配置、启动或停止流程等用户动作失败时同样进入应用通知，不在顶部工具栏中常驻显示错误。关闭通知只移除临时反馈，失败节点、阻塞后代、连线状态和终端输出继续保留。

## 实现入口

| 层级                   | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BlockGraph domain      | [`TerminalWorkflowRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowRules.ts)、[`TerminalWorkflowPlan.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowPlan.ts)                                                                                                                                                                                                                                                                                                        |
| BlockGraph application | [`BuildTerminalWorkflowPlanUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase.ts) 及连接/断开/配置用例                                                                                                                                                                                                                                                                                                                                                               |
| Run domain             | [`WorkflowRun.ts`](../../../src/contexts/run/domain/aggregates/WorkflowRun.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Run application        | [`TerminalWorkflowService.ts`](../../../src/contexts/run/application/use-cases/TerminalWorkflowService.ts)、[`TerminalWorkflowApplicationShutdown.ts`](../../../src/contexts/run/application/services/TerminalWorkflowApplicationShutdown.ts)、[`ManagedServiceLauncher.ts`](../../../src/contexts/run/application/services/ManagedServiceLauncher.ts)、[`ManagedServiceApplicationShutdown.ts`](../../../src/contexts/run/application/services/ManagedServiceApplicationShutdown.ts) 和 `TerminalWorkflow*Port`        |
| Run infrastructure     | [`TerminalSessionWorkflowRuntimeAdapter.ts`](../../../src/contexts/run/infrastructure/pty/TerminalSessionWorkflowRuntimeAdapter.ts)、[`TerminalProviderShutdownCoordinator.ts`](../../../src/contexts/run/infrastructure/provider/TerminalProviderShutdownCoordinator.ts)、[`NodeTcpReadinessAdapter.ts`](../../../src/contexts/run/infrastructure/readiness/NodeTcpReadinessAdapter.ts)、[`NodeTcpListenerInspectionAdapter.ts`](../../../src/contexts/run/infrastructure/network/NodeTcpListenerInspectionAdapter.ts) |
| Platform               | [`applicationRuntimeShutdown.ts`](../../../src/platform/electron-main/applicationRuntimeShutdown.ts)、[`terminalWorkflowIpcHandlers.ts`](../../../src/platform/electron-main/terminalWorkflowIpcHandlers.ts) 与 preload                                                                                                                                                                                                                                                                                                 |
| Presentation           | [`useTerminalWorkflow.ts`](../../../src/presentation/app-shell/useTerminalWorkflow.ts)、[`useTerminalWorkflowNotifications.ts`](../../../src/presentation/app-shell/useTerminalWorkflowNotifications.ts)、[`terminalWorkflowNotifications.ts`](../../../src/presentation/app-shell/terminalWorkflowNotifications.ts)、[`terminalWorkflowEdges.ts`](../../../src/presentation/app-shell/terminalWorkflowEdges.ts)、终端节点与通知                                                                                        |

## 验证矩阵

低层测试证明规则和状态，高层测试只证明真实跨边界主路径：

| 层级                | 证明内容                                                                       | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / BlockGraph   | 连接不变量、计划范围、拓扑和配置                                               | [`block-graph.terminal-workflow.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-workflow.spec.ts)、[`block-graph.build-terminal-workflow-plan.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.build-terminal-workflow-plan.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Unit / Run          | 状态迁移、并行、汇合、失败传播、显式停止、应用退出交接、实际端点和受管服务就绪 | [`run.workflow-run.spec.ts`](../../../tests/unit/contexts/run/run.workflow-run.spec.ts)、[`run.terminal-workflow-service.spec.ts`](../../../tests/unit/contexts/run/run.terminal-workflow-service.spec.ts)、[`run.terminal-workflow-application-shutdown.spec.ts`](../../../tests/unit/contexts/run/run.terminal-workflow-application-shutdown.spec.ts)、[`run.managed-service-launcher.spec.ts`](../../../tests/unit/contexts/run/run.managed-service-launcher.spec.ts)、[`run.service-port-lease-registry.spec.ts`](../../../tests/unit/contexts/run/run.service-port-lease-registry.spec.ts)                                                                                                                                                                                                         |
| Unit / Presentation | 表单解析、快捷执行路由、事件投影、通知生命周期、停止入口和连线                 | [`terminal-metadata-workflow-config.spec.tsx`](../../../tests/unit/presentation/terminal-metadata-workflow-config.spec.tsx)、[`quick-execution-targets.spec.ts`](../../../tests/unit/presentation/quick-execution-targets.spec.ts)、[`app-notifications.spec.tsx`](../../../tests/unit/presentation/app-notifications.spec.tsx)、[`terminal-workflow-notifications.spec.ts`](../../../tests/unit/presentation/terminal-workflow-notifications.spec.ts)、[`terminal-workflow.notification-publishing.spec.tsx`](../../../tests/unit/presentation/terminal-workflow.notification-publishing.spec.tsx)、[`terminal-workflow-edges.spec.ts`](../../../tests/unit/presentation/terminal-workflow-edges.spec.ts)、[`terminal-tooltips.spec.tsx`](../../../tests/unit/presentation/terminal-tooltips.spec.tsx) |
| Integration         | 真实 PTY、端口基础设施、Provider 应用退出、计划适配器和工作流协作              | [`run.terminal-workflow.spec.ts`](../../../tests/integration/contexts/run/run.terminal-workflow.spec.ts)、[`run.terminal-provider-shutdown.spec.ts`](../../../tests/integration/contexts/run/run.terminal-provider-shutdown.spec.ts)、[`run.pty-terminal.spec.ts`](../../../tests/integration/contexts/run/run.pty-terminal.spec.ts)、[`run.local-port-infrastructure.spec.ts`](../../../tests/integration/contexts/run/run.local-port-infrastructure.spec.ts)                                                                                                                                                                                                                                                                                                                                          |
| Contract            | Electron IPC、精确运行身份、实际端点和事件契约                                 | [`run.terminal-workflow-ipc.spec.ts`](../../../tests/contract/contexts/run/run.terminal-workflow-ipc.spec.ts)、[`run.service-port-ipc.spec.ts`](../../../tests/contract/contexts/run/run.service-port-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| E2E                 | 用户连接流程并运行；快捷绑定跨重开恢复并复用终端执行                           | [`terminal-workflows.e2e.spec.ts`](../../../tests/e2e/terminal-workflows.e2e.spec.ts)、[`run-terminal-sessions.e2e.spec.ts`](../../../tests/e2e/run-terminal-sessions.e2e.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

手工验收至少覆盖：

1. 上游任务成功后下游才启动。
2. 上游失败时下游阻塞。
3. 服务输出或端口就绪后下游启动，而服务保持运行。
4. 活动通知和根终端的“停止本次运行”都只停止当前工作区的活动运行，提交期间不可重复触发，停止后不再启动新节点。
5. 重启应用后连接和执行配置恢复，旧运行状态不恢复。
6. 活动通知在运行、就绪和终态之间原地更新；关闭活动通知不停止流程，普通更新不重开，后续失败会重新提示。
7. 工作流失败后右上角只出现一条可关闭通知，关闭后节点、连线和终端输出仍保留失败证据。

## 维护规则

修改终端依赖工作流时按 owner 同步文档：

- 改变上下文边界、事实来源或依赖方向：更新架构文档和本文。
- 改变状态迁移、调度、任务/服务或停止语义：更新本文与 Run/BlockGraph 行为测试。
- 改变用户可见入口、状态或文案的不变量：更新 UI 契约、本文和表现层测试。
- 改变动作作用对象：更新积木动作模型。
- 改变 PTY、TCP、IPC 或技术选择：更新技术栈、对应集成/契约测试；涉及渲染几何时再更新终端渲染排障指南。

不得只更新本文而不更新实现和测试，也不得把未来跨类型工作流写成当前能力；未实现方向应进入 UI 路线图或后续独立 Spec。
