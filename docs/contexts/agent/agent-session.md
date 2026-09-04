# Agent 与会话生命周期

## 文档地位

本文是当前已实现 Agent 身份、固定 Provider、对话绑定、Agent launch 和运行时生命周期的统一维护入口。原生工具协议、MCP 鉴权和工具目录由 [cleancode 原生 MCP](cleancode-mcp.md)单独维护；Agent terminal 的 PTY、前台任务和视图事实由[终端会话生命周期](../run/terminal-session.md)维护。

全仓边界与事实来源以[架构文档](../../engineering/architecture.md)为准；Agent 控制台的用户可见语义以 [UI 契约](../../product/ui-contract.md)为准。

## 三类对象必须区分

- 工作区 Agent 是可持久化的稳定对象：`agentId`、固定 `providerId`、名称、画布布局、CleanCode MCP 偏好和一个 Provider 对话绑定。
- Agent terminal 是 Run 上下文拥有的长期 shell/PTY、权威终端模型和可丢弃视图。它使用类型化 `agent` owner，但不是 TerminalBlock，也不参与组合、连线、端口治理或终端工作流。
- Agent launch 是 Agent terminal 内一次 Provider CLI 前台任务。CLI 退出只结束 launch，底层 shell 和 Agent terminal 继续运行；删除 Agent 或工作区生命周期清理才终止 terminal。

重启 launch 或新建对话都不创造新的 Agent 身份。Provider 在 Agent 创建后不可修改；需要另一个 Provider 时必须创建另一个 Agent。

## 统一语言

| 术语                  | 含义                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| 工作区 Agent          | 画布中的稳定 Agent 对象，可创建、重命名、移动、缩放和删除                           |
| Agent Provider        | CLI 的 detector、launcher、resume、telemetry 和能力注入 contribution                |
| 注册 Provider catalog | registry 中应用支持的完整 Provider descriptor 集合，不表示本机 CLI 当前可创建       |
| 可创建 Provider       | 注册 catalog 中经当前环境检测为 `installed`、可用于一次新建操作的 Provider          |
| 对话作用域            | `projectId + workspaceId + agentId` 形成的稳定画布对象身份                          |
| Provider session ref  | Provider 正式报告或由正式 session 参数分配的版本化对话引用                          |
| Agent terminal        | Run 按 `owner.kind = agent` 承载的长期 shell、PTY、终端模型和视图                   |
| Agent launch          | Agent terminal 中一次带 generation 的 Provider CLI 前台任务                         |
| Agent activity        | Provider 结构化事件投影的 `idle/working/waiting_input/waiting_approval/unavailable` |
| Agent turn completion | 一次回答完成的易失事件，不是第六种持续 activity 状态                                |
| 终端源主题            | Agent terminal generation 创建时采用的浅色或深色 palette；该 generation 内保持不变  |
| 持久恢复              | 通过当前 Provider 的正式 resume 参数恢复已保存的 session ref                        |
| 生命周期隔离          | 外部所有权事务部分提交后保留的 attach blocker；同步完成后显式解除                   |

## 聚合、Provider 与持久化

每个工作区允许有零个或多个 Agent。首次初始化从未存在过的工作区时，应用层原子写入已初始化的空 Agent 列表，不检测 Provider 或创建默认 Agent。仓储把“检查是否已经初始化”和“写入空列表”作为同一个串行操作，因此并发首次列出只初始化一次。已经初始化为空的工作区不会在以后仅因 CLI 安装状态或偏好变化而自动补建；只有显式创建命令可以加入 Agent，用户删除最后一个 Agent 后重新打开同样保持零个。

Renderer 只能投影应用层返回的 Agent 列表；列表缺失或仍在加载时按空列表处理，不得合成 `default-agent`、默认 Codex 身份或启动任何 Provider。

手动创建由 Presentation 生成稳定 `agentId`，同一次选择流程的失败重试必须复用该 ID。Presentation 还必须通过主画布统一创建协调器，依据终端、终端组合与 Agent 的当前投影以及在途创建预留一个有限 `initialPosition`；该坐标是跨节点类型的用户可见布局意图，不是 Agent domain 私有落位策略。应用层按 `projectId + workspaceId` 串行检查和保存；相同 ID 与 Provider 的重复请求返回已提交 Agent，相同 ID 请求其他 Provider 以 `AGENT_CREATION_CONFLICT` 拒绝。Agent domain 根据事务内重新读取的工作区 Agent 原子分配唯一名称，校验 `initialPosition`，组合领域默认尺寸并持久化完整布局。Presentation 的预留阻止跨终端与 Agent 的并发重叠，Agent 事务阻止重名和重复身份；任一创建失败都必须由 Presentation 释放对应预留。保存前还必须在 Project 写事务内验证项目仍被记住且项目 ID、`workspaceId`、目录和 Agent 定义完整匹配；分支只作为 launch 元数据。失效作用域以 `AGENT_WORKSPACE_SCOPE_STALE` 拒绝且不保存。

`AgentSession` 保持以下不变量：

