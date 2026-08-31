# 积木图模型

## 文档地位

本文是当前已实现 BlockGraph 上下文的统一维护入口，描述图身份、终端积木、终端组合、连接、布局、模板快照、持久化与跨上下文协作。

终端、流程、顶层执行单元和组合的定义以[画布语义契约](../../product/canvas-semantic-contract.md)为唯一事实来源；终端工作流的运行语义见[终端依赖工作流](../run/terminal-workflow.md)；按钮与批量动作语义见[积木动作模型](block-action-model.md)。

## 能力状态与范围

当前 `BlockGraph` 只包含：

- 一个工作区默认图及其画布 viewport。
- `terminal` 积木的名称、描述、启动命令、执行配置、位置和尺寸。
- 终端之间的有向依赖连接。
- `terminal-group` 类型化组合及其名称、位置、尺寸、折叠状态和成员。
- 当前工作区固定编号 `1` 至 `5` 的快捷执行位及其终端、流程或组合引用。
- 独立于工作区图的终端、流程和组合模板快照，以及把模板实例化到目标图的规则。

Agent 控制台不是 BlockGraph 积木；跨终端、完整流程、终端组合与 Agent 的视觉堆叠由独立 [CanvasArrangement 上下文](../canvas-arrangement/canvas-arrangement.md)拥有。Preview、HTTP、测试、文件节点、会改变成员或执行语义的通用分组以及插件积木尚未实现。

## 身份与事实所有权

`BlockGraph` 是本上下文唯一聚合根。图通过稳定的 `projectId + workspaceId` 归属物理工作区，当前每个工作区只维护一个默认图。Git 分支、目录和显示名不参与图身份。

所有画布对象共享由 Shared Kernel 定义的规范身份：

`projectId + workspaceId + objectKind + objectId`

其中 `objectKind` 当前包括 `terminal`、`terminal-group` 和 `agent`。React Flow 的本地 node ID、显示名、目录和分支都是投影或元数据，不能替代该身份，也不能进入持久化 owner key。

聚合拥有以下已提交事实：

- viewport。
- 终端元数据、布局与执行配置；服务执行配置中的端口策略、协议和注入方式属于持久化意图。
- 终端连接。
- 终端组合及成员关系。
- 五个快捷执行位的绑定；运行中、忙碌和执行结果不进入聚合。

终端 PTY、输出、退出码、工作流节点状态、端口租约、实际端点和 Agent 运行时不属于本聚合。它们由 Run 或 Agent 上下文拥有。

## 终端积木规则

1. 新终端默认启动命令为空，执行模式为任务，成功退出码为 `[0]`，无超时。
2. 名称不能为空；描述和启动命令保存前去除首尾空白。
3. 尺寸不得小于领域定义的最小宽高；恢复旧数据时缺失或无效值回退到默认值。
4. viewport 坐标必须是有限数，zoom 被限制在领域允许范围内。
5. 移动或调整组合成员后，聚合重新计算相关组合边界；成员加入或移出时保持既有组合锚点。
6. 删除单个终端或一组精确终端时同时删除关联连接，并从组合移除；空组合继续保留。
7. 名称、描述、启动命令和执行配置通过 `UpdateTerminalDefinitionUseCase` 在一个图事务中原子更新；任一字段无效时不保存部分定义。
8. 删除单个终端、完整流程或组合成员在保存图变更前通过 BlockGraph 拥有的 `TerminalRunLifecyclePort`，以一个精确终端集合租约阻止并硬清理对应 Run 作用域；保存成功 resolve，清理已确认但保存失败 release，清理不确定时 quarantine。

## 连接与执行配置

连接方向为 `source -> target`，表示 source 是 target 的上游依赖。聚合拒绝：

- 端点不存在。
- 自连接。
- 同方向重复连接。
- 会形成有向环的新连接。

任务配置拥有成功退出码与可选正整数超时；服务配置拥有输出文本或本机 TCP 监听就绪条件，以及正整数就绪超时。服务还可以声明一份端口意图：

