# 上下文地图

## 文档地位

本文记录 cleancode 当前已实现限界上下文、事实 owner 和跨上下文协作契约。架构原则与依赖规则仍以[架构文档](architecture.md)为唯一事实来源；本文只把当前代码中的协作关系集中可视化。

## 当前上下文

| 上下文            | 状态   | 核心聚合                                          | 拥有的事实                                                                    |
| ----------------- | ------ | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Project           | 已实现 | `Project`、`ProjectRegistry`                      | 项目目录、稳定工作区身份、类型/目录/显示名/Git 绑定、当前工作区、最近项目目录 |
| BlockGraph        | 已实现 | `BlockGraph`、`BlockTemplateLibrary`              | 终端积木、组合、布局、执行配置、依赖连接和应用级模板快照                      |
| CanvasArrangement | 已实现 | `CanvasArrangement`                               | 跨类型画布对象的视觉堆叠身份、有序成员与锚点                                  |
| Run               | 已实现 | `TerminalSession`、`ForegroundJob`、`WorkflowRun` | 类型化终端 owner、PTY/模型/视图、前台任务、端口、工作流和节点状态             |
| Agent             | 已实现 | `AgentSession`                                    | Agent 身份、固定 Provider、session ref、launch/activity、MCP、审批和审计      |
| Plugin            | 规划中 | 尚无                                              | 尚未形成当前领域模型、用例或持久化事实                                        |

`src/platform` 是最外层 composition root 与 Electron 适配层，不是限界上下文。`src/presentation` 负责跨上下文应用外壳与派生视图，也不拥有领域事实。

## 当前协作总览

```txt
Project application
  -> WorkspaceAgentLifecyclePort
  -> Platform adapter
  -> AgentSessionService lifecycle leases

Project application
  -> WorkspaceRunLifecyclePort
  -> Platform adapter
  -> RunLifecycleService lifecycle leases

BlockGraph application
  -> TerminalRunLifecyclePort
  -> Platform adapter
  -> RunLifecycleService lifecycle leases

Agent application
  -> AgentRuntimeScopeValidationPort
  -> Platform adapter
  -> ValidateProjectWorkspaceScopeUseCase

Agent application
  -> AgentTerminalRuntimePort
  -> RunAgentTerminalRuntimeAdapter
  -> Run TerminalSessionService / ForegroundJob

Run application
  -> TerminalLaunchEnvironmentPreparationPort
  -> Platform adapter
  -> Agent ordinary-terminal launch decoration

Run application
  -> RunRuntimeScopeValidationPort
  -> Platform adapter
  -> ValidateProjectWorkspaceScopeUseCase

Run application
  -> TerminalLaunchPlanPort / TerminalWorkflowPlanPort
  -> BlockGraph adapters
  -> GetTerminalLaunchPlanUseCase / BuildTerminalWorkflowPlanUseCase

Presentation
  -> BlockGraph template use cases
  -> instantiate exact graph scope
  -> Run TerminalWorkflowService (only for place-and-run)

Presentation canvas arrangement action
  -> BlockGraph / Agent layout use cases
  -> CanvasArrangement stack use cases

Platform workbench restore
  -> BlockGraph / Agent snapshot adapter
  -> ReconcileCanvasArrangementUseCase

Agent application
  -> AgentBlockGraphToolPort
  -> BlockGraphAgentToolAdapter
  -> BlockGraph application use cases
```

端口由需要外部能力的调用方上下文拥有；适配器负责把该稳定契约连接到提供方公开的应用层用例。Platform 只装配对象，不重新定义业务规则。

模板库虽然是应用级持久化数据，领域事实仍由 BlockGraph 上下文拥有。Platform 只提供独立 JSON 仓储和 IPC 装配；Presentation 只投影选择、放置与管理交互。Run 不读取模板，只接收模板实例化后由 BlockGraph 生成的既有工作流计划。

CanvasArrangement 只引用 BlockGraph 与 Agent 已公开 DTO 中的稳定对象身份，不读取两侧聚合或仓储。用户提交堆叠、展开、网格或整体拖动时，Presentation 先通过各 owner 的应用入口提交对象位置，再通过 CanvasArrangement 用例提交或移除视觉堆叠关系；部分失败执行补偿并只保留 owner 已提交事实。工作台恢复时，Platform 把当前 BlockGraph 与 Agent DTO 投影为仍有效的规范对象键，CanvasArrangement 在自己的事务中清理失效引用和不足两个成员的堆叠。详细规则见[画布视觉整理](../contexts/canvas-arrangement/canvas-arrangement.md)。