1. 身份、项目、工作区、名称和 `providerId` 都不能为空；布局必须使用有限坐标和正尺寸。
2. `providerId` 在创建时确定，没有领域方法、用例或 IPC 可以切换；attach 携带的 Provider 与持久化事实不一致时必须拒绝。
3. 同一个 Agent 只保存最后一次由当前 Provider launch 正式确认的 session ref；新的不同引用覆盖旧引用，不维护切换历史。引用绑定到该 Agent、项目和稳定物理工作区，不因 Git 分支 checkout 改变。
4. session ref 必须由固定 Provider 的 codec 校验 kind、版本和值。Codex 注入正式 `tui.terminal_title` 配置，并把 Run 解析出的结构化 OSC title metadata 作为当前 thread 事实：未命名 thread 直接报告完整 UUID；命名 thread 的截断 UUID 只能由同一 executable 和环境下的正式 `app-server thread/list` 唯一前缀匹配补全，零命中或多命中都不得持久化。完成回合 notify 与精确信任的 `SessionEnd` Hook 只作兼容补报；已经观察到当前 title 后，其他 thread 的退出事件不得覆盖它。Claude Code 的 fresh `SessionStart(source=startup)` 和 `/clear` 后的 `SessionStart(source=clear)` 只表示 CLI 已分配 UUID，不证明本地 transcript 已形成，因此必须等 `UserPromptSubmit` 后才确认 session ref；`SessionStart(source=resume)` 与 `SessionStart(source=compact)` 指向已有可恢复对话，可以立即确认。缺失或未知 `source` 必须失败关闭，不能建立绑定。OpenCode 使用顶层 `session.created` 或 `chat.message` Hook 确认的正式 `ses_` session ID，并排除带 `parentID` 的子会话；Gemini 使用 cleancode 通过正式 `--session-id` 参数预分配的 UUID，并通过 `SessionStart` Hook 跟进 CLI 内部恢复后的当前 session UUID。四者都只通过正式 resume 参数恢复。系统不扫描 Provider 历史目录、可见终端文本或“最近会话”。
5. 同一工作区的多个相同或不同 Provider Agent 拥有独立 terminal、launch、对话、MCP、审批和审计，但共享工作目录。
6. CleanCode MCP 开关和 Agent 布局随稳定 Agent 持久化；URL、Token、Hook、活动状态、完成事件、终端和 launch 都不持久化。
7. 当前 Agent 布局是其画布工具自动落位的权威锚点，其他 Agent 是保留区域；模型不能提供或伪造这些身份事实。

文件系统仓储当前只接受 schema v5，每个 Agent 只有一个 `providerSessionRef`。旧 schema、未知 session ref 版本或畸形数据必须拒绝读取，不迁移或回写；产品尚未公开期间由新的应用状态代际生成全新数据。cleancode 不复制或解析 Provider 对话正文。

Codex 的 title、完成回合 notify 和 `SessionEnd` Hook 上报的是已分配身份，UUID 存在不代表聊天记录已经保存。Agent 仍跟随并保存 CLI 最后报告的编号，包括 CLI 内切换到空 thread 的情况；是否可恢复由启动时的正式查询确认，不能因空 thread 尚无记录而继续恢复前一个 thread。

Codex 恢复前通过同一 executable、启动参数和环境下的独立 `app-server thread/read(includeTurns=false)` 检查已保存引用，明确返回该 ID 无保存记录时清除绑定并打开空白对话；查询超时、CLI 不可用、不支持查询或未知错误均保留原引用和 resume 行为。Agent 的身份、名称、布局和 MCP 偏好不因此改变。

查询结果须等待查询进程关闭后再返回：先关闭标准输入，允许 CLI 及其启动器正常退出；有界等待超时后，Windows 终止本次查询的进程树。清理超时同样返回不可用，不能据此清除绑定。Windows 原生 CLI 由 Node 直接启动并拥有 JSON-RPC 标准流和原生参数；没有可执行扩展名的命令先通过短命 PowerShell 查询其真实路径，再直接启动原生文件，避免在协议管道中插入 PowerShell。脚本 shim 继续使用既有 PowerShell 启动方式。

## Provider contribution

`AgentProviderRegistry` 按唯一 Provider ID 注册小型 contribution：

- `descriptor` 明确声明显示名称、经过约束的矢量图标、session-ref codec、resume、身份捕获、activity、launch instructions 和是否支持 CleanCode MCP。图标只允许有限 `viewBox`、路径数量、路径语法、填充和 fill rule；registry 在 composition root 注册时统一校验。
- `detector` 返回 `installed`、`missing`、`upgrade_required` 或 `temporarily_unavailable` 的结构化诊断。
- `launcher` 返回经过校验的 executable、argv 和 environment，不把参数拼成用户可控 shell 文本；使用 Provider 正式 session 参数时，可以同时返回待本次 launch 启动后确认的候选 session ref。Provider 正式查询明确确认旧对话无保存记录时，launcher 可以声明清除旧引用并生成新对话参数；应用层负责清除持久化绑定和内存绑定，Provider 不直接写仓储。
- `freshSession`、`resume`、`telemetry` 与 `cleancodeCapability` 是能力对应的可选 contribution；descriptor 与实现必须一致。
- `AgentLaunchArtifactScope` 在资源创建后立即接管 reporter、临时配置和插件，按 LIFO 清理；并发清理合并为同一操作，成功项只清理一次，失败项保留给下次重试。

Provider contribution 只拥有对应 CLI 的检测、结构化启动参数、进程级环境、正式恢复入口、结构化 telemetry、本次 launch 的临时配置，以及 CLI 已验证的宿主探测能力声明。它不得修改用户的全局 CLI 配置，也不得取得 Agent terminal 的 source palette、xterm surface 或视图生命周期所有权。终端宿主能力和固定 generation 的 `terminalSourceTheme` 由 Run 统一提供；CLI 自己选择的 ANSI/真彩色语义、品牌色、TUI 布局和用户保存的 CLI 主题仍由对应 Provider 与用户拥有。共享同一个宿主终端不等于三方 CLI 必须生成相同像素。

