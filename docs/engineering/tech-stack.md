# 技术栈说明

## 文档地位

本文只记录当前已经采用的技术、版本策略、工程工具和明确标记的候选方向。可执行依赖与脚本以根目录 `package.json` 和锁文件为最终证据；本文不得把候选库写成现有能力。

架构规则以[架构文档](architecture.md)为唯一事实来源。

## 当前技术栈

| 责任           | 当前采用技术                                                                        |
| -------------- | ----------------------------------------------------------------------------------- |
| 包管理         | pnpm                                                                                |
| 桌面壳         | Electron                                                                            |
| 前端框架       | React                                                                               |
| 类型系统       | TypeScript                                                                          |
| 构建与开发     | electron-vite、Vite、electron-builder                                               |
| 积木画布       | React Flow（`@xyflow/react`）                                                       |
| 界面图标       | Phosphor Icons（`@phosphor-icons/react`）                                           |
| 终端渲染与模型 | xterm.js、fit/search/serialize/Unicode 11/web-links/WebGL addons、`@xterm/headless` |
| 伪终端         | node-pty                                                                            |
| 本地运行时     | Node.js                                                                             |
| 状态管理       | React 本地状态与 hooks；当前没有集中式状态库                                        |
| 进程通信       | Electron IPC、主进程事件、本机 Unix socket / Windows named pipe 长度帧协议          |
| 持久化         | Node.js 文件系统、版本化 JSON 与 JSONL                                              |
| Agent CLI      | Codex CLI、Claude Code、OpenCode Provider contributions + node-pty                  |
| Agent 工具协议 | 本机 HTTP JSON-RPC 上的 MCP                                                         |
| 测试           | Vitest、Testing Library、Playwright                                                 |

当前没有 Monaco Editor、SQLite、Drizzle ORM、Zustand、WebSocket 或 Electron Forge 依赖，也没有基于这些技术的现有产品能力。

## 包管理和版本策略

项目使用 pnpm 作为唯一包管理器。

依赖版本必须使用精确版本号，不得使用 `^`、`~`、范围版本或通配版本。`.npmrc` 必须保持 `save-exact=true`。

依赖版本门禁由 `pnpm check:deps` 执行；可执行脚本以根目录 `package.json` 为唯一事实来源。

## 打包与 Preview 发布

electron-vite 负责生成 `out` 中的 main、preload、renderer 和独立 Terminal Provider 入口；
electron-builder 负责把这些入口、生产依赖和 Electron runtime 组装为安装包。用户可见产品名由
`package.json` 的 `productName` 统一定义为 `CleanCode`，内部包名保持 `cleancode`，稳定应用标识
为 `io.github.chen-985211.cleancode`。打包配置的唯一事实来源是根目录
`electron-builder.yml`，产物写入被 Git 忽略的 `release/`。

当前目标矩阵为 macOS Universal DMG/ZIP、Windows x64 NSIS 和 Linux x64 AppImage/DEB。
`node-pty` 是生产原生依赖，必须在目标操作系统安装并由 electron-builder 按目标 Electron
版本处理；Windows 开发、E2E 和打包必须从应用补丁后的源码重建，打包只接受
`build/Release/conpty.node` 并移除同架构 prebuild，禁止在重建模块不可用时静默加载未打补丁的
原生文件。其原生模块、helper 和 Windows 辅助文件显式位于 `app.asar.unpacked`。macOS
打包前同时校验 arm64/x64 `spawn-helper` 的执行权限，避免 Universal 应用只修正构建宿主架构。

`.github/workflows/release.yml` 在三个目标系统分别构建 unpacked 应用，使用打包后的真实可执行
文件运行最小终端 E2E，再生成发行格式。与 `package.json` 版本一致的 `v*` tag 会汇总产物和
SHA-256 校验文件并创建公开 GitHub Pre-release；手工触发只保留 Actions artifacts。当前
Preview 的 macOS 应用使用 ad-hoc 签名且不 notarize，Windows 安装程序未签名，发布说明必须明确
系统安全警告，且不得标记为 Latest。自动更新、正式签名和公证仍未接入。

