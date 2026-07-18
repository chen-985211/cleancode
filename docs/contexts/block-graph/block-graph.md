# 积木图模型

## 文档地位

本文是当前已实现 BlockGraph 上下文的统一维护入口，描述图身份、终端积木、终端组合、连接、布局、持久化与跨上下文协作。

终端工作流的运行语义见[终端依赖工作流](../run/terminal-workflow.md)；按钮与批量动作语义见[积木动作模型](block-action-model.md)。

## 能力状态与范围

当前 `BlockGraph` 只包含：

- 一个工作区默认图及其画布 viewport。
- `terminal` 积木的名称、描述、启动命令、执行配置、位置和尺寸。
- 终端之间的有向依赖连接。
- `terminal-group` 类型化组合及其名称、位置、尺寸、折叠状态和成员。

Agent 控制台不是 BlockGraph 积木；Preview、HTTP、测试、文件节点、通用视觉分组和插件积木尚未实现。

## 身份与事实所有权

`BlockGraph` 是本上下文唯一聚合根。图通过 `projectId + workspaceName` 归属工作区，当前每个工作区只维护一个默认图。

聚合拥有以下已提交事实：

- viewport。
- 终端元数据、布局与执行配置；服务执行配置中的端口策略、协议和注入方式属于持久化意图。
- 终端连接。
- 终端组合及成员关系。

终端 PTY、输出、退出码、工作流节点状态、端口租约、实际端点和 Agent 运行时不属于本聚合。它们由 Run 或 Agent 上下文拥有。

## 终端积木规则

1. 新终端默认启动命令为空，执行模式为任务，成功退出码为 `[0]`，无超时。
2. 名称不能为空；描述和启动命令保存前去除首尾空白。
3. 尺寸不得小于领域定义的最小宽高；恢复旧数据时缺失或无效值回退到默认值。
4. viewport 坐标必须是有限数，zoom 被限制在领域允许范围内。
5. 移动或调整组合成员后，聚合重新计算相关组合边界。
6. 删除终端时同时删除关联连接，并从组合移除；不足两个成员的组合自动消失。
7. 名称、描述、启动命令和执行配置通过 `UpdateTerminalDefinitionUseCase` 在一个图事务中原子更新；任一字段无效时不保存部分定义。
8. 删除终端在保存图变更前通过 BlockGraph 拥有的 `TerminalRunLifecyclePort` 阻止并硬清理该终端的 Run 作用域；保存成功 resolve，清理已确认但保存失败 release，清理不确定时 quarantine。

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

BlockGraph 负责连接和配置的结构事实，也负责生成不可变、拓扑有序的终端工作流计划；运行状态仍由 Run 上下文的 `WorkflowRun` 拥有。

## 终端组合规则

`TerminalGroup` 是类型化组合，不是工作流节点或任意视觉分组：

1. 创建时至少包含两个现有终端。
2. 成员 ID 去重；一个终端同一时间最多属于一个组合。
3. 组合边界由成员位置、尺寸与固定留白计算，而不是独立自由缩放事实。
4. 移动组合会按位移量整体移动全部成员，再重新计算边界。
5. 移除成员后少于两个成员，组合自动解散。
6. 解散组合只删除组合，保留所有终端积木。
7. 折叠只改变组合的已提交显示状态，不改变成员或工作流连接。

## 确定性终端布局

BlockGraph 当前支持对精确终端作用域执行确定性布局。该能力只移动请求中的终端及完整包含它们的终端组合，不移动 Agent，也不把无关画布对象吸收到作用域内：

1. 依赖层级按最长上游路径计算，层级从左到右排列；同层终端先按既有 `y/x/id` 形成顺序。跨层组合把各层顺序收束为全局视觉单元顺序；顺序冲突先按强连通分量与稳定单元 ID 破环，再用临时总序归一化各层真实顺序并求最终拓扑序，使一次排列后的结果再次执行不再漂移。
2. 布局使用每个终端的真实尺寸和固定 `64` 画布单位间距，不假设所有终端等大；完整组合按派生外框形成视觉单元，与未组合终端及其他目标组合也必须保留该间距，不能只排列成员后让外框互相覆盖。视觉单元按最终全序依次放置；横向相交的后序单元不得回填到被障碍下推的前序单元上方。
3. 首选原点位于 `anchorRegion` 下方；作用域外终端、作用域外组合、anchor 和 `reservedRegions` 都是不可穿越的矩形障碍。
4. 一个组合只要有成员进入作用域，就必须包含全部成员；部分组合、空作用域和未知终端会在修改前整体拒绝。
5. 聚合一次替换全部目标位置，再统一重算组合边界；相同图和相同输入重复执行必须得到相同位置，并以 `graphChanged: false` 表达无变化。
6. 应用用例在进入写事务前记录目标位置基线。若某个终端在布局提交前已经被用户移动，该终端不再参与本次布局；组合内任一成员被移动时保留整个组合。其余未变化目标仍可继续排列。

`CreateTerminalBlockUseCase` 同样遵守该策略：显式 `position` 原样使用；省略位置时必须提供 anchor，并在创建终端的同一事务中自动落位。启动命令、尺寸、创建和自动落位作为一个提交完成。

## 恢复与持久化

当前文件系统仓储把工作区默认图保存为 Electron 应用数据目录中的版本 `1` JSON，并通过临时文件、同步和重命名原子替换。旧版项目内 `.cleancode/workspaces/.../default-graph.json` 会在读取时迁移到当前存储位置。

默认图初始化和所有图变更在同一个工作区级进程内队列中执行完整读取—修改—写入事务。初始化是幂等的：当前图或旧路径图已经存在时返回仓储权威快照，不用空图覆盖；事务回调完成后才生成并持久化快照，异步失败不得落盘，后续事务仍可继续。表现层没有保存任意完整图快照的 IPC 后门。