支持 launch instructions 的 Provider 不拥有画布对象定义。CleanCode MCP 开启时，它们只能注入由共享[画布语义契约](../../product/canvas-semantic-contract.md)生成、并与 MCP `initialize.instructions` 相同的规范语义段落，再按 Provider 正式配置入口完成转义和传递；不得在 contribution 内复制终端、流程或组合判断。

当前内建 Provider：

| Provider    | 恢复 | 身份捕获 | 状态/完成      | CleanCode MCP | 注入与回报方式                                                                                                   |
| ----------- | ---- | -------- | -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Codex       | 是   | 是       | 仅完成事件     | 是            | 结构化 terminal title、正式 `thread/list`/notify、精确信任的 `SessionEnd` Hook、`resume`、进程级 MCP config      |
| Claude Code | 是   | 是       | 五态与完成     | 是            | 可恢复 `SessionStart` 或首次 `UserPromptSubmit` session ID、Hooks、环境变量 token 和 launch 临时 MCP/settings    |
| OpenCode    | 是   | 是       | 五态与完成     | 是            | `--session`、顶层 session/plugin chat Hook、合并 `OPENCODE_CONFIG_CONTENT`、远程 MCP 环境变量和临时 instructions |
| Gemini      | 是   | 是       | 工作/空闲/完成 | 是            | `--session-id` 预分配、`SessionStart` session ID、`--resume` 与合并 Hook/MCP 的 launch 临时 settings             |

Provider contribution 的结构化回调和普通终端中的已知 CLI Hook 最终进入同一个 `AgentActivityRegistry`。托管 launch 以 Agent terminal 完整运行身份、固定 Provider、launch generation 和 invocation 建立记录；只有声明 `activityTracking` 的 Provider 在进程被接受后发布 `idle`，只有完成回调的 Codex 持续保持 `unavailable`，但仍可发布独立完成事件。普通终端只在 Run 明确开启该宿主能力时，通过终端私有环境中的稳定 shim、短期 invocation ID、HMAC 终端 generation token 和 loopback gateway 上报。shim 在实际 Provider 启动前按 launch spec 声明的能力发布初态：可跟踪状态的 Provider 为 `idle`，只有完成回调的 Codex 为 `unavailable`；进程退出后发布 `invocation_exited` 并从当前快照移除该 invocation。shim 使用异步子进程并捕获、转发 `Ctrl+C` 等终止信号，使退出事实仍能在 `finally` 中有界上报；Hook 与 plugin 的 loopback 请求同样有界并 fail-open。Claude Code 的 `PermissionRequest`/permission notification 进入 `waiting_approval`，随后获准执行产生的 `PreToolUse` 恢复为 `working`。

Windows 普通终端中的 Codex launch spec 额外声明 `windowsConsoleThemeProbe`，因为当前 Codex 会同步读取 Win32 Console screen-buffer 默认色；Claude Code、Gemini 和 OpenCode 不声明该能力。Agent 只返回带随机 token 的 provider-neutral private output-control descriptor，并在 shim 内用显式控制帧包住单次 ConsoleColor 设置与恢复；Run 仍拥有源主题、PTY、descriptor 激活和模型前输出消费。私有 token 与主题只在支持该协议的 NodePty adapter 中原子注入，真实 Provider 调用期间必须移除。shim 不读取或解析 PTY 输出，Run gate 也不识别 Provider ID 或 activity；绝对路径、绕过 `PATH` 的 alias、旧 Provider 或未知 CLI 可以诚实保留原有主题降级，不能回退到全局 PowerShell bootstrap。

两条 activity 入口都不得解析终端输出，也不得修改用户全局 Provider 配置。Activity 的 UI 投影必须保留 terminal scope 中的 owner，并与稳定 `projectId + workspaceId` 组合为画布对象身份；owner 为 Agent 时定位 Agent，owner 为 block 或缺失时定位 `blockId` 对应的普通终端，不得从 Agent 名称、目录或显示文案反推目标。当前普通终端只为 Claude Code、Codex、Gemini 和 OpenCode 注入已验证的正式 Hook；绝对路径、绕过 `PATH` 的 alias、清空环境或未知 CLI 可以诚实降级为 `unavailable`，不能猜测状态。

### 注册 catalog、可用性与可创建发现

registry 是完整支持 catalog 的唯一来源。列出 descriptor 不执行 CLI 检测，也不能证明 Provider 当前可创建；其结果必须持续服务于已有稳定 Agent 的名称、图标、能力和 session-ref 校验。某个已持久化 Agent 的 CLI 后来缺失、版本不足或暂时不可用时，仓储列出结果和 Agent 身份都不得消失；只有本次 launch/恢复会按当前可用性失败并投影诊断。

`AgentProviderAvailabilityService` 是进程内共享的易失可用性 owner。它在相同 Provider 的并发检查之间共享在途 Promise，缓存已完成快照，并允许显式 `refresh` 替换已完成结果；异常 detector 输出或抛错收敛为 `temporarily_unavailable`。单 Provider 检查、可创建发现、创建校验和 launch 校验必须复用同一个服务，不得由各 Agent 各自拥有事实。工作区首次列出不依赖 Provider 可用性。