打包版与人工测试的发布包继续使用稳定的 `CleanCode` 用户数据目录。未打包的开发运行先规范化
Electron 实际加载的源码 worktree 目录，再使用不暴露本地路径的稳定摘要选择
`CleanCode-Dev-Profiles/<profile-id>`；同一物理 worktree 重启后复用 profile，不同 worktree 的
应用状态、Chromium session 数据和单实例锁相互隔离。`userData` 与 `sessionData` 必须在 Electron
ready 和单实例锁之前一起切换。显式 `--user-data-dir` 覆盖优先，供 E2E 等隔离运行继续使用各自
的临时目录；旧 `CleanCode-Dev` 目录保留但不自动复制到新 profile。

## 选择 Electron 的原因

cleancode 需要深度集成本地 CLI、伪终端、文件系统和多进程运行。Electron 的 Node.js 能力可以在保持浏览器渲染层的同时，通过主进程适配这些本地能力。

Electron 只是平台技术。领域模型和应用层不得依赖 Electron API；IPC 注册、窗口生命周期和依赖装配留在 Platform。

## 前端与画布

React 负责应用外壳和界面组件，React Flow 负责节点式画布。当前状态通过组件状态、hooks 和应用层/IPC 快照协作，没有引入 Zustand 等集中式状态库。

第一方通用界面图标统一使用 Phosphor Icons。主画布、顶部工具栏、小地图、节点、节点菜单、快捷执行栏和 Agent 局部状态通过表现层 `WorkbenchIcons` 选择语义角色；Provider 品牌图标和产品专属几何保留为显式例外。

表现层只保存选择、悬停、编辑中表单和运行事件投影等临时状态。项目、积木图和 Agent 的已提交状态仍必须通过应用层用例读取和修改。

## 终端与运行时

node-pty 用于普通交互终端、工作流命令 PTY 和 Agent terminal；macOS/Linux 使用系统 PTY，Windows 固定使用 node-pty 随包的 ConPTY DLL，因此 Windows 最低运行边界为支持 ConPTY 的 Windows 10 1809 或更高版本。Windows 原生补丁以互斥所有权保护全局 ConPTY handle 集合，隔离子进程压力门禁同时并发 resize、clear 和 close，并要求实际加载 `build/Release` 重建模块；ConPTY 的关闭函数在创建时绑定，锁只保护 handle 的认领和移除，可能阻塞的伪控制台、pipe 和进程关闭在锁外执行。同步连接或 `CreateProcessW` 失败会回收未发布 baton、HPCON、pipe、输出 Worker 和 socket，首个输出前的重复 stop/destroy 也只触发一次 native shutdown。Windows 未显式指定 shell 时优先把真实 PowerShell 7 `pwsh.exe` 绝对路径作为默认 shell，无法解析时回退系统 Windows PowerShell 绝对路径；Store Alias 优先通过异步 readlink 取得并校验真实 package executable，只有读链失败或目标不安全时才启动最长 2.5 秒的非交互 discovery helper。自动 `pwsh.exe` 遇到同步文件缺失或 `CreateProcess` 错误时只再尝试一次系统 PowerShell，成功后短期隔离坏路径，自动链不包含 `cmd.exe`。解析结果使用可恢复的有界缓存，普通 PowerShell terminal 使用 `-NoLogo -NoExit` 且保留 Profile 加载。随包 DLL 在终端能力握手后保留 OSC 查询、鼠标模式等 VT 控制序列，避免旧版系统 ConPTY 只输出 screen buffer 差异而丢失 renderer 和权威模型必须消费的模式。Agent CLI 作为长期 shell 内的受管前台任务运行：macOS/Linux 使用 POSIX 子脚本，Windows 通过 PowerShell/PowerShell Core 子脚本，并保持 CLI 退出与外层 terminal 退出分离。renderer 中的 xterm.js 统一负责普通终端与 Agent terminal 的渲染和输入；两者使用 fit、search、Unicode 11、web-links 和 WebGL addons 提供尺寸、检索、统一字宽、安全链接发现与可降级加速，其中 WebGL 初始化失败或 context loss 时保留内置 DOM renderer。两种可见终端都通过共享 React `TerminalThemeProjection` 协调源主题与当前应用主题：wrapper 使用当前应用主题的终端背景并承载上、左、下阅读留白，直接子 viewport 使用源 palette，并且只在源主题与当前主题不一致时应用 mismatch filter。搜索、粘贴、错误、节点边框和其他第一方 chrome 均位于被过滤子树之外。独立本地 Terminal Provider 进程使用 `@xterm/headless`、serialize 和 Unicode 11 addons 维护权威屏幕模型、输出 sequence、前台任务控制和恢复 checkpoint；Electron main 通过协议版本、随机 token、Provider instance 和单 controller 本机长度帧协议代理应用层端口。Provider 入口由 electron-vite 的 main 多入口构建，并以 `ELECTRON_RUN_AS_NODE=1` 的 detached Electron 可执行文件启动，不新增守护进程依赖；普通 PTY 在合并显式命令环境前移除这一 Provider 私有标记，避免把下游 Electron 项目切换为 Node 模式。具体所有权和交接协议见[终端会话生命周期](../contexts/run/terminal-session.md)。任务/服务编排见[终端依赖工作流](../contexts/run/terminal-workflow.md)。

