# Agent 与会话生命周期

## 文档地位

本文是当前已实现 Agent 身份、对话绑定和运行时会话的统一维护入口。原生工具协议、MCP 鉴权和工具目录由 [cleancode 原生 MCP](cleancode-mcp.md)单独维护。

全仓边界与事实来源以[架构文档](../../engineering/architecture.md)为准；Agent 控制台的用户可见语义以 [UI 契约](../../product/ui.md)为准。

## 两类会话必须区分

“Agent”与“运行时会话”不是同一个对象：

- `AgentSession` 聚合表示可持久化的工作区 Agent：稳定 `agentId`、名称、画布布局、CleanCode 原生 MCP 能力开关和各 Git 分支的 Codex thread 绑定。
- Agent 运行时会话表示当前进程中的一次 Codex PTY：易失 `sessionId`、进程号、状态、回调、终端源主题和待审批请求，以及能力开启时存在的 MCP 端点与 Token。

重启 PTY 不应创造新的 Agent 身份；删除 Agent 则必须同时释放其运行时并删除全部持久化绑定。

## 统一语言

| 术语         | 含义                                                                |
| ------------ | ------------------------------------------------------------------- |
| 工作区 Agent | 画布中的稳定 Agent 对象，可被创建、重命名、移动、缩放和删除         |
| 对话作用域   | `projectId + workspaceName + gitBranch + agentId` 形成的隔离键      |
| 对话绑定     | 一个作用域到 Codex thread UUID 的持久化映射                         |
| 运行时会话   | 一个当前 Codex PTY 及其审批和输出回调；能力开启时拥有独立 MCP       |
| 终端源主题   | 本次 PTY 首次附加时采用的浅色或深色 palette；运行期间保持不变       |
| 持久恢复     | 通过已保存 UUID 调用 Codex CLI 的正式恢复入口                       |
| 易失会话     | 不保存或复用 thread 绑定的运行方式，例如 detached HEAD              |
| 挂起/恢复    | 项目切换物理目录分支前停止旧 PTY，并在失败时恢复原作用域的协调动作  |
| 生命周期隔离 | 外部所有权事务部分提交后保留的 attach blocker；同步完成后显式解除   |
| MCP 能力开关 | 每个工作区 Agent 独立保存、只控制 CleanCode 内建画布 MCP 的布尔状态 |

## 聚合与持久化规则

每个工作区允许有零个或多个 Agent。首次初始化从未存在过的工作区时创建一个默认 `Agent 1`；用户删除最后一个 Agent 后，重新打开该已初始化工作区仍保持零个，不偷偷补回默认项。

`AgentSession` 保持以下不变量：

1. `agentId`、`projectId`、`workspaceName` 和名称不能为空。
2. 布局坐标和尺寸必须是有限数，宽高必须大于零。
3. 同一个 Agent 可以为不同 Git 分支保存不同 Codex thread UUID。
4. 一个 thread 只能绑定到属于该 Agent、项目和工作区的作用域。
5. 创建多个 Agent 时名称使用当前空缺的 `Agent N`，身份和布局互不影响。
6. 新建 Agent 和从旧存储迁移的 Agent 默认启用 CleanCode MCP；关闭状态必须随 Agent 持久化并跨应用重启恢复。

当前文件系统仓储使用版本化 JSON，支持从旧版单 Agent 分支绑定迁移。cleancode 只保存 thread UUID，不复制、扫描或解析 Codex 对话正文。

## 分支与目录隔离

对话绑定键包含项目、工作区、Git 分支和 `agentId`：

- 普通 Git 分支使用稳定分支名，可在应用重启后恢复。
- 非 Git 项目使用显式 `null` 分支作用域，可以持久化。
- detached HEAD 没有稳定分支身份，必须使用易失模式，不得复用非 Git 的 `null` 绑定。
- 同一工作区的多个 Agent 可以各自运行独立可写 PTY，但共享同一个工作目录；这不是文件级隔离。
- 同一个 Agent 在同一物理目录切换到另一个分支作用域前，旧作用域运行时必须先被释放。

Project 上下文切换主工作区分支时，通过它拥有的 `WorkspaceAgentLifecyclePort` 协调该目录内的全部 Agent，详见[项目与分支工作区生命周期](../project/workspace-lifecycle.md)。