macOS/Linux 的桌面进程可能没有用户交互 shell 的完整 `PATH`。首次检查前，环境适配器通过当前 POSIX shell 的交互式 login invocation 获取 `PATH`，把去重后的 shell 路径优先合并到当前进程环境；显式刷新会重新探测。探测超时、输出无标记、启动或退出失败时安全保留继承环境，不得因此把任意输出写入 PATH。Windows 不运行 POSIX hydration，继续由参数边界明确的 PowerShell detector 兼容 npm `.cmd` shim。

独立 Terminal Provider 可能早于检测启动，也可能从上次应用运行继续存活，不能把更新主进程环境视为已经更新 PTY 环境。`RunAgentTerminalRuntimeAdapter` 在每次创建 POSIX Agent terminal 时，把当前检测环境中的非空 `PATH` 通过 Run 的显式 environment 参数传递；每次 foreground launch 则重新读取路径并通过可选 `fallbackPath` 传递，不能在适配器构造时缓存路径，也不能覆盖存活 shell 的 PATH。Run 在本次前台子进程中把检测路径追加到实时继承的 PATH 后，保留 shell 启动配置、项目工具和后续激活虚拟环境的查找优先级。Provider launch plan 显式配置的 `PATH`（包括空值）完全优先，缺失或空的检测路径保留终端继承行为。该传递只补充 `PATH`，不复制主进程其他环境变量、不改写存活 shell 环境、不写用户 dotfile、不持久化路径，也不改变 Windows Profile 和大小写不敏感的环境覆盖规则。

可创建发现按 registry 顺序检查完整 catalog，只返回 `installed` descriptor 及其版本快照；`missing`、`upgrade_required` 和 `temporarily_unavailable` 都不进入创建候选。新建选择器只消费该专用结果，不得先投影静态 catalog。用户选定后，`CreateWorkspaceAgentUseCase` 必须以 `refresh` 再检查一次；只有仍为 `installed` 才构造并保存稳定 Agent，状态已经变化时以 `AGENT_PROVIDER_UNAVAILABLE` 失败且不产生持久化事实。

增加基础 Agent CLI 时，只需在 Provider 模块实现包含图标的 descriptor、detector 和 launcher，补充 contract/参数/清理测试，并在 composition root 注册。任意已注册 descriptor 都必须沿同一 Provider-neutral IPC 和 Presentation 投影；安装后会自动进入可创建发现，未安装时仍只存在于支持 catalog。新增 Provider 不得要求修改 `AgentConsole`、选择器或其他表现层组件。可选能力通过 contribution 增加；确需新的通用用户能力时，必须先扩展 capability 契约，并让所有现有 Provider 明确声明支持或诚实降级，不得在 Agent domain、Run domain、通用 IPC 或 Presentation 中按 Provider ID 分支。

## 工作区身份与 Git 元数据

- Agent 画布身份遵循 `projectId + workspaceId + agent + agentId`，其中对象类型使用 Shared Kernel 的规范值。
- 工作区目录和 Git 分支是启动与显示元数据，不参与 Agent、terminal owner 或 Provider 对话身份。
- 默认工作区在普通分支、非 Git 状态或 detached HEAD 之间变化时，必须复用同一个 Agent terminal、PTY 和 Provider session ref。
- 物理工作区被归档、移除或目录重绑定时，Project 才通过 `WorkspaceAgentLifecyclePort` 协调目录内全部 Agent；详情见[项目与分支工作区生命周期](../project/workspace-lifecycle.md)。

## 运行时生命周期

附加 Agent 时，应用层依次：

1. 建立 `projectId + workspaceId + agentId` 对话作用域，并重新确认项目、物理工作区目录和 Agent 定义仍有效。
2. 按该稳定身份串行 attach、挂起、恢复、重配和释放，阻止迟到 renderer 命令穿过生命周期 lease。
3. 读取稳定 Agent 的固定 Provider 和唯一 session ref；“新对话”先等待在途绑定保存，再清除该引用。
4. 需要创建新 terminal 时，先通过共享可用性服务刷新固定 Provider 的检测环境并取得预检快照，完成 POSIX login-shell PATH 水合；然后由 Agent terminal adapter 把路径快照显式传给 Run，创建或复用 agent-owned terminal。新 terminal 取得唯一 `sessionId` 和 `terminalViewIdentity`，复用时只更新回调与尺寸；后续 foreground launch 把本次检测后的路径作为实时 shell PATH 的补充，已有同名工具仍按 shell 原有优先级选择。
5. 能力开启时注册本 launch 独立的 CleanCode MCP URL、Bearer Token 和审批作用域；registration handle 精确拥有这一代注册，旧 handle 的释放或回调不能影响替代注册。
6. 在生成 Provider 启动计划前验证固定 Provider；新 terminal 消费第 4 步的预检快照，既有 terminal 上的重新启动则刷新共享可用性结果。不可用时保留稳定 Agent 和既有 terminal 事实，但拒绝创建新的 Provider launch。
7. Provider 生成启动计划；使用正式 session 参数的 Provider 可以同时给出候选 fresh session ref。Run 在长期 shell 中启动带 `launchId + generation` 的 `ForegroundJob`，候选引用在此之前不得持久化。
8. session ref 只能由 Provider 正式结构化报告，或在仍匹配当前 Agent runtime session 与 Provider launch generation 的 `ForegroundJob` 启动回调中确认候选引用。同一引用的连续重复报告必须幂等合并；当前 generation 报告不同引用时必须接受切换。应用层为每个 Agent 建立独立的有序持久化通道，按接受顺序保存并只允许最后一个序号更新运行时绑定，因此较旧写入即使晚完成也不能成为最终恢复事实。旧 generation 和已经失效的 runtime 事件必须忽略；当前 generation 在有意关闭期间到达的最终身份仍必须进入同一有序通道。尚未产生可恢复对话的 Provider 启动事件不得提前建立稳定绑定。activity 同样只接受匹配当前 generation 的结构化回调。Provider launch 启动后独立进入 `running`；CleanCode MCP 继续等待认证后的 `initialize` + `notifications/initialized` 握手。注册失败投影为 `failed`；当前 launch started 后等待 30 秒仍未完成握手投影为 `degraded`，但保留端点并允许迟到握手恢复为 `ready`。两种状态都不得中断 Provider launch，旧 generation 的期限或握手也不得覆盖当前状态。