Windows 发布包只在确实需要启动新 Provider 时，把 Provider 的最小自包含运行闭包物化到 `%LOCALAPPDATA%/CleanCode/terminal-provider-host/<profile-id>/<content-key>`：签名 `CleanCode.exe` 的改名副本、Node 模式必需的 `icudtl.dat`/`v8_context_snapshot.bin`、可选 `snapshot_blob.bin`、`app.asar` 和对应的 unpacked `node-pty`/ConPTY runtime。物理 ASAR 必须通过 Electron `original-fs` 读取和复制，不能让 ASAR shim 把 archive 根解释为虚拟目录。稳定 `profile-id` 从 Provider 状态目录生成，使显式 profile 之间不会互相回收镜像；改名后的 `cleancode-terminal-provider.exe` 与安装目录解耦，避免 NSIS 更新按旧安装路径或 `CleanCode.exe` 镜像名终止仍拥有保留 PTY 的 Provider。冷路径内容键覆盖应用版本、Electron/架构、完整 ASAR、Electron 数据和经过架构过滤的完整 `node-pty` 闭包；发布使用带 owner/PID/heartbeat/进程 epoch 的跨进程租约、唯一 staging、marker-last 和同卷原子 rename，并在发布前按内容摘要校验整个复制闭包，残缺或关键文件失效的镜像先隔离再重建。后续主进程通过 schema v2 marker 校验构建身份、精确 Provider 入口及源/镜像文件的 size、mtime、ctime，只做目录枚举与 stat；任一指纹不匹配才回到完整内容校验与修复，避免普通启动重复读取并哈希 Electron host、ASAR 和 native runtime。启动/发布锁的生命周期变更由非空目录 guard 串行化；PID 与本机命名管道或私有 Unix socket 中的唯一 lease 共同标识进程 epoch，避免 PID 复用误判。guard 以唯一候选原子发布并通过固定 fence + 唯一退役目录安全回收；精确活跃的 guard 不可强抢，启动/发布租约以 stale heartbeat 作为挂起进程的最终恢复边界。warm 校验、发布与 prune 共用逐镜像发布锁并在返回或删除前再次验证 lease。物化失败只记录诊断并回退安装目录；迁移 host 遭 AppLocker、WDAC、AV 或缺失拒绝 spawn 时也只允许一次安装目录 host 回退，不引入其他 shell 或 Provider。metadata 记录实际 `runtimeImageKey`；当前构建和经 generation heartbeat 认证为 alive/starting 的旧镜像不会被清理，unknown liveness 会跳过整轮清理。其他镜像从首次失去 current/pin 保护时写入 retirement marker，完整保留至少 24 小时；warm、发布或重新 pin 会清除 marker，因此启动目标解析到 provisional metadata 发布之间也由新一轮宽限保护。NSIS 更新不得删除该目录；普通新安装默认固定为 current-user，显式 all-users 与既有 machine-wide 安装仍保留原作用域。只有真实卸载才用 `/T /F` 终止改名 Provider 的完整进程树并清理执行卸载账户的镜像；legacy machine-wide 卸载不会遍历或删除其他用户 profile，可能留下不再执行的惰性缓存。

