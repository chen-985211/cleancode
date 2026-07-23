# Agent 与会话生命周期

## 文档地位

本文是当前已实现 Agent 身份、固定 Provider、对话绑定、Agent launch 和运行时生命周期的统一维护入口。原生工具协议、MCP 鉴权和工具目录由 [cleancode 原生 MCP](cleancode-mcp.md)单独维护；Agent terminal 的 PTY、前台任务和视图事实由[终端会话生命周期](../run/terminal-session.md)维护。

全仓边界与事实来源以[架构文档](../../engineering/architecture.md)为准；Agent 控制台的用户可见语义以 [UI 契约](../../product/ui-contract.md)为准。

## 三类对象必须区分

- 工作区 Agent 是可持久化的稳定对象：`agentId`、固定 `providerId`、名称、画布布局、CleanCode MCP 偏好和各 Git 分支的 Provider 对话绑定。
- Agent terminal 是 Run 上下文拥有的长期 shell/PTY、权威终端模型和可丢弃视图。它使用类型化 `agent` owner，但不是 TerminalBlock，也不参与组合、连线、端口治理或终端工作流。
- Agent launch 是 Agent terminal 内一次 Provider CLI 前台任务。CLI 退出只结束 launch，底层 shell 和 Agent terminal 继续运行；删除 Agent 或工作区生命周期清理才终止 terminal。

重启 launch 或新建对话都不创造新的 Agent 身份。Provider 在 Agent 创建后不可修改；需要另一个 Provider 时必须创建另一个 Agent。

## 统一语言

| 术语                  | 含义                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| 工作区 Agent          | 画布中的稳定 Agent 对象，可创建、重命名、移动、缩放和删除                                      |
| Agent Provider        | CLI 的 detector、launcher、resume、telemetry 和能力注入 contribution                           |
| 注册 Provider catalog | registry 中应用支持的完整 Provider descriptor 集合，不表示本机 CLI 当前可创建                  |
| 可创建 Provider       | 注册 catalog 中经当前环境检测为 `installed`、可用于一次新建操作的 Provider                     |
| 对话作用域            | `projectId + workspaceName + gitBranch + agentId` 形成的隔离键                                 |
| Provider session ref  | Provider 正式报告的版本化对话引用，例如 `codex-thread`、`claude-session` 或 `opencode-session` |
| Agent terminal        | Run 按 `owner.kind = agent` 承载的长期 shell、PTY、终端模型和视图                              |
| Agent launch          | Agent terminal 中一次带 generation 的 Provider CLI 前台任务                                    |
| Agent activity        | Provider 结构化事件投影的 `idle/working/waiting_input/waiting_approval/unavailable`            |
| 终端源主题            | Agent terminal generation 创建时采用的浅色或深色 palette；该 generation 内保持不变             |
| 持久恢复              | 通过当前 Provider 的正式 resume 参数恢复已保存的 session ref                                   |
| 易失会话              | 不保存或复用对话绑定的运行方式，例如 detached HEAD                                             |
| 生命周期隔离          | 外部所有权事务部分提交后保留的 attach blocker；同步完成后显式解除                              |

## 聚合、Provider 与持久化

每个工作区允许有零个或多个 Agent。首次初始化从未存在过的工作区时，只有共享可用性服务确认 Codex 为 `installed` 才创建默认 Codex Agent；否则原子写入已初始化的空 Agent 列表，不回退到其他 Provider。仓储把“检查是否已经初始化”和“写入默认 Agent 或空列表”作为同一个串行操作，因此并发首次列出不能重复创建默认 Agent。已经初始化为空的工作区不会在以后仅因 CLI 安装状态变化而自动补建；用户删除最后一个 Agent 后，重新打开同样保持零个。

`AgentSession` 保持以下不变量：