Renderer 将首次 attach、重新启动和新对话请求投影为独立的 `measuring / pending / failed` 操作状态，不用 `null session` 冒充失败含义。失败必须保留可重试提示；同一作用域的重复重试只能形成一个在途 attach。已有 terminal binding 在重新启动或新对话 attach 失败时继续可用，旧工作区迟到的成功或失败结果不得覆盖当前作用域。该操作状态是 Presentation 的易失事实，不进入 `AgentRuntimeSnapshot`、持久化 schema 或 Provider capability。

Provider CLI 自然退出或处理 `Ctrl+C` 后，Agent launch 状态变为 `exited`、activity 变为 `unavailable`，停止新的 MCP 调用并释放 launch 临时资源；Run terminal、权威屏幕和 shell 保留。用户可以继续使用 shell、恢复当前对话或开始新对话。shell/PTY 自身退出才清空 terminal identity 并使整个运行时不可输入。

该基础终端能力必须同时支持 macOS、Linux 和 Windows。macOS/Linux 由 POSIX PTY/shell 承载，并在 Provider 检测前完成上述 login-shell PATH hydration；Windows 由 node-pty ConPTY 和 PowerShell/PowerShell Core 承载，并兼容 Provider 的 npm `.cmd` shim。平台模拟、PowerShell 脚本文本断言或 fake process 只能证明编码和契约，不能替代对应原生平台上的检测、PTY 中断、launch 退出和 shell 继续可写集成测试。

应用层只发布带单调 `revision` 的 `AgentRuntimeSnapshot`，不再维护互相竞争的扁平状态。它包含五条独立事实轴：

- `terminal`：长期 PTY/shell 的 starting、running、suspended、exited 或 failed，以及 process/view identity 和停止原因。
- `launch`：当前 Provider 前台任务的 generation、launchId、not_started、launching、running、stopped、exited 或 failed。
- `mcp`：disabled、unsupported、inactive、initializing、ready 或 failed。
- `binding`：unbound、persisting、persisted 或 persistence_failed；保存恢复引用失败不能把仍在工作的 launch 误报为失败。
- `activity`：idle、working、waiting_input、waiting_approval 或 unavailable；不支持结构化 telemetry 的 Provider 必须使用 unavailable，不能按输出频率猜测。

## 全局活动注册表与完成事件

`AgentActivityRegistry` 是进程内、Provider-neutral 的全局状态事实源。它按完整 terminal generation 注册终端，再按 Provider invocation 接受单调 `sourceRevision`；聚合优先级为 `waiting_approval > waiting_input > working > idle > unavailable`。替代 generation、旧 launch、重复 revision、已经退出的 invocation 和已经释放的 terminal 都必须被拒绝，任何一个投影监听器失败也不能阻断其他监听器或 Provider Hook。

从活动状态回到 `idle`，或 Provider 显式报告回答完成时，Registry 按 invocation 分别进入短暂 quiet window；只有同一 invocation 重新变为 working/waiting 才取消自己的完成，其他 invocation 的活动不能吞掉它。Run 对同一完整 terminal generation 报告更大的已接纳输出 `sequence` 时，Registry 必须保留原 completion 身份并从该输出重新计算所有待发布完成的 quiet window；重复、倒退或旧 generation sequence 必须忽略，Agent 不读取或解析输出正文。窗口结束才发布带稳定 `completionId` 的 `turn_completed`，同一 source revision 只能完成一次。显式完成只会把同一 invocation 的 working/waiting 收敛为 `idle`；从 `unavailable` 收到完成时仍保持 `unavailable`。Provider/PTY 退出本身不得伪造完成；invocation 退出会从快照移除该调用，terminal 退出或 generation 释放会终结该作用域。已由显式完成或转入 `idle` 开启的 quiet window 不因随后同一 invocation 的被动 unavailable/exit 丢失，但其更新的 working/waiting 仍会取消该完成。应用重开时 Run 先恢复精确 terminal，再更新稳定 gateway manifest；没有发生在当前应用进程内的完成事件不从日志、输出或历史记录补造。

普通终端 activity 宿主是可选能力：主进程启动不等待它的初始化，launch preparation 也只在有界时间内等待并 fail-open。初始化失败不缓存 rejection，后续 terminal 可重试；关闭时必须终止 gateway 的半开请求与已知 socket，不得让可选 telemetry 阻塞窗口建立、terminal 启动或应用退出。