每次实际 spawn 都使用新的 Provider generation，并把 `instanceId + heartbeatId` 作为 metadata、argv、generation 专属 endpoint 与 heartbeat 文件的共同 fence。Provider 核对已发布 metadata 的真实 PID 和 generation 后先创建 heartbeat，再启动服务；pulse 与启动互不阻塞。回收方只在读到的文件身份、内容和时间戳仍未变化时条件撤销 heartbeat，瞬时 I/O 失败在跨过 stale 边界前不关闭 owner，撤销后旧进程不能重建。认证连接和 endpoint 都失败后，新客户端才以 heartbeat 区分 alive/starting/dead/unknown：stale heartbeat 即使遇到 PID 复用也可安全回收，未知或损坏身份继续失败关闭。metadata 写入/删除和迟到子进程终止都受 generation guard 保护；runtime image prune 使用同一分类，保留 alive/starting，释放 dead，unknown 时跳过整轮清理；无 heartbeat 的旧 metadata 仍按 PID 保守兼容。

Windows Provider 在首次会话对账响应路径之后异步启动不进入会话模型的短命 PowerShell helper，预热随包 ConPTY DLL；helper 失败不阻断真实终端，也不引入 `cmd.exe` 产品 fallback。

Windows PowerShell/Profile 正常加载后由启动 bootstrap 在 `FullLanguage` 中 best-effort 把 Console 输入输出与 native pipeline 固定为 UTF-8；AppLocker/WDAC 强制的受限语言模式静默跳过受限构造器。同一设置在每次 Agent 前台任务 started 之前重申。输出继续原样进入 Provider 权威模型和 renderer，不增加前端过滤。

任务完成以真实命令进程退出码为准，不解析 shell 提示符。服务就绪通过 Node.js 网络能力探测本机 TCP 端口，或按字面量匹配 PTY 输出；这些能力通过 Run 应用层端口提供。

受管本地服务使用 Node.js `net.Server` 在 `127.0.0.1` 上预留固定、首选或操作系统动态端口，并在启动 PTY 前通过显式环境变量或安全命令参数后缀注入实际端口。预留句柄不能移交给任意项目进程，因此释放预留到目标进程监听之间仍存在竞争；Run 使用有限分配/激活重试和监听所有权校验收束该窗口，不引入新的第三方依赖。

监听所有权验证在三个桌面平台都执行两次监听 PID 快照、受管根进程存活检查和进程祖先关系复核：macOS 使用 `/usr/sbin/lsof` 与 `/bin/ps`，Linux 使用 `/proc/net/tcp*`、进程 fd 和 `/proc/<pid>/stat`，Windows 使用 `netstat.exe` 与 PowerShell CIM。任一系统工具不可用、监听集合变化或祖先关系无法证明时仍按 `unknown` 失败关闭，不把 TCP 可连接误判为服务就绪。进程清理在 POSIX 上等待异步 PTY/进程组退出；Provider metadata 和 checkpoint 中的进程信息不能脱离认证 instance、live session 与完整运行身份单独证明恢复或授权终止，也不根据 cold restore 的陈旧 PID 自动终止进程。

## Agent 集成

当前 registry 内建 33 个 Agent Provider。Codex、Claude Code 和 OpenCode 提供专用增强 contribution；Gemini 在数据驱动的基础终端 contribution 上组合声明式 session 与 MCP 配方；其余项目提供 PATH 检测、交互启动命令、离线品牌图标与官方文档。每个稳定 Agent 在创建时固定一个 Provider；同一工作区可以同时运行多个 Agent，不提供 Provider 切换。通用 Agent 流程只依赖 registry contribution；fresh session、session-ref codec、恢复、身份捕获、活动跟踪、launch instructions 与 CleanCode MCP 支持均由 Provider 如实声明并提供对应实现。

registry descriptor 集合是完整的受支持 Provider catalog；专用 discovery 用例通过共享 `AgentProviderAvailabilityService` 检查该 catalog，只把 `installed` Provider 投影为可创建结果。共享服务合并并发检查、缓存易失快照并支持显式刷新；Agent 创建在持久化前执行新的可用性检查，已有持久化 Agent 则不因当前 CLI 不可用而从工作区消失。新工作区始终原子初始化为空 Agent 列表，只有用户明确执行新建操作后才检查 Provider 并创建 Agent。