1. 身份、项目、工作区、名称和 `providerId` 都不能为空；布局必须使用有限坐标和正尺寸。
2. `providerId` 在创建时确定，没有领域方法、用例或 IPC 可以切换；attach 携带的 Provider 与持久化事实不一致时必须拒绝。
3. 同一个 Agent 可以为不同 Git 分支保存不同 Provider session ref；引用只能绑定到该 Agent、项目和工作区的当前作用域。
4. session ref 必须由固定 Provider 的 codec 校验 kind、版本和值。Codex 使用正式 thread UUID；Claude Code 使用正式 session UUID；OpenCode 使用正式 `ses_` session ID。系统不扫描历史目录、终端输出或“最近会话”。Claude Code 的 `SessionStart` 只证明进程启动，空会话尚不可恢复；只有首次 `UserPromptSubmit` Hook 才确认并持久化该 session ref。
5. 同一工作区的多个相同或不同 Provider Agent 拥有独立 terminal、launch、对话、MCP、审批和审计，但共享工作目录。
6. CleanCode MCP 开关和 Agent 布局随稳定 Agent 持久化；URL、Token、Hook、活动状态、终端和 launch 都不持久化。
7. 当前 Agent 布局是其画布工具自动落位的权威锚点，其他 Agent 是保留区域；模型不能提供或伪造这些身份事实。

文件系统仓储当前使用 schema v4。旧版 Codex `codexThreadId` 会无损迁移为 `{ kind: "codex-thread", formatVersion: 1 }`；未知 schema、未知 session ref 版本或畸形数据必须拒绝读取。cleancode 不复制或解析 Provider 对话正文。

## Provider contribution

`AgentProviderRegistry` 按唯一 Provider ID 注册小型 contribution：

- `descriptor` 明确声明显示名称、经过约束的矢量图标、session-ref codec、resume、身份捕获、activity、launch instructions 和 `required / best_effort / unsupported` CleanCode MCP 能力。图标只允许有限 `viewBox`、路径数量、路径语法、填充和 fill rule；registry 在 composition root 注册时统一校验。
- `detector` 返回 `installed`、`missing`、`upgrade_required` 或 `temporarily_unavailable` 的结构化诊断。
- `launcher` 只返回经过校验的 executable、argv 和 environment，不把参数拼成用户可控 shell 文本。
- `resume`、`telemetry` 与 `cleancodeCapability` 是能力对应的可选 contribution；descriptor 与实现必须一致。
- `AgentLaunchArtifactScope` 在资源创建后立即接管 reporter、临时配置和插件，按 LIFO 清理；并发清理合并为同一操作，成功项只清理一次，失败项保留给下次重试。

Provider contribution 只拥有对应 CLI 的检测、结构化启动参数、进程级环境、正式恢复入口、结构化 telemetry 和本次 launch 的临时配置。它不得修改用户的全局 CLI 配置，也不得取得 Agent terminal 的 source palette、xterm surface 或视图生命周期所有权。终端宿主能力由 Run 统一提供；CLI 自己选择的 ANSI/真彩色语义、品牌色、TUI 布局和用户保存的 CLI 主题仍由对应 Provider 与用户拥有。共享同一个宿主终端不等于三方 CLI 必须生成相同像素。

当前内建 Provider：

| Provider    | 恢复 | 身份捕获 | 活动状态 | CleanCode MCP | 注入与回报方式                                                                                  |
| ----------- | ---- | -------- | -------- | ------------- | ----------------------------------------------------------------------------------------------- |
| Codex       | 是   | 是       | 否       | `required`    | 正式 thread notify、`resume`、进程级 MCP config 与 developer instructions                       |
| Claude Code | 是   | 是       | 是       | `best_effort` | 首次用户输入确认 session ID、Hooks、环境变量 token 和 launch 临时 MCP/settings                  |
| OpenCode    | 是   | 是       | 是       | `best_effort` | `--session`、插件事件、合并 `OPENCODE_CONFIG_CONTENT`、远程 MCP 环境变量引用和临时 instructions |

### 注册 catalog、可用性与可创建发现

registry 是完整支持 catalog 的唯一来源。列出 descriptor 不执行 CLI 检测，也不能证明 Provider 当前可创建；其结果必须持续服务于已有稳定 Agent 的名称、图标、能力和 session-ref 校验。某个已持久化 Agent 的 CLI 后来缺失、版本不足或暂时不可用时，仓储列出结果和 Agent 身份都不得消失；只有本次 launch/恢复会按当前可用性失败并投影诊断。