主进程通过全局 IPC 提供当前 terminal activity 快照，并广播 activity change 与 turn completion。Renderer 必须先订阅再读取安静 baseline，以 generation、terminal revision 和 completion ID 对账；订阅窗口内排队且与 baseline 完整 terminal identity、revision 和 status 完全相同的 waiting 仍作为 live 事实投影，但不得重复发布快照，较旧 revision 和旧 generation 继续拒绝。Completion 不存在于快照，订阅后排队的 completion 必须独立回放，不能被同 terminal 的后续聚合 revision 吞掉。`working/idle/unavailable` 进入全局状态查询但不自动产生消息，`waiting_input/waiting_approval` 与 turn completion 才按 [UI 契约](../../product/ui-contract.md)投影为应用消息；等待与完成使用不同语义槽，completion 再按 invocation 身份分槽。可见或聚焦的精确 terminal surface 仍有排队输出、恢复写入或 xterm write callback 未完成时，Renderer 必须延后完成消息；surface 隐藏、不存在或已释放时不得永久阻塞。Renderer 的来源投影必须继续携带事件已有的项目、工作区、物理目录与 Provider 身份：可见卡片只从这些事实派生“项目 · 工作区或分支”与 catalog descriptor 图标，物理目录不进入活动消息；Provider 显示名只保留给可访问语义，不能反向把 UI 推断写回 Registry。

terminal 停止原因是与状态并列的独立事实，不能从状态反推。应用层在离开 running 时同时写入 `stopReason`：应用自己请求的停止记为 `requested`，PTY 自行结束记为 `unexpected`；在途停止请求期间到达的 PTY 退出归因于该请求。只有 `exited` 和 `suspended` 携带原因，`starting`、`running` 与 `failed` 必须为空——`failed` 表示从未运行成功，没有可被停止的进程。恢复或清理失败时必须清空过期原因，不得让上一轮的停止原因继续描述当前事实。停止原因变化本身就是运行时变化，必须推进 `revision` 并发布事件。

renderer 只按完整 runtime identity、generation 和 revision 对账。attach 响应、迟到事件、旧 launch 退出或旧 registration 回调都不得覆盖更高 revision 或更新 generation。

## 管理动作

- 发现：刷新共享检测环境并从注册 catalog 中只返回当前 `installed` Provider；加载、空结果和重试是选择器的易失状态。
- 创建：从可创建发现结果中选择一次，并在保存前刷新验证 Provider 仍为 `installed` 且没有被用户禁用；MCP 初始值读取应用级新建默认并受 Provider capability 限制。失败不保存 Agent 且保留选择流程，不提供 Provider 切换。
- 列出：工作区从未初始化时原子建立空工作区；既有 Agent 不按 CLI 可用性或启用偏好过滤，只有显式创建命令会加入 Agent。
- 重命名/布局：只修改目标 Agent 的稳定事实。
- 视觉整理：CanvasArrangement 可以用稳定 Agent ID 把 Agent 控制台纳入跨类型堆叠，但整体拖动和展开/网格仍通过本上下文布局入口提交 Agent 位置；堆叠关系不改变 Agent 身份、Provider、会话或运行状态。
- 删除：停止目标 launch 和 terminal，取消审批、注销 MCP、删除定义和对话绑定；其他 Agent 不受影响。
- 重新启动：在同一 Agent terminal 创建新 generation；Provider 支持恢复时使用该 Agent 的 session ref。
- 新对话：清除该 Agent 的 session ref，在同一 Agent terminal 创建新 launch。
- 切换 MCP：先保存偏好；活动运行时会关闭旧审批和端点并建立新 session/launch，其他 Agent 不受影响。
- 修改 Provider 启动偏好：应用级保存权限模式、默认 Provider、启用集合、MCP 新建默认和逐 Provider 启动覆盖；只影响之后的创建或下一次 launch，不批量重启、不改写已有 Agent 的 MCP 开关。
- 挂起/恢复：工作目录所有权变化时停止整个 Agent terminal；失败补偿可以按稳定 Provider session ref 恢复。
- 应用退出：`prepare` 停止新附加，排空在途运行时操作，收敛工具/审批，并按 contribution 声明的有界分阶段输入请求 Agent Provider 前台 launch 正常结束；身份 reporter 与其他 launch artifact 在此期间保持可用，以接收并持久化最后的正式 session ref。随后 Run 把全部 PTY 一次性交给独立 Terminal Provider；`complete` 再关闭 launch artifact，二次排空最终绑定保存，并清除 Agent 的本地 session、runtime 和 terminal 引用。Agent 上下文不逐会话发起 PTY stop，正常退出请求超时后由 Run/Terminal Provider 的既有终止流程兜底；Agent terminal 永远不能启用退出保留，Terminal Provider 必须将其作为终止候选处理。

挂起、重配和删除仍将 PTY stop 与 launch artifact cleanup 分开提交：如果 contribution 声明了正常退出协议，先对当前 generation 单次执行有界分阶段输入并等待 launch 退出，再调用 Run stop；PTY 一旦确认停止，后续临时资源清理失败不得把 terminal 补偿回 running；失败 scope 保留并在下一次清理重试。应用退出则由 Run/Terminal Provider 作为唯一 PTY shutdown authority 批量终止 Agent terminal；Agent 的 Provider 正常退出输入只作用于 PTY 内的前台 launch，不取得 PTY stop 所有权，`prepare/complete` 也不能把清除本地引用表述成 PTY 已物理退出。全局退出会尝试全部 scope、工具、审批、持久化、artifact 与 MCP 清理并聚合报告错误，不能因一个资源失败跳过其他 Agent；Electron 停止等待后，Terminal Provider 仍负责持有并安全清理未完成的 PTY。

生命周期 lease 的 `release`、`resolve` 和 `quarantine` 语义继续由 Project 协调：清理返回不代表物理工作区归档、移除或仓储提交已经完成。默认工作区的分支 checkout 不创建 blocker。任何可能启动 terminal 或 launch 的操作都必须服从已有 blocker 并在启动前重新校验作用域。