macOS/Linux 上的 `NodeAgentProviderShellPathHydrator` 在检测前通过当前 POSIX shell 的交互式 login invocation 获取用户 PATH，并把去重后的 shell 路径优先合并进 Electron 主进程环境；需要新建 Agent PTY 时，这一步和可用性预检必须在 PTY 快照主进程环境之前完成。超时或异常时保留继承 PATH。Windows 跳过 POSIX hydration，Provider CLI 检测继续通过参数边界明确的 PowerShell 调用兼容 npm `.cmd` shim；任何平台都不得把 executable 或 argv 拼接成可注入的命令文本。

共享 CLI detector 可以区分 `installed`、`missing`、`upgrade_required` 和 `temporarily_unavailable`。基础终端目录只检查 PATH 上的主命令、别名和必需伴随命令，不执行第三方 CLI。只有声明最低版本的 Provider 才进行语义版本比较；当前 Claude Code 要求 `2.1.119` 或更高版本，其他 Provider 不得虚构 `upgrade_required`。版本与安装结果是应用级易失快照，不是 Agent 或对话的持久化事实。

每个运行时 Agent 拥有独立 `sessionId`、Run `agent` owner terminal、前台 launch 和审批队列，并分别投影 terminal、launch、activity、MCP readiness 与 Provider-session binding。Codex 通过正式 `resume`、`tui.terminal_title`、`app-server thread/list`、进程级 `notify` 和精确信任的退出 Hook 报告或补全当前 thread UUID，不声明精确活动跟踪；Claude Code 通过正式 session ID、resume 参数和带随机令牌的 Hook relay 报告会话与活动；OpenCode 通过 `opencode-session`、`--session` 和 launch 级 `file://` 插件事件报告会话与活动，并以合并后的 `OPENCODE_CONFIG_CONTENT` 注入远程 MCP 与临时 instructions；Gemini 通过正式 `--session-id` 接受 cleancode 预分配 UUID，在 launch 启动后确认绑定并以 `--resume` 恢复，同时通过临时 system settings 注入 MCP。四者的 Token 都只经进程环境传递，配置不得写入用户工作区或全局目录。

CleanCode MCP 与 Provider launch 使用独立状态轴：支持该能力的 Provider 在 MCP 初始化或失败时仍可正常运行；注册失败或认证握手超时只把 MCP 投影为 `failed`。Provider session ref 保存失败只把 binding 标记为 `persistence_failed`，不得把仍在运行的 launch 或活动误报为失败。稳定身份、能力开关与 Provider session ref 见 [Agent 与会话生命周期](../contexts/agent/agent-session.md)；协议面与工具目录见 [cleancode 原生 MCP](../contexts/agent/cleancode-mcp.md)。

## 存储层

当前桌面应用在按运行渠道和开发源码 worktree 隔离的 Electron 应用数据目录中，以 `project-state-v2` 作为当前业务状态根，使用版本化 JSON 保存项目、积木图、应用级收藏模板库、工作区 Agent 定义和 Agent 会话绑定，使用 JSONL 追加 Agent 工具审计记录。积木图只接受 v2，收藏模板库使用独立的 `block-template-library.json` 并只接受 schema v1，Agent 定义只接受 schema v5；图和 Agent 都以稳定 `workspaceId` 定位，模板库则以稳定 `projectId` 区分项目作用域并保留独立的全局作用域。项目内 `.cleancode` 和旧应用状态根不会被读取、迁移或回写。产品尚未公开期间旧测试数据不构成兼容性约束，旧状态保留在原位置但不加载。发布包与人工发布测试共享正式目录，每个未打包源码 worktree 使用稳定独立的开发 profile，自动化测试通过显式临时目录隔离。Run 终端恢复目录使用独立 schema v2 JSON checkpoint 与 schema v1 有界 JSONL 输出记录；单文件和全局容量、冷历史数量及保留时间均有限制，损坏 session 隔离处理。

需要原子替换的 JSON 仓储采用临时文件、同步和重命名流程。所有读写必须通过应用层仓储端口完成；存储文件不是供 UI、Agent 或其他上下文直接修改的共享接口。

## 工程质量工具