`AgentProviderAvailabilityService` 是进程内共享的易失可用性 owner。它在相同 Provider 的并发检查之间共享在途 Promise，缓存已完成快照，并允许显式 `refresh` 替换已完成结果；异常 detector 输出或抛错收敛为 `temporarily_unavailable`。单 Provider 检查、可创建发现、首次工作区初始化、创建校验和 launch 校验必须复用同一个服务，不得由各 Agent 各自拥有事实。

macOS/Linux 的桌面进程可能没有用户交互 shell 的完整 `PATH`。首次检查前，环境适配器通过当前 POSIX shell 的交互式 login invocation 获取 `PATH`，把去重后的 shell 路径优先合并到当前进程环境；显式刷新会重新探测。探测超时、输出无标记、启动或退出失败时安全保留继承环境，不得因此把任意输出写入 PATH。Windows 不运行 POSIX hydration，继续由参数边界明确的 PowerShell detector 兼容 npm `.cmd` shim。

可创建发现按 registry 顺序检查完整 catalog，只返回 `installed` descriptor 及其版本快照；`missing`、`upgrade_required` 和 `temporarily_unavailable` 都不进入创建候选。新建选择器只消费该专用结果，不得先投影静态 catalog。用户选定后，`CreateWorkspaceAgentUseCase` 必须以 `refresh` 再检查一次；只有仍为 `installed` 才构造并保存稳定 Agent，状态已经变化时以 `AGENT_PROVIDER_UNAVAILABLE` 失败且不产生持久化事实。

增加基础 Agent CLI 时，只需在 Provider 模块实现包含图标的 descriptor、detector 和 launcher，补充 contract/参数/清理测试，并在 composition root 注册。任意已注册 descriptor 都必须沿同一 Provider-neutral IPC 和 Presentation 投影；安装后会自动进入可创建发现，未安装时仍只存在于支持 catalog。新增 Provider 不得要求修改 `AgentConsole`、选择器或其他表现层组件。可选能力通过 contribution 增加；确需新的通用用户能力时，必须先扩展 capability 契约，并让所有现有 Provider 明确声明支持或诚实降级，不得在 Agent domain、Run domain、通用 IPC 或 Presentation 中按 Provider ID 分支。

## 分支与目录隔离

- 普通 Git 分支使用稳定分支名，可以在应用重启后恢复。
- 非 Git 项目使用显式 `null` 分支作用域并允许持久化。
- detached HEAD 没有稳定分支身份，必须使用易失模式，不得复用非 Git 的 `null` 绑定。
- 同一个 Agent 在同一物理目录切换到另一个分支作用域前，旧作用域运行时必须先释放。
- Project 通过 `WorkspaceAgentLifecyclePort` 协调目录内全部 Agent；详情见[项目与分支工作区生命周期](../project/workspace-lifecycle.md)。

## 运行时生命周期

附加 Agent 时，应用层依次：

1. 建立对话作用域，并重新确认项目、工作区目录、Git 分支和 Agent 定义仍有效。
2. 按 `projectId + workspaceDirectory + agentId` 串行 attach、挂起、恢复、重配和释放，阻止迟到 renderer 命令穿过生命周期 lease。
3. 读取稳定 Agent 的固定 Provider 和当前分支 session ref；“新对话”先等待在途绑定保存，再清除当前作用域引用。
4. 需要创建新 terminal 时，先通过共享可用性服务刷新固定 Provider 的检测环境并取得预检快照，保证 POSIX login-shell PATH 在 PTY 快照主进程环境之前完成水合；然后创建或复用 Run 的 agent-owned terminal。新 terminal 取得唯一 `sessionId` 和 `terminalViewIdentity`，复用时只更新回调与尺寸。
5. 能力开启时注册本 launch 独立的 CleanCode MCP URL、Bearer Token 和审批作用域；registration handle 精确拥有这一代注册，旧 handle 的释放或回调不能影响替代注册。
6. 在生成 Provider 启动计划前验证固定 Provider；新 terminal 消费第 4 步的预检快照，既有 terminal 上的重新启动则刷新共享可用性结果。不可用时保留稳定 Agent 和既有 terminal 事实，但拒绝创建新的 Provider launch。
7. Provider 生成启动计划；Run 在长期 shell 中启动带 `launchId + generation` 的 `ForegroundJob`。
8. Provider 正式报告 session ref 或 activity 时，只接受仍匹配当前 Agent runtime session 和 Provider launch generation 的回调；尚未产生可恢复对话的启动事件不得提前建立稳定绑定。`required` MCP 还要完成认证后的 `initialize` + `notifications/initialized` 握手才进入 running；`best_effort` Provider 可以在 MCP 仍初始化时运行，但失败必须单独投影。