## Project 到 Agent：工作区所有权变更

| 项目             | 说明                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发起方           | Project                                                                                                                                                                                                                            |
| 调用方拥有的端口 | `WorkspaceAgentLifecyclePort`                                                                                                                                                                                                      |
| 提供方           | Agent 的 `AgentSessionService`                                                                                                                                                                                                     |
| 触发条件         | 物理 worktree 归档/移除、目录重绑定或从登记簿移除项目                                                                                                                                                                              |
| 契约             | Project 写用例按目录串行，登记簿 RMW 另行全局串行；归档在 Agent 排空后复查工作树；以 release/resolve/quarantine 结束 lease；仅权威 Git 检查成功后同步并 resolve；失败时恢复旧作用域。默认工作区分支 checkout 不触发 Agent 生命周期 |
| 禁止             | Project 直接读取 Agent 聚合、PTY 映射或 thread 仓储                                                                                                                                                                                |

详细语义见[项目与分支工作区生命周期](../contexts/project/workspace-lifecycle.md)和 [Agent 与会话生命周期](../contexts/agent/agent-session.md)。

## Project 到 Run：工作区运行资源变更

| 项目             | 说明                                                                                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发起方           | Project                                                                                                                                                                                                                                                                                                               |
| 调用方拥有的端口 | `WorkspaceRunLifecyclePort`                                                                                                                                                                                                                                                                                           |
| 提供方           | Run 的 `RunLifecycleService`                                                                                                                                                                                                                                                                                          |
| 触发条件         | worktree 归档、移除项目，以及权威 Git 同步发现物理工作区已消失或同一 `workspaceId` 的目录变化；分支或显示名变化不触发                                                                                                                                                                                                 |
| 契约             | 先阻止匹配作用域的新启动，再等待在途启动并硬清理 PTY、探测器和端口租约；一次 Git 同步涉及多个工作区时通过 `disposeWorkspaces` 共用一个项目级 lease，同时按 workspace key 独立保留 quarantine；Project 持有 release/resolve/quarantine lease 直至外部状态与持久化提交收束；后续权威同步或重新打开项目可解除 quarantine |
| 禁止             | Project 直接读取 Run 会话表、进程、租约或实际端点                                                                                                                                                                                                                                                                     |

应用退出由 Platform 触发 Run 的全局硬清理，不经过 Project 聚合；这只是 composition root 的资源释放，不产生新的项目事实。

## BlockGraph 到 Run：终端删除清理

| 项目             | 说明                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 发起方           | BlockGraph                                                                                                                                             |
| 调用方拥有的端口 | `TerminalRunLifecyclePort`                                                                                                                             |
| 提供方           | Run 的 `RunLifecycleService`                                                                                                                           |
| 触发条件         | 删除单个终端积木、完整流程或终端组合                                                                                                                   |
| 契约             | 图校验通过后，删除提交前用一个租约阻止并硬清理该项目/工作区的精确终端集合；保存成功 resolve，清理已确认但保存失败 release，清理结果不确定时 quarantine |
| 禁止             | BlockGraph 直接停止 PTY、释放端口租约或读取 Run 内部状态                                                                                               |

## Agent 到 Project：创建与运行时作用域有效性

| 项目             | 说明                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 发起方           | Agent                                                                                                                                                                          |
| 调用方拥有的端口 | `AgentWorkspaceCreationScopePort`、`AgentRuntimeScopeValidationPort`                                                                                                           |
| 提供方           | Project 的 `ValidateProjectWorkspaceScopeUseCase`                                                                                                                              |
| 触发条件         | 保存新 Agent；每次附加，以及挂起恢复、MCP 重配等任何 Agent PTY 启动                                                                                                            |
| 契约             | 项目仍被记住，项目 ID、稳定 `workspaceId` 和物理目录匹配；Git 分支只作为 launch 元数据；创建校验与 Project 写操作共享项目事务；运行时校验由 Platform 同时确认 Agent 定义仍存在 |
| 禁止             | Agent 直接读取 Project/ProjectRegistry 聚合或仓储                                                                                                                              |

该校验是 lifecycle lease 的提交后防线：即使旧 renderer 命令在 lease resolve 后才抵达，已删除 Agent、已归档物理工作区或已遗忘项目也不能重新启动 Agent terminal 或 Provider launch。默认工作区分支变化不会产生新的 Agent 作用域。

