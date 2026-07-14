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
- 终端元数据、布局与执行配置。
- 终端连接。
- 终端组合及成员关系。

终端 PTY、输出、退出码、工作流节点状态和 Agent 运行时不属于本聚合。它们由 Run 或 Agent 上下文拥有。

## 终端积木规则

1. 新终端默认启动命令为空，执行模式为任务，成功退出码为 `[0]`，无超时。
2. 名称不能为空；描述和启动命令保存前去除首尾空白。
3. 尺寸不得小于领域定义的最小宽高；恢复旧数据时缺失或无效值回退到默认值。
4. viewport 坐标必须是有限数，zoom 被限制在领域允许范围内。
5. 移动或调整组合成员后，聚合重新计算相关组合边界。
6. 删除终端时同时删除关联连接，并从组合移除；不足两个成员的组合自动消失。

## 连接与执行配置

连接方向为 `source -> target`，表示 source 是 target 的上游依赖。聚合拒绝：

- 端点不存在。
- 自连接。
- 同方向重复连接。
- 会形成有向环的新连接。

任务配置拥有成功退出码与可选正整数超时；服务配置拥有输出文本或本机 TCP 端口就绪条件，以及正整数就绪超时。恢复无效配置时使用默认任务配置。

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

## 恢复与持久化

当前文件系统仓储把工作区默认图保存为 Electron 应用数据目录中的 JSON，并通过临时文件、同步和重命名原子替换。旧版项目内 `.cleancode/workspaces/.../default-graph.json` 会在读取时迁移到当前存储位置。

恢复时会规范化旧数据：补全 viewport、尺寸和执行配置；丢弃无效连接、重复连接、环、失效组合成员和重复归组。规范化是兼容输入的边界，不允许表现层自行修补聚合事实。

## 跨上下文协作

- Run 上下文拥有 `TerminalWorkflowPlanPort`，其 BlockGraph 适配器调用 `BuildTerminalWorkflowPlanUseCase` 获得 DTO；Run 不读取聚合内部状态。
- Agent 上下文拥有 `AgentBlockGraphToolPort`，其 BlockGraph 适配器把原生 MCP 工具转换为本上下文用例；Agent 不直接写 JSON 或调用聚合。
- Platform 只在 composition root 装配端口与用例，不拥有积木图规则。

完整协作关系见[上下文地图](../../engineering/context-map.md)。

## 实现入口

| 层级           | 入口                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | [`BlockGraph.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockGraph.ts)、[`BlockGraphTypes.ts`](../../../src/contexts/block-graph/domain/aggregates/BlockGraphTypes.ts)                             |
| Group rules    | [`TerminalGroupRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalGroupRules.ts)                                                                                                               |
| Workflow rules | [`TerminalWorkflowRules.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowRules.ts)、[`TerminalWorkflowPlan.ts`](../../../src/contexts/block-graph/domain/services/TerminalWorkflowPlan.ts) |
| Application    | [`BuildTerminalWorkflowPlanUseCase.ts`](../../../src/contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase.ts) 及同目录中的图变更用例                                                      |
| Persistence    | [`FileSystemBlockGraphRepository.ts`](../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository.ts)                                                                             |
| Platform       | [`blockGraphIpcHandlers.ts`](../../../src/platform/electron-main/blockGraphIpcHandlers.ts)                                                                                                                       |

## 验证矩阵

| 层级        | 证明内容                        | 主要测试                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 默认图、viewport、尺寸与元数据  | [`block-graph.default-graph.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.default-graph.spec.ts)、[`block-graph.resize-terminal-block.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.resize-terminal-block.spec.ts)                       |
| Unit        | 组合成员、边界、移动和解散      | [`block-graph.terminal-groups.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-groups.spec.ts)、[`block-graph.terminal-group-use-cases.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-group-use-cases.spec.ts)             |
| Unit        | 连接不变量、执行配置和计划      | [`block-graph.terminal-workflow.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.terminal-workflow.spec.ts)、[`block-graph.build-terminal-workflow-plan.spec.ts`](../../../tests/unit/contexts/block-graph/block-graph.build-terminal-workflow-plan.spec.ts) |
| Integration | JSON 原子保存、恢复与旧路径迁移 | [`block-graph.filesystem-repository.spec.ts`](../../../tests/integration/contexts/block-graph/block-graph.filesystem-repository.spec.ts)                                                                                                                                   |
| Contract    | Electron IPC 的图布局契约       | [`block-graph.resize-terminal-layout-ipc.spec.ts`](../../../tests/contract/contexts/block-graph/block-graph.resize-terminal-layout-ipc.spec.ts)                                                                                                                            |

## 维护规则

新增积木类型、组合类型或连接语义时，必须先更新领域类型、聚合不变量、恢复策略、用例、测试和本文。未来方向只能进入 [UI 路线图](../../product/ui-roadmap.md)，不得预先写成当前 BlockGraph 能力。