当前质量工具包括：

- ESLint：检查 TypeScript、React、Node.js 脚本和测试代码。
- Prettier：统一代码、配置和 Markdown 格式。
- Vitest、Testing Library、Playwright：覆盖单元、集成、契约和端到端行为。
- Electron E2E 由 Vitest 编排 Playwright；本地调用在 suite 级 global setup 中只构建一次桌面产物并串行执行。CI 在 Ubuntu 24.04、macOS 15 和 Windows 2025 分别构建系统原生 `out` artifact，每个平台再分到三个隔离 shard；Linux 通过 Xvfb 提供显示服务器，每个 shard 内仍串行。`pnpm test:e2e:smoke` 提供本地关键路径反馈，`pnpm test:e2e` 运行完整套件。两者默认以屏幕外非激活的真实 Electron 窗口运行并关闭 renderer 后台节流，显式可见诊断入口复用同一套测试。每个场景隔离应用状态和 Provider，清理时用认证 health 证据定位 Provider，失败诊断连同 Provider 日志保留在本地 `test-results/`。
- Preview 打包矩阵额外通过 Playwright `executablePath` 启动 unpacked 应用，复用确定性终端场景证明 ASAR、独立 Provider、`node-pty` 和平台原生 Electron 可执行文件能够组合运行；这条验证不替代三平台完整源码 E2E。
- dependency-cruiser：检查循环依赖、不可解析依赖和 DDD/Clean Architecture 依赖方向。
- Knip：检查未使用文件、导出、依赖和脚本配置。
- Husky：保留 Git hook 运行基础；当前不启用仓库级 pre-commit hook。
- `check:deps`：检查精确依赖版本。
- `check:max-lines`：限制代码文件行数。
- `check:logging`：检查日志、错误码和 IPC 错误边界。
- `check:agent-provider-boundary`：自动发现内建 Provider，并阻止生产表现层依赖具体 Provider infrastructure 或品牌 ID。
- `check:theme`：检查集中主题、语义颜色 token 与由主题 CSS 生成的 canonical terminal palette。
- `check:motion`：检查生产 CSS 动效只消费语义时长与曲线 token；持续 spinner、reduced-motion clamp 和登记过的专属 motion owner 作为显式例外。
- `check:i18n`：使用 TypeScript AST 检查生产表现层中的硬编码第一方 UI 文案。
- `check:portable-paths`：使用 TypeScript AST 阻止生产代码和测试手工拼接文件系统分隔符，以及用单平台绝对路径正则断言平台中立路径。
- `check:test-stability`：使用 TypeScript AST 阻止 Electron E2E 固定等待、原始 timer sleep、直接 `expect.poll` / `vi.waitUntil`、自动重试和捕获后重复场景动作；Node 侧状态轮询统一由测试支撑收口并保留最后观测诊断。
- `check:docs`：检查本地文档链接、Markdown 锚点、`docs` 目录归属和文档中心索引覆盖。

本地完整门禁统一通过 `pnpm pre-commit` 执行。执行顺序以根目录 `package.json` 为准，当前必须覆盖 `pnpm check:quality`、全部 unit/integration/contract 和完整 Electron E2E。CI 对每个 Pull Request 和 `main` 同时运行三平台全量质量矩阵与三平台 E2E 分片，不使用路径过滤。

## 候选技术与触发条件

以下技术都未采用，只有满足触发条件并完成独立 Spec 后才可进入当前技术栈：

| 候选                 | 评估触发条件                                     |
| -------------------- | ------------------------------------------------ |
| Monaco Editor        | 产品确认需要内嵌代码编辑器                       |
| SQLite + Drizzle ORM | JSON 无法满足数据规模、查询、事务或迁移需求      |
| Zustand              | React 本地状态导致可证明的跨组件一致性或性能问题 |
| WebSocket            | IPC 无法覆盖明确的跨进程/远程实时事件需求        |
| Tauri                | 包体、内存或安全边界成为主要约束                 |
| tldraw               | 产品从流程图明确转向自由画布或白板               |
| Yjs                  | 确认多人协作或离线冲突合并需求                   |

候选技术不得仅因“常见”而引入；必须说明它解决的当前问题、替代范围、迁移成本和验证方式。