## Agent 到 Run：Agent terminal 与前台任务

| 项目             | 说明                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 发起方           | Agent                                                                                                                  |
| 调用方拥有的端口 | `AgentTerminalRuntimePort`                                                                                             |
| 提供方           | Run 的 `TerminalSessionService`、类型化 agent owner、共享终端模型/视图和 `ForegroundJob`                               |
| 适配器           | Agent infrastructure 的 `RunAgentTerminalRuntimeAdapter`                                                               |
| 契约             | Agent 传入稳定 owner 和结构化 Provider launch plan；Run 返回 terminal/view identity 和权威前台任务事件                 |
| Agent 所有权     | 固定 Provider、session ref、launch generation、activity、MCP、审批与审计                                               |
| Run 所有权       | PTY、shell、`sessionId + runId + generation`、输出 sequence、snapshot、view lease、ForegroundJob started/exit          |
| 禁止             | Run 导入 Agent 聚合或 Provider 类型；Agent 访问 Run 会话表/PTY map；agent owner 参与 BlockGraph 工作流、组合或端口治理 |

Provider CLI 退出只结束 Agent launch，不能被解释为 `TerminalSession` 退出。Agent 删除、挂起和项目生命周期清理通过该端口终止 terminal；普通键盘输入和原始 `Ctrl+C` 仍由 Run 写入当前 PTY。

## Run 到 Agent：普通终端 launch decoration

| 项目             | 说明                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发起方           | Run                                                                                                                                                                                                                                                         |
| 调用方拥有的端口 | `TerminalLaunchEnvironmentPreparationPort`                                                                                                                                                                                                                  |
| 提供方           | Agent 的 `TerminalAgentActivityEnvironmentService`                                                                                                                                                                                                          |
| 适配器           | Platform 的 `TerminalAgentActivityIntegrationAdapter`                                                                                                                                                                                                       |
| 触发条件         | 用户创建明确启用 Agent activity integration 的普通终端 generation                                                                                                                                                                                           |
| 契约             | Run 传入完整 terminal scope 与固定 `terminalSourceTheme`；Agent 返回稳定 command shim 环境和可选 provider-neutral private output-control descriptor。Run 只在理解该 descriptor 时原子注入私有环境，并在输出进入权威模型前消费匹配 token 的显式 control span |
| Agent 所有权     | CLI launch spec、shim、Hook、activity invocation，以及 Codex 是否需要 Win32 console-theme probe 的声明                                                                                                                                                      |
| Run 所有权       | `terminalSourceTheme`、PTY、Console bridge 的激活、输出 gate、权威模型、持久化和 view 广播                                                                                                                                                                  |
| 禁止             | Run 按 Provider ID 分支；Agent 读取或解析 PTY 输出；Agent 取得 xterm palette 或模型所有权；普通 PowerShell bootstrap 全局固定 ConsoleColor；把随机 token、环境变量或终端输出写入诊断日志                                                                    |

该协作把“哪个 CLI 需要宿主 probe”与“如何安全提供宿主 probe”分开：当前只有 Windows Codex launch spec 声明该能力，Run gate 只理解版本化 transport descriptor，不理解 Codex 或 activity。descriptor 的私有环境不并入公开 process environment；旧 Terminal Provider 或旧 NodePty adapter 忽略未知字段时不会触发 shim setter，因此保持安全降级而不是产生未过滤的 ConPTY SGR。shim 只发送显式技术控制帧，不从 Provider 正文推断 activity；绝对路径或绕过稳定 `PATH` shim 的命令继续诚实降级。

## Run 到 Project：终端运行作用域有效性

| 项目             | 说明                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 发起方           | Run                                                                                                                      |
| 调用方拥有的端口 | `RunRuntimeScopeValidationPort`                                                                                          |
| 提供方           | Project 的 `ValidateProjectWorkspaceScopeUseCase`                                                                        |
| 触发条件         | 每次普通终端、直接启动命令和工作流节点 PTY 启动                                                                          |
| 契约             | 项目仍被记住，项目 ID、项目目录、稳定 `workspaceId` 和物理目录匹配；Git 分支不参与身份校验；失败统一为 `RUN_SCOPE_STALE` |
| 禁止             | Run 直接读取 Project/ProjectRegistry 聚合或仓储                                                                          |