## 运行时生命周期

附加 Agent 时，应用层按以下顺序工作：

1. 建立对话作用域，并在物理 owner 队列中通过 `AgentRuntimeScopeValidationPort` 重新确认项目仍在登记簿、工作区目录与 Git 分支仍匹配、Agent 定义仍存在；提交后迟到的旧界面命令必须在主进程被拒绝。
2. 以 `projectId + workspaceDirectory + agentId` 作为物理运行时 owner，串行处理该 owner 的附加、挂起、恢复、重配和释放；可复用的运行中会话只更新回调和 PTY 尺寸，继续返回首次附加确定的终端源主题。
3. 释放同一 Agent 在同一物理目录中的其他作用域。
4. 按持久化模式查找 thread 绑定；“新对话”会先清除当前作用域绑定。
5. 为本次运行生成独立 `sessionId`；仅当该 Agent 已启用 CleanCode MCP 时，注册独立 MCP URL 与 Bearer Token。
6. 每次真正启动 Codex PTY 前再次校验 session 的完整运行时作用域；attach、挂起恢复和 MCP 重配共用同一校验，任一事实失效都不得调用进程端口。校验通过后，在存在 UUID 时使用正式 resume 参数；已启用的 CleanCode MCP Server 必须成功初始化、单独把全部当前和未来工具默认预批准，并向本次进程注入画布路由 developer instructions；sandbox 与全局 approval policy 继续继承用户 Codex 配置。
7. 仅在当前子进程明确报告 thread UUID 后，才把它绑定并保存到当前作用域。

运行时状态包括 `running`、`suspended`、`exited`、`failed` 和 `restore_failed`。终端源主题由新运行时首次附加时的有效应用主题确定；同一 PTY 的重挂载、挂起恢复和 MCP 能力重配必须保留该值，新对话或应用重启后的新运行时可以重新采用当时的有效主题。PTY、进程号、终端源主题、终端输出、当前 turn、MCP URL、Token 和待审批请求都不持久化。

## 管理动作

- 创建：保存一个新的稳定 Agent，不自动启动 Codex PTY。
- 列出：读取工作区 Agent；只在工作区从未初始化时建立默认 Agent。
- 重命名/布局：只修改目标 Agent 的持久化事实。
- 删除：先释放目标 Agent 的运行时与审批，再删除定义和所有分支绑定；允许删除到零个。
- 新对话：清除当前作用域 thread 绑定并启动新的运行时，不删除 Agent 本身。
- 切换 MCP 能力：先保存目标 Agent 的期望状态；仅当 PTY 仍为 `running` 且完整作用域校验通过时，才取消旧审批、注销旧端点、生成新 `sessionId` 并用原 thread 重启，仅在开启时注入内建 MCP。已挂起的旧分支 session 不得被重配动作唤醒，其他 Agent 不受影响。
- 应用退出：先停止接受新附加并排空已经开始的运行时操作，再释放所有进程、审批与 MCP 端点，等待已收到的 thread 绑定写入完成。

挂起、删除 Agent、释放工作区或项目时，清理动作必须与同一物理运行时 owner 的 pending attach 共用串行队列，并先同步安装拒绝迟到附加的 lifecycle lease。Project 的写用例另由项目级事务协调器从首次仓储读取开始串行，避免自动 Git 同步或另一个写动作使用旧快照覆盖结果。lease 不能在 PTY 清理返回时提前结束：调用方必须把它持有到 checkout 与项目保存、worktree 归档与项目保存、Agent 定义删除或项目登记删除全部完成。

lease 的结束语义必须明确区分：`release` 只结束当前安全失败或普通清理，不解除历史隔离；`resolve` 表示外部事实已经提交或补偿完成，并只解除对应工作区的 quarantine，项目级 resolve 才能批量解除该项目；`quarantine` 表示外部状态已前进但保存/补偿失败，保留 attach blocker、释放事务互斥，使后续归档重试或自动项目同步可以恢复并 resolve。应用退出会清理全部 blocker。清理不能只扫描已经进入运行时 Map 的 session，否则仓储读取中的 attach 会在所有权事务完成前重新启动 PTY；MCP 重配等任何可能启动 PTY 的动作既必须服从 blocker，也必须在进程启动前重新通过作用域校验。