Renderer 将首次 attach、重新启动和新对话请求投影为独立的 `measuring / pending / failed` 操作状态，不用 `null session` 冒充失败含义。失败必须保留可重试提示；同一作用域的重复重试只能形成一个在途 attach。已有 terminal binding 在重新启动或新对话 attach 失败时继续可用，旧工作区迟到的成功或失败结果不得覆盖当前作用域。该操作状态是 Presentation 的易失事实，不进入 `AgentRuntimeSnapshot`、持久化 schema 或 Provider capability。

Provider CLI 自然退出或处理 `Ctrl+C` 后，Agent launch 状态变为 `exited`、activity 变为 `unavailable`，停止新的 MCP 调用并释放 launch 临时资源；Run terminal、权威屏幕和 shell 保留。用户可以继续使用 shell、恢复当前对话或开始新对话。shell/PTY 自身退出才清空 terminal identity 并使整个运行时不可输入。

该基础终端能力必须同时支持 macOS、Linux 和 Windows。macOS/Linux 由 POSIX PTY/shell 承载，并在 Provider 检测前完成上述 login-shell PATH hydration；Windows 由 node-pty ConPTY 和 PowerShell/PowerShell Core 承载，并兼容 Provider 的 npm `.cmd` shim。平台模拟、PowerShell 脚本文本断言或 fake process 只能证明编码和契约，不能替代对应原生平台上的检测、PTY 中断、launch 退出和 shell 继续可写集成测试。

应用层只发布带单调 `revision` 的 `AgentRuntimeSnapshot`，不再维护互相竞争的扁平状态。它包含五条独立事实轴：

- `terminal`：长期 PTY/shell 的 starting、running、suspended、exited 或 failed，以及 process/view identity。
- `launch`：当前 Provider 前台任务的 generation、launchId、not_started、launching、running、stopped、exited 或 failed。
- `mcp`：disabled、unsupported、inactive、initializing、ready 或 failed。
- `binding`：unbound、persisting、persisted 或 persistence_failed；保存恢复引用失败不能把仍在工作的 launch 误报为失败。
- `activity`：idle、working、waiting_input、waiting_approval 或 unavailable；不支持结构化 telemetry 的 Provider 必须使用 unavailable，不能按输出频率猜测。

renderer 只按完整 runtime identity、generation 和 revision 对账。attach 响应、迟到事件、旧 launch 退出或旧 registration 回调都不得覆盖更高 revision 或更新 generation。

## 管理动作

- 发现：刷新共享检测环境并从注册 catalog 中只返回当前 `installed` Provider；加载、空结果和重试是选择器的易失状态。
- 创建：从可创建发现结果中选择一次，并在保存前刷新验证；失败不保存 Agent 且保留选择流程，不提供 Provider 切换。
- 列出：只在工作区从未初始化且 Codex 当前为 `installed` 时原子建立默认 Codex Agent，否则原子建立空工作区；既有 Agent 不按 CLI 可用性过滤。
- 重命名/布局：只修改目标 Agent 的稳定事实。
- 删除：停止目标 launch 和 terminal，取消审批、注销 MCP、删除定义和全部分支绑定；其他 Agent 不受影响。
- 重新启动：在同一 Agent terminal 创建新 generation；Provider 支持恢复时使用当前分支 session ref。
- 新对话：清除当前分支 session ref，在同一 Agent terminal 创建新 launch。
- 切换 MCP：先保存偏好；活动运行时会关闭旧审批和端点并建立新 session/launch，其他 Agent 不受影响。
- 挂起/恢复：工作目录所有权变化时停止整个 Agent terminal；失败补偿可以按稳定 Provider session ref 恢复。
- 应用退出：停止新附加、排空运行时操作和绑定保存，再释放全部 Agent terminal、Hook、MCP 与审批。Agent terminal 当前不跨应用保留。