该校验与 `RunLifecycleService` 启动闸门共同防止迟到的 renderer 命令在物理工作区归档、删除终端或移除项目后复活旧作用域；默认工作区 checkout 继续使用原作用域。

## Run 到 BlockGraph：终端启动与工作流计划

| 项目             | 说明                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| 发起方           | Run                                                                              |
| 调用方拥有的端口 | `TerminalLaunchPlanPort`、`TerminalWorkflowPlanPort`                             |
| 提供方           | BlockGraph 的 `GetTerminalLaunchPlanUseCase`、`BuildTerminalWorkflowPlanUseCase` |
| 返回             | 单终端、指定依赖子图或精确终端组合启动时不可变的命令、执行配置与拓扑计划 DTO     |
| 后续所有权       | Run 的 `WorkflowRun` 独立维护运行状态，不反写 BlockGraph                         |
| 禁止             | Run 直接读取 BlockGraph 仓储、聚合或表现层图对象                                 |

端口策略和注入方式随计划从 BlockGraph 进入 Run；实际端口、租约、监听者检查和运行事件只由 Run 拥有。详细语义见[积木图模型](../contexts/block-graph/block-graph.md)、[终端依赖工作流](../contexts/run/terminal-workflow.md)和[本地服务端口治理](../contexts/run/service-port-management.md)。

## Agent 到 BlockGraph：原生 MCP 工具

| 项目              | 说明                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发起方            | Agent                                                                                                                                                      |
| 调用方拥有的端口  | `AgentBlockGraphToolPort`                                                                                                                                  |
| 提供方            | BlockGraph 的图查询/变更、执行配置、连接、确定性布局和计划构建用例                                                                                         |
| Agent 所有权      | 工具协议、会话鉴权、审批、调用状态、同工作区 MCP 串行、审计，以及稳定 Agent 身份与布局                                                                     |
| BlockGraph 所有权 | 图结构、执行配置、依赖规则、布局策略、计划校验、事务变更和持久化                                                                                           |
| 协作契约          | Agent 应用层把当前工作区全部 Agent 的已保存布局注入为无优先级 `canvasRegions`；模型输入不得提供或伪造这些身份事实，BlockGraph 再与图内顶层对象共同决定空位 |
| 禁止              | MCP/JSON-RPC 适配器直接写图 JSON、调用聚合、决定布局规则或修改 React 状态                                                                                  |

详细语义见 [cleancode 原生 MCP](../contexts/agent/cleancode-mcp.md)。

## 非跨上下文关系

- Presentation 调用应用层用例、订阅 IPC 事件并形成派生视图，不是上下文之间的数据后门。
- Platform 注册 IPC、创建仓储和适配器、连接端口，不拥有 Project、BlockGraph、Run 或 Agent 业务状态。
- Shared Kernel 只容纳稳定且确实被多个上下文共同使用的错误/契约；当前由它拥有规范画布对象身份 `projectId + workspaceId + objectKind + objectId`，以及供 BlockGraph、模板、Presentation 和 Agent 指引共同消费的纯[画布执行语义契约](../product/canvas-semantic-contract.md)。前者构造 owner key，后者只分析完整流程、顶层执行单元与组合资格；两者都不拥有 BlockGraph 状态，也不得被用于规避应用层端口边界。分支、目录和显示名不得进入规范身份。
- JSON 文件、PTY、Git CLI、HTTP Server、Codex、Claude Code 和 OpenCode CLI 都是基础设施细节，不是新的限界上下文。

## 规划中的 Plugin

Plugin 目前只有产品与架构方向，没有 `src/contexts/plugin` 实现、聚合、用例、端口或持久化格式。未来开始实现前必须先通过独立 Spec 明确：

- 插件声明与已安装实例的聚合边界。
- 插件可以贡献哪些积木类型、动作和运行器。
- 能力授权、版本兼容、迁移与失败隔离。
- Plugin 与 BlockGraph、Run、Agent 的端口归属。

在这些内容实现并由测试保护前，任何文档不得把 Plugin 写成当前可用能力。

## 维护规则

新增跨上下文调用时，必须在同一任务中：

1. 明确发起方、事实 owner 和调用方拥有的应用层端口。
2. 让适配器只调用提供方公开用例，不暴露聚合或仓储。
3. 在 Platform composition root 完成装配。
4. 增加低层规则测试和必要的契约/集成测试。
5. 更新本文与相关上下文专文。