## 实现入口

| 层级        | 入口                                                                                                                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain      | [`AgentSession.ts`](../../../src/contexts/agent/domain/aggregates/AgentSession.ts)、[`AgentConversationScope.ts`](../../../src/contexts/agent/domain/value-objects/AgentConversationScope.ts)                                                                                                                    |
| Management  | [`ListWorkspaceAgentsUseCase.ts`](../../../src/contexts/agent/application/use-cases/ListWorkspaceAgentsUseCase.ts)、[`CreateWorkspaceAgentUseCase.ts`](../../../src/contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase.ts)                                                                         |
| Runtime     | [`AgentSessionService.ts`](../../../src/contexts/agent/application/use-cases/AgentSessionService.ts)、[`AgentSessionRuntimeCoordinator.ts`](../../../src/contexts/agent/application/use-cases/AgentSessionRuntimeCoordinator.ts)                                                                                 |
| Persistence | [`FileSystemAgentSessionRepository.ts`](../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentSessionRepository.ts)                                                                                                                                                                              |
| Codex PTY   | [`NodePtyCodexAgentProcessAdapter.ts`](../../../src/contexts/agent/infrastructure/pty/NodePtyCodexAgentProcessAdapter.ts)                                                                                                                                                                                        |
| Platform    | [`agentIpcHandlers.ts`](../../../src/platform/electron-main/agentIpcHandlers.ts)、[`agentRuntimeLifecycleAdapter.ts`](../../../src/platform/electron-main/agentRuntimeLifecycleAdapter.ts)、[`agentRuntimeScopeValidationAdapter.ts`](../../../src/platform/electron-main/agentRuntimeScopeValidationAdapter.ts) |

## 验证矩阵

| 层级        | 证明内容                                                                        | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | 身份、布局、分支绑定与多 Agent 管理                                             | [`agent.workspace-agents.spec.ts`](../../../tests/unit/contexts/agent/agent.workspace-agents.spec.ts)、[`agent.manage-workspace-agents.spec.ts`](../../../tests/unit/contexts/agent/agent.manage-workspace-agents.spec.ts)                                                                                                                                                                                                                       |
| Unit        | attach/restart、源主题、并发附加、隔离/恢复、MCP 重配、作用域校验和运行时清理   | [`agent.session-service.spec.ts`](../../../tests/unit/contexts/agent/agent.session-service.spec.ts)、[`agent.session-theme.spec.ts`](../../../tests/unit/contexts/agent/agent.session-theme.spec.ts)、[`agent.reconfigure-mcp-capability.spec.ts`](../../../tests/unit/contexts/agent/agent.reconfigure-mcp-capability.spec.ts)、[`agent-runtime-scope-validation.spec.ts`](../../../tests/unit/platform/agent-runtime-scope-validation.spec.ts) |
| Integration | JSON 迁移、thread 持久化和 Codex PTY 参数/必需 MCP/会话路由/默认预批准/生命周期 | [`agent.session-persistence.spec.ts`](../../../tests/integration/contexts/agent/agent.session-persistence.spec.ts)、[`agent.codex-pty-process.spec.ts`](../../../tests/integration/contexts/agent/agent.codex-pty-process.spec.ts)                                                                                                                                                                                                               |
| Contract    | Electron IPC 的会话和管理契约                                                   | [`agent.ipc.spec.ts`](../../../tests/contract/contexts/agent/agent.ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                  |
| E2E         | 多 Agent 主路径，以及跨主题工作区往返时的 PTY 复用与源主题恢复                  | [`workspace-agents.e2e.spec.ts`](../../../tests/e2e/workspace-agents.e2e.spec.ts)、[`agent-terminal-theme-workspaces.e2e.spec.ts`](../../../tests/e2e/agent-terminal-theme-workspaces.e2e.spec.ts)                                                                                                                                                                                                                                               |

## 维护规则

改变 Agent 身份、作用域、thread 获取方式、持久化 schema、挂起恢复或删除语义时，必须同步聚合、用例、迁移、测试和本文。改变 MCP 工具或鉴权时，只更新原生 MCP 专文及其协议测试，不在本文复制工具目录。