- `fixed(port)`：必须使用指定端口；冲突不回退。
- `preferred(port)`：优先使用指定端口，允许 Run 自动回退。
- `auto`：由 Run 在每次启动时动态分配。
- 协议为 `http`、`https` 或 `tcp`。
- 注入为 `none`、`environment(variableName)` 或 `argument(template)`；`none` 只允许搭配 `fixed`，`preferred` 和 `auto` 必须显式声明环境变量或参数注入。
- 参数模板必须恰好包含一个 `{port}`，且只允许安全参数字符；环境变量名称必须合法且不能占用 cleancode 保留前缀。

TCP 就绪必须配置端口意图；输出就绪可以不管理端口。新终端仍默认为任务配置，不从启动命令或框架名称猜测端口；实际分配端口绝不写回 BlockGraph。

BlockGraph 负责连接和配置的结构事实，也负责按“全图”“指定终端及其后代”或“精确终端组合成员”生成不可变、拓扑有序的终端工作流计划；运行状态仍由 Run 上下文的 `WorkflowRun` 拥有。组合作用域只保留连接两端都属于该组合的内部依赖，不沿跨组合连接扩大动作范围。

## 终端组合规则

`TerminalGroup` 是类型化组合，不是工作流节点或任意视觉分组：

1. 组合是可持久存在的独立容器，可以为空、只包含一个独立终端或一条完整流程，也可以包含多个执行单元；组合不能嵌套组合。
2. 成员 ID 去重；一个终端同一时间最多属于一个组合。
3. 创建组合、加入或移出成员时，每个请求成员都通过共享契约扩展为所在完整流程；多个请求流程取并集，无依赖终端保持独立成员。扩展、成员占用校验、顶层单元校验和组合提交必须原子完成，不能保存半条流程。
4. 上述扩展只属于创建和成员调整动作；普通终端选择不扩展，已有组合建立后的连线编辑也不自动重写成员。
5. 组合位置是成员调整的固定空间锚点。成员加入时，聚合以该锚点为原点，把组合内独立终端和完整流程作为排版单元确定性排列；流程内部按依赖层布局，多个单元平衡换行。组合尺寸由排版结果与固定留白计算，但不得根据释放坐标移动组合。
6. 移动组合会按位移量整体移动全部成员，再重新计算边界。
7. 移除完整执行单元后组合继续存在，包括最后一个成员移出后的空组合。
8. 解散组合只删除组合，保留所有终端积木。
9. 折叠只改变组合的已提交显示状态，不改变成员或工作流连接。
10. 组合可以同时包含无内部依赖的独立终端和一个或多个互不相连的依赖子图；这些分类由启动时计划派生，不新增持久化流程实体或流程 ID。
11. 启动组合前必须先为全部成员生成并校验一个不可变计划；缺少启动命令或存在环时整体拒绝，不能先启动部分成员。
12. 移除组合删除组合及其全部成员终端；它不同于只删除组合关系并保留成员的解散动作。提交前必须要求组合身份及观察到的成员集合仍与权威图完全一致。
13. Agent 创建空组合且没有显式位置时，应用层必须注入当前工作区全部 Agent 的权威区域；BlockGraph 把这些区域、顶层终端和已有组合外框一起作为障碍，为默认组合尺寸选择确定性空位。显式位置继续原样采用。
14. Agent 调整组合成员时，加入和转移必须以目标组合锚点完成排版，再用最终完整组合外框检查 Agent、外部顶层终端和外部组合；移出必须用全部被移动流程终端检查新位置。任一冲突都在同一图事务内整体拒绝，不能移动组合锚点或只检查代表终端。

## 快捷执行位

快捷执行位是当前工作区图的持久化引用，不是新的运行入口或执行实体：