## 实现入口

| 层级             | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain           | [`AgentSession.ts`](../../../src/contexts/agent/domain/aggregates/AgentSession.ts)、[`ProviderSessionRef.ts`](../../../src/contexts/agent/domain/value-objects/ProviderSessionRef.ts)                                                                                                                                                                                                                                                                                                                                                                                           |
| Application      | [`AgentSessionService.ts`](../../../src/contexts/agent/application/use-cases/AgentSessionService.ts)、[`AgentActivityRegistry.ts`](../../../src/contexts/agent/application/services/AgentActivityRegistry.ts)、[`ManagedAgentActivityRegistry.ts`](../../../src/contexts/agent/application/use-cases/ManagedAgentActivityRegistry.ts)、[`AgentProviderLaunchPlanFactory.ts`](../../../src/contexts/agent/application/use-cases/AgentProviderLaunchPlanFactory.ts)、[`AgentProviderContribution.ts`](../../../src/contexts/agent/application/ports/AgentProviderContribution.ts) |
| Catalog / 可用性 | [`AgentProviderRegistry.ts`](../../../src/contexts/agent/application/services/AgentProviderRegistry.ts)、[`AgentProviderAvailabilityService.ts`](../../../src/contexts/agent/application/services/AgentProviderAvailabilityService.ts)、[`DiscoverCreatableAgentProvidersUseCase.ts`](../../../src/contexts/agent/application/use-cases/DiscoverCreatableAgentProvidersUseCase.ts)                                                                                                                                                                                              |
| Persistence      | [`FileSystemAgentSessionRepository.ts`](../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentSessionRepository.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Run adapter      | [`RunAgentTerminalRuntimeAdapter.ts`](../../../src/contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Providers        | [`providers`](../../../src/contexts/agent/infrastructure/providers)、[`NodeAgentProviderShellPathHydrator.ts`](../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderShellPathHydrator.ts)                                                                                                                                                                                                                                                                                                                                                               |
| Terminal hooks   | [`terminal-activity`](../../../src/contexts/agent/infrastructure/terminal-activity)、[`agentActivityRuntimeComposition.ts`](../../../src/platform/electron-main/agentActivityRuntimeComposition.ts)                                                                                                                                                                                                                                                                                                                                                                             |
| Platform / UI    | [`agentIpcHandlers.ts`](../../../src/platform/electron-main/agentIpcHandlers.ts)、[`AgentActivityObserver.tsx`](../../../src/contexts/agent/presentation/components/AgentActivityObserver.tsx)、[`AgentCanvasContextActions.tsx`](../../../src/contexts/agent/presentation/components/AgentCanvasContextActions.tsx)、[`agentActivityStore.ts`](../../../src/contexts/agent/presentation/view-models/agentActivityStore.ts)、[`AgentConsole.tsx`](../../../src/presentation/app-shell/workbench/nodes/agent/AgentConsole.tsx)                                                   |

## 验证矩阵

PATH 的跨进程回归由 [`agent.terminal-provider-path.spec.ts`](../../../tests/integration/contexts/agent/agent.terminal-provider-path.spec.ts) 使用隔离登录配置、真实 Provider RPC 和 bash/zsh PTY 验证：后台先启动后检测、仅登录配置含 CLI 路径、项目工具与后续激活目录优先、刷新后补充新 CLI、显式覆盖与空值、带空格与单引号的目录，以及 CLI 退出后手动调用。跨平台继承、缺失路径和显式空值等边界由 [`agent.terminal-environment.spec.ts`](../../../tests/contract/contexts/agent/agent.terminal-environment.spec.ts) 覆盖。

| 层级        | 证明内容                                                                                                                                  | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 固定 Provider、最后 session ref、有序覆盖、registry、共享可用性、创建重验、空工作区初始化、统一 runtime、绑定降级与应用退出交接           | [`agent.session-ref-following.spec.ts`](../../../tests/unit/contexts/agent/agent.session-ref-following.spec.ts)、[`agent.session-service.spec.ts`](../../../tests/unit/contexts/agent/agent.session-service.spec.ts)、[`agent.workspace-agents.spec.ts`](../../../tests/unit/contexts/agent/agent.workspace-agents.spec.ts)、[`agent.provider-registry.spec.ts`](../../../tests/unit/contexts/agent/agent.provider-registry.spec.ts)、[`agent.provider-availability-service.spec.ts`](../../../tests/unit/contexts/agent/agent.provider-availability-service.spec.ts)、[`agent.create-workspace-agent-availability.spec.ts`](../../../tests/unit/contexts/agent/agent.create-workspace-agent-availability.spec.ts)、[`agent.manage-workspace-agents.spec.ts`](../../../tests/unit/contexts/agent/agent.manage-workspace-agents.spec.ts)、[`agent.unified-runtime-readiness.spec.ts`](../../../tests/unit/contexts/agent/agent.unified-runtime-readiness.spec.ts)、[`agent.application-shutdown.spec.ts`](../../../tests/unit/contexts/agent/agent.application-shutdown.spec.ts) |
| Unit        | Codex、Claude Code、OpenCode 和 Gemini 启动参数、session、Hook/插件、MCP、平台安装配方与 launch artifact 重试清理                         | [`agent.codex-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.codex-provider-contribution.spec.ts)、[`agent.additional-provider-contributions.spec.ts`](../../../tests/unit/contexts/agent/agent.additional-provider-contributions.spec.ts)、[`agent.opencode-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.opencode-provider-contribution.spec.ts)、[`agent.gemini-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.gemini-provider-contribution.spec.ts)、[`agent.session-artifact-lifecycle.spec.ts`](../../../tests/unit/contexts/agent/agent.session-artifact-lifecycle.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                               |
| Unit        | 全局五态聚合、generation/revision fence、quiet completion、托管 launch 接线、Hook 鉴权与跨平台 shim 资产                                  | [`agent.activity-registry.spec.ts`](../../../tests/unit/contexts/agent/agent.activity-registry.spec.ts)、[`agent.session-activity-registry.spec.ts`](../../../tests/unit/contexts/agent/agent.session-activity-registry.spec.ts)、[`agent.hook-gateway.spec.ts`](../../../tests/unit/contexts/agent/agent.hook-gateway.spec.ts)、[`agent.hook-identity-signer.spec.ts`](../../../tests/unit/contexts/agent/agent.hook-identity-signer.spec.ts)、[`agent.terminal-telemetry-assets.spec.ts`](../../../tests/unit/contexts/agent/agent.terminal-telemetry-assets.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Unit / UI   | 未知 Provider 通用投影、安静 baseline、全局快照、等待/完成消息、revision/completion 去重、来源定位、画布重命名/移除动作和 attach 失败隔离 | [`agent-console.provider-neutral.spec.tsx`](../../../tests/unit/presentation/agent-console.provider-neutral.spec.tsx)、[`agent-console.attach-lifecycle.spec.tsx`](../../../tests/unit/presentation/agent-console.attach-lifecycle.spec.tsx)、[`agent.activity-store.spec.ts`](../../../tests/unit/contexts/agent/agent.activity-store.spec.ts)、[`agent.canvas-context-actions.presentation.spec.tsx`](../../../tests/unit/contexts/agent/agent.canvas-context-actions.presentation.spec.tsx)、[`agent-activity-notifications.spec.tsx`](../../../tests/unit/presentation/agent-activity-notifications.spec.tsx)、[`agent-activity-notification-navigation.spec.tsx`](../../../tests/unit/presentation/agent-activity-notification-navigation.spec.tsx)                                                                                                                                                                                                                                                                                                                        |
| Unit / Gate | 自动发现内建 Provider，并拒绝 Presentation 中的具体 Provider infrastructure 引用或品牌 ID                                                 | [`check-agent-provider-boundary.spec.ts`](../../../tests/unit/support/check-agent-provider-boundary.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Integration | schema v5 严格校验、真实 Agent terminal、CLI 退出回 shell、普通终端命令 shim、Windows Codex probe bridge 与真实 Hook relay                | [`agent.session-persistence.spec.ts`](../../../tests/integration/contexts/agent/agent.session-persistence.spec.ts)、[`agent.run-terminal-provider.spec.ts`](../../../tests/integration/contexts/agent/agent.run-terminal-provider.spec.ts)、[`agent.terminal-activity-shim.spec.ts`](../../../tests/integration/contexts/agent/agent.terminal-activity-shim.spec.ts)、[`agent.terminal-activity-windows-command-shim.spec.ts`](../../../tests/integration/contexts/agent/agent.terminal-activity-windows-command-shim.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Platform    | POSIX login-shell PATH 在 Agent PTY 前水合、macOS/Linux PTY 与 Windows `.cmd`/ConPTY 的检测、退出码和 shell 存活                          | [`agent.provider-shell-path-hydrator.spec.ts`](../../../tests/unit/contexts/agent/agent.provider-shell-path-hydrator.spec.ts)、[`agent.session-provider-environment.spec.ts`](../../../tests/unit/contexts/agent/agent.session-provider-environment.spec.ts)、[`run.pty-terminal.spec.ts`](../../../tests/integration/contexts/run/run.pty-terminal.spec.ts)、[`agent.windows-provider-cli.spec.ts`](../../../tests/integration/contexts/agent/agent.windows-provider-cli.spec.ts)、[`run.windows-agent-pty.spec.ts`](../../../tests/integration/contexts/run/run.windows-agent-pty.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Contract    | Provider-neutral Agent IPC、全局 activity 查询/事件与共享终端视图身份                                                                     | [`agent.ipc.spec.ts`](../../../tests/contract/contexts/agent/agent.ipc.spec.ts)、[`agent.preload.spec.ts`](../../../tests/contract/contexts/agent/agent.preload.spec.ts)、[`run.terminal-view-ipc.spec.ts`](../../../tests/contract/contexts/run/run.terminal-view-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| E2E         | 多 Agent、工作区往返、主题、审批、创建/删除、共享 xterm，以及 CLI 内切换最后会话后的应用重启恢复                                          | [`workspace-agents.e2e.spec.ts`](../../../tests/e2e/workspace-agents.e2e.spec.ts)、[`agent-terminal-theme-workspaces.e2e.spec.ts`](../../../tests/e2e/agent-terminal-theme-workspaces.e2e.spec.ts)、[`agent-claude-session.e2e.spec.ts`](../../../tests/e2e/agent-claude-session.e2e.spec.ts)、[`agent-codex-session.e2e.spec.ts`](../../../tests/e2e/agent-codex-session.e2e.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## 维护规则

改变 Agent 身份、Provider、session ref、launch generation、attach/retry、持久化 schema、挂起恢复或删除语义时，必须同步聚合、用例、Provider contract、测试和本文。新增 Provider 不得修改核心控制流；如果需要新通用能力，应先扩展 capability 契约并证明现有 Provider 的诚实降级。