当前互斥边界位于单个 Electron 主进程内；仓储尚未提供跨多个应用进程的文件锁。所有当前产品写入口必须经同一主进程和应用用例进入该事务边界。

无版本旧快照在读取时确定性迁移：旧 TCP 就绪端口转为 `fixed + none + tcp`，旧输出就绪服务保持无端口意图，缺失执行配置的旧终端继续采用默认任务配置。迁移成功后立即按版本 `1` 原子回写。版本 `1` 必须具有规范的执行配置；未知版本、畸形端口意图或多余/缺失字段必须以稳定错误拒绝，不能静默变成任务。

恢复仍会规范化兼容范围内的 viewport、尺寸、连接和组合：丢弃无效连接、重复连接、环、失效组合成员和重复归组。规范化是兼容输入的边界，不允许表现层自行修补聚合事实。

## 跨上下文协作

- Run 上下文拥有 `TerminalWorkflowPlanPort`，其 BlockGraph 适配器调用 `BuildTerminalWorkflowPlanUseCase` 获得 DTO；Run 不读取聚合内部状态。
- Run 上下文拥有 `TerminalLaunchPlanPort`，其 BlockGraph 适配器调用 `GetTerminalLaunchPlanUseCase` 获得单终端不可变启动计划；直接启动和组合启动不从表现层拼接命令或端口配置。
- BlockGraph 拥有 `TerminalRunLifecyclePort`，删除终端时由 Platform 适配到 Run 的公开 lifecycle 服务；BlockGraph 不读取或操作 Run 内部进程和租约。
- Agent 上下文拥有 `AgentBlockGraphToolPort`，其 BlockGraph 适配器把原生 MCP 工具转换为本上下文用例；Agent 不直接写 JSON 或调用聚合。
- Platform 只在 composition root 装配端口与用例，不拥有积木图规则。

完整协作关系见[上下文地图](../../engineering/context-map.md)。

## 实现入口

| 层级           | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain         | [`BlockGraph.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockGraph.ts)、[`BlockGraphTypes.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockGraphTypes.ts)                                                                                                                                                                                                                                                                                                                                                 |
| Group rules    | [`TerminalGroupRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalGroupRules.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Layout rules   | [`TerminalLayoutPolicy.ts`](../../../src/contexts/block-graph/domain/services/TerminalLayoutPolicy.ts)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Workflow rules | [`TerminalWorkflowRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowRules.ts)、[`TerminalWorkflowPlan.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowPlan.ts)、[`TerminalDefinitionRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalDefinitionRules.ts)                                                                                                                                                                                                       |
| Application    | [`ArrangeTerminalLayoutUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/ArrangeTerminalLayoutUseCase.ts)、[`GetTerminalLaunchPlanUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/GetTerminalLaunchPlanUseCase.ts)、[`BuildTerminalWorkflowPlanUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase.ts)、[`UpdateTerminalDefinitionUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/UpdateTerminalDefinitionUseCase.ts) |
| Persistence    | [`BlockGraphStore.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/BlockGraphStore.ts)、[`FileSystemBlockGraphRepository.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository.ts)                                                                                                                                                                                                                                                                                         |
| Platform       | [`blockGraphIpcHandlers.ts`](../../../src/platform/electron-main/blockGraphIpcHandlers.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 验证矩阵

| 层级        | 证明内容                                            | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 默认图、viewport、尺寸与元数据                      | [`block-graph.default-graph.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.default-graph.spec.ts)、[`block-graph.resize-terminal-block.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.resize-terminal-block.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Unit        | 组合成员、边界、移动和解散                          | [`block-graph.terminal-groups.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-groups.spec.ts)、[`block-graph.terminal-group-use-cases.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-group-use-cases.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Unit        | 确定性布局、自动创建和拖动优先                      | [`block-graph.arrange-terminal-layout.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.arrange-terminal-layout.spec.ts)、[`block-graph.arrange-terminal-layout-use-case.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.arrange-terminal-layout-use-case.spec.ts)、[`block-graph.create-terminal-block-layout.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.create-terminal-block-layout.spec.ts)                                                                                                                                                                                                                                           |
| Unit        | 连接、端口意图、原子定义、启动/工作流计划和删除清理 | [`block-graph.terminal-workflow.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-workflow.spec.ts)、[`block-graph.service-port-intent.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.service-port-intent.spec.ts)、[`block-graph.update-terminal-definition.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.update-terminal-definition.spec.ts)、[`block-graph.get-terminal-launch-plan.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.get-terminal-launch-plan.spec.ts)、[`block-graph.delete-terminal-lifecycle.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.delete-terminal-lifecycle.spec.ts) |
| Integration | 初始化、RMW、回滚、版本迁移与旧路径迁移             | [`block-graph.filesystem-repository.spec.ts`](../../../tests/integration/contexts/block-graph/block-graph.filesystem-repository.spec.ts)、[`block-graph.store-versioning.spec.ts`](../../../tests/integration/contexts/block-graph/block-graph.store-versioning.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Contract    | Electron IPC 的图布局与原子终端定义契约             | [`block-graph.resize-terminal-layout-ipc.spec.ts`](../../../tests/contract/contexts/block-graph/block-graph.resize-terminal-layout-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 维护规则

新增积木类型、组合类型或连接语义时，必须先更新领域类型、聚合不变量、恢复策略、用例、测试和本文。未来方向只能进入 [UI 路线图](../../product/ui-roadmap.md)，不得预先写成当前 BlockGraph 能力。