1. 每个图恰好包含按顺序编号 `1` 至 `5` 的五个位置；每个位置为空，或绑定一个终端、流程、组合。
2. 终端引用保存一个独立终端 ID。流程引用保存绑定时完整弱连通分量的精确终端 ID 集合，不引入流程 ID。组合引用保存稳定组合 ID，并在执行时使用该组合当前成员。
3. 新绑定必须通过统一画布语义校验：流程中任意终端解析为完整流程；单个终端只有在独立时才能按终端绑定；组合必须仍存在。三个 UI 入口不得分别构造不同引用。
4. 普通新增不接收位置编号，必须在同一图事务内绑定到编号最小的空位；五格都已占用时以 `QUICK_EXECUTION_BAR_FULL` 拒绝，不能覆盖已有绑定。已知位置上的重新绑定仍显式替换该位置。
5. 拖动排序在同一图事务内交换来源与目标位置的绑定，目标为空时等价于把来源移动到该固定编号；其余位置保持不变。
6. 删除终端、编辑依赖或解散组合不会静默清空位置。恢复允许保留失效引用，由表现层显示为不可用并允许用户清空或重新绑定。
7. 流程绑定只在当前弱连通成员集合与保存集合完全一致时可执行；增加、删除或改接成员都会使旧绑定不可用。组合绑定继续按组合 ID 跟随当前成员。
8. 名称不是引用身份；终端或组合重命名后，表现层从当前图实时投影新名称。
9. BlockGraph 只拥有绑定事实。终端、流程与组合执行分别复用既有单终端启动、精确流程作用域和组合启动入口，运行状态继续由 Run 拥有。

## 确定性终端布局

BlockGraph 当前支持对精确终端作用域执行确定性布局。该能力只移动请求中的终端及完整包含它们的终端组合，不移动 Agent，也不把无关画布对象吸收到作用域内：

1. 先按内部依赖的弱连通分量识别执行单元：一个依赖工作流保持为同一空间单元，完全独立的终端分别成为单元。单元内部按最长上游路径从左到右分层，同层终端按稳定顺序纵向排列；较短依赖层相对最高层垂直居中，避免下游节点机械顶对齐。
2. 多个执行单元使用每个终端的真实尺寸和固定 `64` 画布单位间距，以各段执行单元的实际宽度作为候选行宽并稳定换行，从中选择接近横向 `2.4:1` 的紧凑排布；因此较小的独立终端可以共享一行，较宽的依赖工作流可以独占下一行，不会因固定列数被机械堆成过高外框。已连接工作流不会被无关终端插入依赖层；完整组合仍按派生外框形成避障视觉单元，与未组合终端及其他目标组合保留同等间距。
3. 内部排布完成后，把本次精确作用域的完整外接轮廓作为一个整体放入现有画布内容附近。作用域外顶层终端、作用域外组合和应用层注入的 `canvasRegions` 都是不可穿越的矩形区域；候选位置可以位于内容的上、下、左、右或空隙中，依次按不碰撞、画布外接面积扩张、周长扩张、距内容区域距离和稳定坐标顺序选择。避障只能平移完整结果，不能逐个推移并拆散已经排好的空间关系。
4. 一个组合只要有成员进入作用域，就必须包含全部成员；部分组合、空作用域和未知终端会在修改前整体拒绝。
5. 聚合一次替换全部目标位置，再统一重算组合边界；相同图和相同输入重复执行必须得到相同位置，并以 `graphChanged: false` 表达无变化。
6. 应用用例在进入写事务前记录目标位置基线。若某个终端在布局提交前已经被用户移动，该终端不再参与本次布局；组合内任一成员被移动时保留整个组合。其余未变化目标仍可继续排列。

`CreateTerminalBlockUseCase` 同样遵守该策略：显式 `position` 原样使用；省略位置时必须提供当前外部画布区域，并在创建终端的同一事务中自动落位。启动命令、尺寸、创建和自动落位作为一个提交完成。用户从主画布显式新建终端时，Presentation 必须通过跨终端、组合与 Agent 的统一创建协调策略提交显式 `position`；省略位置加 `canvasRegions` 只服务 Agent 画布工具的确定性终端布局语义，不是用户界面创建失败时的备用落位公式。

`CreateTerminalWorkflowUseCase` 是 Agent 完整新建路径的原子边界。一个命令用调用内 `ref` 提供全部终端定义、完整执行配置、内部依赖和可选组合，并由 Agent 应用层提供当前工作区全部 Agent 的 `canvasRegions`；同一默认图事务依次完成引用校验、创建、配置、连接、组合、确定性布局和工作流计划校验。任一输入、组合资格、依赖、配置、布局或计划失败都不得提交部分终端或连接。成功结果返回精确的新终端、连接、可选组合身份、实际排列作用域和已验证计划；既有细粒度用例继续承担已有图对象的增量编辑。