挂起、重配、删除和应用退出将 PTY stop 与 launch artifact cleanup 分开提交：PTY 一旦确认停止，后续临时资源清理失败不得把 terminal 补偿回 running；失败 scope 保留并在下一次清理重试。全局退出会尝试全部 terminal、scope、持久化与 MCP 清理后聚合报告错误，不能因一个资源失败跳过其他 Agent。

生命周期 lease 的 `release`、`resolve` 和 `quarantine` 语义继续由 Project 协调：清理返回不代表外部 checkout、归档或仓储提交已经完成。任何可能启动 terminal 或 launch 的操作都必须服从 blocker 并在启动前重新校验作用域。

## 实现入口

| 层级             | 入口                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain           | [`AgentSession.ts`](../../../src/contexts/agent/domain/aggregates/AgentSession.ts)、[`ProviderSessionRef.ts`](../../../src/contexts/agent/domain/value-objects/ProviderSessionRef.ts)                                                                                                                                                                                              |
| Application      | [`AgentSessionService.ts`](../../../src/contexts/agent/application/use-cases/AgentSessionService.ts)、[`AgentProviderContribution.ts`](../../../src/contexts/agent/application/ports/AgentProviderContribution.ts)                                                                                                                                                                 |
| Catalog / 可用性 | [`AgentProviderRegistry.ts`](../../../src/contexts/agent/application/services/AgentProviderRegistry.ts)、[`AgentProviderAvailabilityService.ts`](../../../src/contexts/agent/application/services/AgentProviderAvailabilityService.ts)、[`DiscoverCreatableAgentProvidersUseCase.ts`](../../../src/contexts/agent/application/use-cases/DiscoverCreatableAgentProvidersUseCase.ts) |
| Persistence      | [`FileSystemAgentSessionRepository.ts`](../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentSessionRepository.ts)                                                                                                                                                                                                                                                |
| Run adapter      | [`RunAgentTerminalRuntimeAdapter.ts`](../../../src/contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter.ts)                                                                                                                                                                                                                                                            |
| Providers        | [`providers`](../../../src/contexts/agent/infrastructure/providers)、[`NodeAgentProviderShellPathHydrator.ts`](../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderShellPathHydrator.ts)                                                                                                                                                                  |
| Platform / UI    | [`agentIpcHandlers.ts`](../../../src/platform/electron-main/agentIpcHandlers.ts)、[`AgentConsole.tsx`](../../../src/presentation/app-shell/AgentConsole.tsx)、[`AgentProviderPickerDialog.tsx`](../../../src/presentation/app-shell/AgentProviderPickerDialog.tsx)、[`useAgentSessionAttachment.ts`](../../../src/presentation/app-shell/useAgentSessionAttachment.ts)             |

## 验证矩阵

