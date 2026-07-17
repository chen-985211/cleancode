# 上下文地图

## 文档地位

本文记录 cleancode 当前已实现限界上下文、事实 owner 和跨上下文协作契约。架构原则与依赖规则仍以[架构文档](architecture.md)为唯一事实来源；本文只把当前代码中的协作关系集中可视化。

## 当前上下文

| 上下文     | 状态   | 核心聚合                         | 拥有的事实                                                         |
| ---------- | ------ | -------------------------------- | ------------------------------------------------------------------ |
| Project    | 已实现 | `Project`、`ProjectRegistry`     | 项目目录、工作区、Git 绑定、当前工作区、最近项目目录               |
| BlockGraph | 已实现 | `BlockGraph`                     | 终端积木、组合、布局、执行配置和依赖连接                           |
| Run        | 已实现 | `TerminalSession`、`WorkflowRun` | PTY 会话生命周期、工作流运行计划和节点状态                         |
| Agent      | 已实现 | `AgentSession`                   | Agent 身份、布局、原生 MCP 开关、thread 绑定、工具协议、审批和审计 |
| Plugin     | 规划中 | 尚无                             | 尚未形成当前领域模型、用例或持久化事实                             |

`src/platform` 是最外层 composition root 与 Electron 适配层，不是限界上下文。`src/presentation` 负责跨上下文应用外壳与派生视图，也不拥有领域事实。

## 当前协作总览

```txt
Project application
  -> WorkspaceAgentLifecyclePort
  -> Platform adapter
  -> AgentSessionService lifecycle leases

Agent application
  -> AgentRuntimeScopeValidationPort
  -> Platform adapter
  -> ValidateProjectWorkspaceScopeUseCase

Run application
  -> TerminalWorkflowPlanPort
  -> BlockGraphTerminalWorkflowPlanAdapter
  -> BuildTerminalWorkflowPlanUseCase

Agent application
  -> AgentBlockGraphToolPort
  -> BlockGraphAgentToolAdapter
  -> BlockGraph application use cases
```

端口由需要外部能力的调用方上下文拥有；适配器负责把该稳定契约连接到提供方公开的应用层用例。Platform 只装配对象，不重新定义业务规则。

## Project 到 Agent：工作区所有权变更

| 项目             | 说明                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 发起方           | Project                                                                                                                                                                                      |
| 调用方拥有的端口 | `WorkspaceAgentLifecyclePort`                                                                                                                                                                |
| 提供方           | Agent 的 `AgentSessionService`                                                                                                                                                               |
| 触发条件         | 主工作区 checkout、worktree 归档或从登记簿移除项目                                                                                                                                           |
| 契约             | Project 写用例按目录串行，登记簿 RMW 另行全局串行；checkout/归档在 Agent 排空后复查工作树；以 release/resolve/quarantine 结束 lease；仅权威 Git 检查成功后同步并 resolve；失败时恢复旧作用域 |
| 禁止             | Project 直接读取 Agent 聚合、PTY 映射或 thread 仓储                                                                                                                                          |

详细语义见[项目与分支工作区生命周期](../contexts/project/workspace-lifecycle.md)和 [Agent 与会话生命周期](../contexts/agent/agent-session.md)。

## Agent 到 Project：运行时作用域有效性

| 项目             | 说明                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| 发起方           | Agent                                                                                         |
| 调用方拥有的端口 | `AgentRuntimeScopeValidationPort`                                                             |
| 提供方           | Project 的 `ValidateProjectWorkspaceScopeUseCase`                                             |
| 触发条件         | 每次附加，以及挂起恢复、MCP 重配等任何 Agent PTY 启动                                         |
| 契约             | 项目仍被记住，项目 ID、工作区名称/目录和 Git 分支全部匹配；Platform 同时确认 Agent 定义仍存在 |
| 禁止             | Agent 直接读取 Project/ProjectRegistry 聚合或仓储                                             |

该校验是 lifecycle lease 的提交后防线：即使旧 renderer 命令在 lease resolve 后才抵达，已删除 Agent、已归档工作区、已遗忘项目或旧分支作用域也不能重新启动 PTY。

## Run 到 BlockGraph：终端工作流计划

| 项目             | 说明                                                     |
| ---------------- | -------------------------------------------------------- |
| 发起方           | Run                                                      |
| 调用方拥有的端口 | `TerminalWorkflowPlanPort`                               |
| 提供方           | BlockGraph 的 `BuildTerminalWorkflowPlanUseCase`         |
| 返回             | 启动时不可变、拓扑有序的计划 DTO                         |
| 后续所有权       | Run 的 `WorkflowRun` 独立维护运行状态，不反写 BlockGraph |
| 禁止             | Run 直接读取 BlockGraph 仓储、聚合或表现层图对象         |

详细语义见[积木图模型](../contexts/block-graph/block-graph.md)和[终端依赖工作流](../contexts/run/terminal-workflow.md)。

## Agent 到 BlockGraph：原生 MCP 工具

| 项目              | 说明                                                        |
| ----------------- | ----------------------------------------------------------- |
| 发起方            | Agent                                                       |
| 调用方拥有的端口  | `AgentBlockGraphToolPort`                                   |
| 提供方            | BlockGraph 的查询和图变更用例                               |
| Agent 所有权      | 工具协议、会话鉴权、审批、调用状态与审计                    |
| BlockGraph 所有权 | 图结构、校验、变更和持久化                                  |
| 禁止              | MCP/JSON-RPC 适配器直接写图 JSON、调用聚合或修改 React 状态 |

详细语义见 [cleancode 原生 MCP](../contexts/agent/cleancode-mcp.md)。

## 非跨上下文关系

- Presentation 调用应用层用例、订阅 IPC 事件并形成派生视图，不是上下文之间的数据后门。
- Platform 注册 IPC、创建仓储和适配器、连接端口，不拥有 Project、BlockGraph、Run 或 Agent 业务状态。
- Shared Kernel 只容纳稳定且确实被多个上下文共同使用的错误/契约；不得用它规避端口边界。
- JSON 文件、PTY、Git CLI、HTTP Server 和 Codex CLI 都是基础设施细节，不是新的限界上下文。

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