`CreateTerminalGroupUseCase` 为 Agent 省略位置的空组合复用顶层避障策略；`MoveTerminalWorkflowToGroupUseCase` 在成员变化和自动排版之后验证最终组合或完整移出流程的真实区域。两者只有在应用层提供 `canvasRegions` 时启用这层 MCP 外部对象保护，主画布手势继续由 Presentation 提交用户已经确认的显式空间操作。

## 模板快照与实例化

收藏在领域中是不可变快照模板，不是对原工作区对象的引用，也不引入具有稳定身份的持久化流程实体。`BlockTemplateLibrary` 是 BlockGraph 上下文拥有的应用级模板库，和任一工作区的 `BlockGraph` JSON 分开持久化：

1. 模板类型由共享画布语义契约分析选中终端和两端都在选择范围内的连接：单终端生成终端模板，单个完整弱连通分量生成流程模板，两个或以上顶层执行单元生成组合模板。
2. 快照只保存终端名称、描述、启动命令、执行配置、尺寸、相对位置、内部依赖连接和模板元数据。组合模板同时保存作为新组合名称的模板名称。
3. 快照不保存 PTY、输出、退出结果、工作流运行状态、端口租约、实际端点、Agent、Agent 对话、画布 viewport 或历史记录。
4. 保存前先完整校验终端配置、内部引用和无环依赖；无效模板整体拒绝，不产生部分库记录。
5. 实例化先完整校验模板，再为全部终端、连接和可选组合生成新身份，并在目标图的单次仓储事务中提交。任一部分失败时不保存半套图结构。
6. 项目模板以稳定 `projectId` 为作用域；全局模板可以实例化到任意当前项目。项目从登记簿暂时移除不会删除其模板。
7. 实例化结果返回精确执行作用域：终端与流程模板使用新终端集合，组合模板使用新组合。后续运行仍交给统一工作流计划生成与 Run 调度器。

## 恢复与持久化

当前文件系统仓储按 `projectId + workspaceId` 把工作区默认图保存为 Electron 当前状态根中的版本 `4` JSON，并通过临时文件、同步和重命名原子替换。项目目录不是应用状态 owner，仓储不会读取项目内 `.cleancode/workspaces/.../default-graph.json`。

应用级模板库使用独立的版本 `1` JSON，并采用相同的临时文件、同步和重命名原子替换。模板库不进入工作区图文件；移动项目/全局作用域只修改模板库记录，不修改来源图或已经插入的实例。

默认图初始化和所有图变更在同一个工作区级进程内队列中执行完整读取—修改—写入事务。初始化是幂等的：当前图已经存在时返回仓储权威快照，不用空图覆盖；事务回调完成后才生成并持久化快照，异步失败不得落盘，后续事务仍可继续。表现层没有保存任意完整图快照的 IPC 后门。

当前互斥边界位于单个 Electron 主进程内；仓储尚未提供跨多个应用进程的文件锁。所有当前产品写入口必须经同一主进程和应用用例进入该事务边界。

仓储写入版本 `4`，并兼容读取版本 `2`、`3` 与 `4` 的规范快照。读取版本 `2` 时在内存中补齐五个空快捷位；读取版本 `3` 时按当前连接作用域规则规范化旧组合成员关系；两者都不因读取本身回写文件，下一次真实图事务随其他变更写为版本 `4`。版本 `3` 与 `4` 必须包含顺序固定的五个位置，允许其中引用已经失效的对象。无版本、版本 `1`、未知版本、缺少必填字段，以及快捷位目标、执行配置、就绪条件或端口意图等规范嵌套结构中的多余/缺失字段，必须以稳定错误拒绝，不能静默修复或回写；当前解析器不会仅因 envelope、图或终端记录存在额外外层字段而拒绝快照。

恢复仍会规范化兼容范围内的 viewport、尺寸、连接和组合：丢弃无效连接、重复连接、环、失效组合成员、重复归组和半流程成员关系；空组合和只包含一个完整执行单元的组合继续保留。规范化只移除无效成员关系并保留终端、连接和合法组合容器，是兼容输入的边界；表现层不得自行修补聚合事实。