| 层级        | 证明内容                                                                                                         | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | 固定 Provider、session ref、registry、共享可用性、创建重验、默认/空初始化、统一 runtime 与绑定降级               | [`agent.workspace-agents.spec.ts`](../../../tests/unit/contexts/agent/agent.workspace-agents.spec.ts)、[`agent.provider-registry.spec.ts`](../../../tests/unit/contexts/agent/agent.provider-registry.spec.ts)、[`agent.provider-availability-service.spec.ts`](../../../tests/unit/contexts/agent/agent.provider-availability-service.spec.ts)、[`agent.create-workspace-agent-availability.spec.ts`](../../../tests/unit/contexts/agent/agent.create-workspace-agent-availability.spec.ts)、[`agent.manage-workspace-agents.spec.ts`](../../../tests/unit/contexts/agent/agent.manage-workspace-agents.spec.ts)、[`agent.unified-runtime-readiness.spec.ts`](../../../tests/unit/contexts/agent/agent.unified-runtime-readiness.spec.ts) |
| Unit        | Codex、Claude Code 和 OpenCode 启动参数、Hook/插件、MCP、平台安装配方与 launch artifact 重试清理                 | [`agent.codex-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.codex-provider-contribution.spec.ts)、[`agent.additional-provider-contributions.spec.ts`](../../../tests/unit/contexts/agent/agent.additional-provider-contributions.spec.ts)、[`agent.opencode-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.opencode-provider-contribution.spec.ts)、[`agent.session-artifact-lifecycle.spec.ts`](../../../tests/unit/contexts/agent/agent.session-artifact-lifecycle.spec.ts)                                                                                                                                                                                                         |
| Unit / UI   | 未知 Provider descriptor 的通用投影、capability 降级、attach 失败保留、single-flight 重试和迟到作用域隔离        | [`agent-console.provider-neutral.spec.tsx`](../../../tests/unit/presentation/agent-console.provider-neutral.spec.tsx)、[`agent-provider-picker-dialog.spec.tsx`](../../../tests/unit/presentation/agent-provider-picker-dialog.spec.tsx)、[`agent-console.attach-lifecycle.spec.tsx`](../../../tests/unit/presentation/agent-console.attach-lifecycle.spec.tsx)                                                                                                                                                                                                                                                                                                                                                                            |
| Unit / Gate | 自动发现内建 Provider，并拒绝 Presentation 中的具体 Provider infrastructure 引用或品牌 ID                        | [`check-agent-provider-boundary.spec.ts`](../../../tests/unit/support/check-agent-provider-boundary.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Integration | schema 迁移、真实 Agent terminal、CLI 退出回 shell 与重复 launch                                                 | [`agent.session-persistence.spec.ts`](../../../tests/integration/contexts/agent/agent.session-persistence.spec.ts)、[`agent.run-terminal-provider.spec.ts`](../../../tests/integration/contexts/agent/agent.run-terminal-provider.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Platform    | POSIX login-shell PATH 在 Agent PTY 前水合、macOS/Linux PTY 与 Windows `.cmd`/ConPTY 的检测、退出码和 shell 存活 | [`agent.provider-shell-path-hydrator.spec.ts`](../../../tests/unit/contexts/agent/agent.provider-shell-path-hydrator.spec.ts)、[`agent.session-provider-environment.spec.ts`](../../../tests/unit/contexts/agent/agent.session-provider-environment.spec.ts)、[`run.pty-terminal.spec.ts`](../../../tests/integration/contexts/run/run.pty-terminal.spec.ts)、[`agent.windows-provider-cli.spec.ts`](../../../tests/integration/contexts/agent/agent.windows-provider-cli.spec.ts)、[`run.windows-agent-pty.spec.ts`](../../../tests/integration/contexts/run/run.windows-agent-pty.spec.ts)                                                                                                                                               |
| Contract    | Provider-neutral Agent IPC 与共享终端视图身份                                                                    | [`agent.ipc.spec.ts`](../../../tests/contract/contexts/agent/agent.ipc.spec.ts)、[`run.terminal-view-ipc.spec.ts`](../../../tests/contract/contexts/run/run.terminal-view-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E2E         | 多 Agent、工作区往返、主题、审批、创建/删除和共享 xterm 交互                                                     | [`workspace-agents.e2e.spec.ts`](../../../tests/e2e/workspace-agents.e2e.spec.ts)、[`agent-terminal-theme-workspaces.e2e.spec.ts`](../../../tests/e2e/agent-terminal-theme-workspaces.e2e.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 维护规则

改变 Agent 身份、Provider、session ref、launch generation、attach/retry、持久化 schema、挂起恢复或删除语义时，必须同步聚合、用例、migration、Provider contract、测试和本文。新增 Provider 不得修改核心控制流；如果需要新通用能力，应先扩展 capability 契约并证明现有 Provider 的诚实降级。