## 跨上下文协作

- Run 上下文拥有 `TerminalWorkflowPlanPort`，其 BlockGraph 适配器调用 `BuildTerminalWorkflowPlanUseCase` 获得单流程或组合作用域 DTO；Run 不读取聚合内部状态。
- Run 上下文拥有 `TerminalLaunchPlanPort`，其 BlockGraph 适配器调用 `GetTerminalLaunchPlanUseCase` 获得单终端不可变启动计划；直接启动和组合启动不从表现层拼接命令或端口配置。
- 普通终端节点由 App Shell 组合 BlockGraph 定义与 Run runtime。BlockGraph snapshot 只在 adapter 中提供当前终端显示名和 block-scoped 动作绑定；Run 的 `TerminalRuntimeViewport` 不接收 BlockGraph snapshot，也不拥有节点、位置、尺寸或定义事实。
- BlockGraph 拥有 `TerminalRunLifecyclePort`，删除单个终端、完整流程或组合时由 Platform 把一个精确终端集合适配到 Run 的公开 lifecycle 服务；BlockGraph 不读取或操作 Run 内部进程和租约。
- Agent 上下文拥有 `AgentBlockGraphToolPort`，其 BlockGraph 适配器把原生 MCP 工具转换为本上下文用例；Agent 不直接写 JSON 或调用聚合。
- CanvasArrangement 只引用 BlockGraph DTO 中的规范终端、完整流程与终端组合身份；对象位置、依赖、组合成员和模板仍由 BlockGraph 拥有。
- Platform 只在 composition root 装配端口与用例，不拥有积木图规则。

完整协作关系见[上下文地图](../../engineering/context-map.md)。

## 实现入口

| 层级            | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain          | [`BlockGraph.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockGraph.ts)、[`BlockGraphTypes.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockGraphTypes.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Shared semantic | [`CanvasExecutionSemantics.ts`](../../../src/shared-kernel/domain/policies/CanvasExecutionSemantics.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Templates       | [`BlockTemplateTypes.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockTemplateTypes.ts)、[`BlockTemplateLibrary.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockTemplateLibrary.ts)、[`BlockTemplateProjection.ts`](../../../src/contexts/block-graph/domain/services/BlockTemplateProjection.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Group rules     | [`TerminalGroupRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalGroupRules.ts)、[`QuickExecutionSlotRules.ts`](../../../src/contexts/block-graph/domain/services/QuickExecutionSlotRules.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Layout rules    | [`TerminalLayoutPolicy.ts`](../../../src/contexts/block-graph/domain/services/TerminalLayoutPolicy.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Workflow rules  | [`TerminalWorkflowRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowRules.ts)、[`TerminalWorkflowPlan.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowPlan.ts)、[`TerminalDefinitionRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalDefinitionRules.ts)、[`TerminalRemovalRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalRemovalRules.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Application     | [`ArrangeTerminalLayoutUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/ArrangeTerminalLayoutUseCase.ts)、[`GetTerminalLaunchPlanUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/GetTerminalLaunchPlanUseCase.ts)、[`BuildTerminalWorkflowPlanUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase.ts)、[`DeleteTerminalScopeUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/DeleteTerminalScopeUseCase.ts)、[`AddQuickExecutionTargetUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/AddQuickExecutionTargetUseCase.ts)、[`BindQuickExecutionSlotUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/BindQuickExecutionSlotUseCase.ts)、[`ClearQuickExecutionSlotUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/ClearQuickExecutionSlotUseCase.ts)、[`ReorderQuickExecutionSlotsUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/ReorderQuickExecutionSlotsUseCase.ts)、[`SaveBlockTemplateUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/SaveBlockTemplateUseCase.ts)、[`InstantiateBlockTemplateUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase.ts) |
| Persistence     | [`BlockGraphStore.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/BlockGraphStore.ts)、[`FileSystemBlockGraphRepository.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository.ts)、[`BlockTemplateStore.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/BlockTemplateStore.ts)、[`FileSystemBlockTemplateRepository.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockTemplateRepository.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Platform        | [`blockGraphIpcHandlers.ts`](../../../src/platform/electron-main/blockGraphIpcHandlers.ts)、[`blockGraphDeleteTerminalScopeIpcCommand.ts`](../../../src/platform/electron-main/blockGraphDeleteTerminalScopeIpcCommand.ts)、[`blockTemplateIpcHandlers.ts`](../../../src/platform/electron-main/blockTemplateIpcHandlers.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 验证矩阵

| 层级        | 证明内容                                                             | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 默认图、viewport、尺寸与元数据                                       | [`block-graph.default-graph.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.default-graph.spec.ts)、[`block-graph.resize-terminal-block.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.resize-terminal-block.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Unit        | 终端、流程、顶层执行单元与组合统一分类                               | [`canvas-execution-semantics.spec.ts`](../../../tests/unit/shared-kernel/canvas-execution-semantics.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Unit        | 五个快捷位、自动占位、拖动交换、规范引用与失效保留                   | [`block-graph.quick-execution-slots.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.quick-execution-slots.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Unit        | 组合成员、边界、移动和解散                                           | [`block-graph.terminal-groups.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-groups.spec.ts)、[`block-graph.terminal-group-use-cases.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-group-use-cases.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Unit        | 确定性布局、平衡执行单元排布、自动创建和拖动优先                     | [`block-graph.arrange-terminal-layout.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.arrange-terminal-layout.spec.ts)、[`block-graph.balanced-terminal-layout.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.balanced-terminal-layout.spec.ts)、[`block-graph.arrange-terminal-layout-use-case.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.arrange-terminal-layout-use-case.spec.ts)、[`block-graph.create-terminal-block-layout.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.create-terminal-block-layout.spec.ts)、[`block-graph.create-terminal-workflow.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.create-terminal-workflow.spec.ts)                                                                                                                                                                                                                                     |
| Unit        | 连接、端口意图、单终端/完整工作流原子定义、启动/工作流计划和删除清理 | [`block-graph.create-terminal-workflow.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.create-terminal-workflow.spec.ts)、[`block-graph.terminal-workflow.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-workflow.spec.ts)、[`block-graph.service-port-intent.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.service-port-intent.spec.ts)、[`block-graph.update-terminal-definition.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.update-terminal-definition.spec.ts)、[`block-graph.get-terminal-launch-plan.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.get-terminal-launch-plan.spec.ts)、[`block-graph.delete-terminal-lifecycle.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.delete-terminal-lifecycle.spec.ts)、[`block-graph.delete-terminal-scope.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.delete-terminal-scope.spec.ts) |
| Unit        | 模板识别、内部连接、相对布局、身份重映射和作用域隔离                 | [`block-graph.block-template-projection.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.block-template-projection.spec.ts)、[`block-graph.block-template-instantiation.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.block-template-instantiation.spec.ts)、[`block-graph.block-template-library.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.block-template-library.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Integration | 初始化、RMW、回滚、v2/v3→v4 兼容读取与旧路径隔离                     | [`block-graph.filesystem-repository.spec.ts`](../../../tests/integration/contexts/block-graph/block-graph.filesystem-repository.spec.ts)、[`block-graph.store-versioning.spec.ts`](../../../tests/integration/contexts/block-graph/block-graph.store-versioning.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Integration | 模板库 v1、原子替换和项目/全局隔离                                   | [`block-template-repository.spec.ts`](../../../tests/integration/contexts/block-graph/block-template-repository.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Contract    | Electron IPC 的图布局、原子终端定义与批量移除契约                    | [`block-graph.resize-terminal-layout-ipc.spec.ts`](../../../tests/contract/contexts/block-graph/block-graph.resize-terminal-layout-ipc.spec.ts)、[`block-graph.delete-terminal-scope-ipc.spec.ts`](../../../tests/contract/contexts/block-graph/block-graph.delete-terminal-scope-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Contract    | 模板库管理与原子实例化 IPC                                           | [`block-template-ipc.spec.ts`](../../../tests/contract/contexts/block-graph/block-template-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 维护规则

新增积木类型、组合类型或连接语义时，必须先更新领域类型、聚合不变量、恢复策略、用例、测试和本文。未来方向只能进入 [UI 路线图](../../product/ui-roadmap.md)，不得预先写成当前 BlockGraph 能力。
