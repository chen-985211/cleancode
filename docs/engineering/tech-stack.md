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
| 构建与开发     | electron-vite、Vite                                                                 |
| 积木画布       | React Flow（`@xyflow/react`）                                                       |
| 终端渲染与模型 | xterm.js、fit/search/serialize/Unicode 11/web-links/WebGL addons、`@xterm/headless` |
| 伪终端         | node-pty                                                                            |
| 本地运行时     | Node.js                                                                             |
| 状态管理       | React 本地状态与 hooks；当前没有集中式状态库                                        |
| 进程通信       | Electron IPC、主进程事件、本机 Unix socket / Windows named pipe 长度帧协议          |
| 持久化         | Node.js 文件系统、版本化 JSON 与 JSONL                                              |
| Agent CLI      | Codex CLI + node-pty                                                                |
| Agent 工具协议 | 本机 HTTP JSON-RPC 上的 MCP                                                         |
| 测试           | Vitest、Testing Library、Playwright                                                 |

当前没有 Monaco Editor、SQLite、Drizzle ORM、Zustand、WebSocket、electron-builder 或 Electron Forge 依赖，也没有基于这些技术的现有产品能力。

## 包管理和版本策略

项目使用 pnpm 作为唯一包管理器。

依赖版本必须使用精确版本号，不得使用 `^`、`~`、范围版本或通配版本。`.npmrc` 必须保持 `save-exact=true`。

依赖版本门禁由 `pnpm check:deps` 执行；可执行脚本以根目录 `package.json` 为唯一事实来源。

## 选择 Electron 的原因

cleancode 需要深度集成本地 CLI、伪终端、文件系统和多进程运行。Electron 的 Node.js 能力可以在保持浏览器渲染层的同时，通过主进程适配这些本地能力。

Electron 只是平台技术。领域模型和应用层不得依赖 Electron API；IPC 注册、窗口生命周期和依赖装配留在 Platform。

## 前端与画布

React 负责应用外壳和界面组件，React Flow 负责节点式画布。当前状态通过组件状态、hooks 和应用层/IPC 快照协作，没有引入 Zustand 等集中式状态库。

表现层只保存选择、悬停、编辑中表单和运行事件投影等临时状态。项目、积木图和 Agent 的已提交状态仍必须通过应用层用例读取和修改。

## 终端与运行时

node-pty 用于普通交互终端、工作流命令 PTY 和 Codex Agent PTY。renderer 中的 xterm.js 负责渲染与输入；普通终端使用 fit、search、Unicode 11、web-links 和 WebGL addons 提供尺寸、检索、统一字宽、安全链接发现与可降级加速，其中 WebGL 初始化失败或 context loss 时保留内置 DOM renderer。普通终端另外在独立本地 Provider 进程使用 `@xterm/headless`、serialize 和 Unicode 11 addons 维护权威屏幕模型、输出 sequence 与恢复 checkpoint；Electron main 通过协议版本、随机 token、Provider instance 和单 controller 本机长度帧协议代理应用层端口。Provider 入口由 electron-vite 的 main 多入口构建，并以 `ELECTRON_RUN_AS_NODE=1` 的 detached Electron 可执行文件启动，不新增守护进程依赖。具体所有权和交接协议见[终端会话生命周期](../contexts/run/terminal-session.md)。任务/服务编排见[终端依赖工作流](../contexts/run/terminal-workflow.md)。

任务完成以真实命令进程退出码为准，不解析 shell 提示符。服务就绪通过 Node.js 网络能力探测本机 TCP 端口，或按字面量匹配 PTY 输出；这些能力通过 Run 应用层端口提供。

受管本地服务使用 Node.js `net.Server` 在 `127.0.0.1` 上预留固定、首选或操作系统动态端口，并在启动 PTY 前通过显式环境变量或安全命令参数后缀注入实际端口。预留句柄不能移交给任意项目进程，因此释放预留到目标进程监听之间仍存在竞争；Run 使用有限分配/激活重试和监听所有权校验收束该窗口，不引入新的第三方依赖。

当前监听所有权验证只在 macOS 上使用系统 `/usr/sbin/lsof` 和 `/bin/ps`，通过两次监听 PID 快照、受管根进程存活检查和进程祖先关系证明监听者属于本次 PTY。Linux 和 Windows 保留 Run 应用端口边界，但当前适配器不能证明所有权时按 `unknown` 失败关闭，不把 TCP 可连接误判为服务就绪。进程清理在 POSIX 上等待异步 PTY/进程组退出；Provider metadata 和 checkpoint 中的进程信息不能脱离认证 instance、live session 与完整运行身份单独证明恢复或授权终止，也不根据 cold restore 的陈旧 PID 自动终止进程。

## Agent 集成

当前嵌入式 Agent 使用 Codex CLI。cleancode 通过 node-pty 启动独立进程，通过 Codex CLI 的正式 resume 入口恢复 thread，并由进程级 `notify` 向本机随机令牌通道报告当前 thread UUID，不扫描历史目录或修改用户全局配置。

每个运行时 Agent 拥有独立 `sessionId`、PTY 和审批队列；启用 CleanCode MCP 时才注册该会话独立的 MCP URL 与 Bearer Token，把该 Server 标记为 required、把全部当前和未来工具默认预批准，并为该 Codex 进程注入画布路由 developer instructions。Codex 子进程的 sandbox 与全局 approval policy 继续继承用户配置，CleanCode 的预批准不得扩展到 Shell、文件、Git、网络或其他 MCP；进程级画布路由不写入用户全局配置。稳定身份、能力开关与 thread 绑定见 [Agent 与会话生命周期](../contexts/agent/agent-session.md)；协议面与工具目录见 [cleancode 原生 MCP](../contexts/agent/cleancode-mcp.md)。

## 存储层

当前桌面应用在 Electron 应用数据目录中使用版本化 JSON 保存项目、积木图、工作区 Agent 定义和 Agent 会话绑定，使用 JSONL 追加 Agent 工具审计记录。Run 终端恢复目录使用独立 schema v1 JSON checkpoint 与有界 JSONL 输出记录；单文件和全局容量、冷历史数量及保留时间均有限制，损坏 session 隔离处理。

需要原子替换的 JSON 仓储采用临时文件、同步和重命名流程。所有读写必须通过应用层仓储端口完成；存储文件不是供 UI、Agent 或其他上下文直接修改的共享接口。

## 工程质量工具

当前质量工具包括：

- ESLint：检查 TypeScript、React、Node.js 脚本和测试代码。
- Prettier：统一代码、配置和 Markdown 格式。
- Vitest、Testing Library、Playwright：覆盖单元、集成、契约和端到端行为。
- Electron E2E 由 Vitest 串行编排 Playwright，并在 suite 级 global setup 中只构建一次桌面产物；默认以屏幕外非激活的真实 Electron 窗口运行并关闭 renderer 后台节流，显式可见诊断入口复用同一套测试。每个场景隔离应用状态和 Provider，清理时用认证 health 证据定位 Provider，失败诊断连同 Provider 日志保留在本地 `test-results/`。
- dependency-cruiser：检查循环依赖、不可解析依赖和 DDD/Clean Architecture 依赖方向。
- Knip：检查未使用文件、导出、依赖和脚本配置。
- Husky：保留 Git hook 运行基础；当前不启用仓库级 pre-commit hook。
- `check:deps`：检查精确依赖版本。
- `check:max-lines`：限制代码文件行数。
- `check:logging`：检查日志、错误码和 IPC 错误边界。
- `check:theme`：检查集中主题与语义颜色 token。
- `check:i18n`：使用 TypeScript AST 检查生产表现层中的硬编码第一方 UI 文案。
- `check:docs`：检查本地文档链接、Markdown 锚点、`docs` 目录归属和文档中心索引覆盖。

本地完整门禁统一通过 `pnpm pre-commit` 执行。执行顺序以根目录 `package.json` 为准，当前必须覆盖上述自定义检查、格式、Lint、类型检查、全部测试、依赖方向和未使用代码检查。

## 候选技术与触发条件

以下技术都未采用，只有满足触发条件并完成独立 Spec 后才可进入当前技术栈：

| 候选                     | 评估触发条件                                     |
| ------------------------ | ------------------------------------------------ |
| Monaco Editor            | 产品确认需要内嵌代码编辑器                       |
| SQLite + Drizzle ORM     | JSON 无法满足数据规模、查询、事务或迁移需求      |
| Zustand                  | React 本地状态导致可证明的跨组件一致性或性能问题 |
| WebSocket                | IPC 无法覆盖明确的跨进程/远程实时事件需求        |
| electron-builder / Forge | 确认安装包、签名、更新与发布流水线               |
| Tauri                    | 包体、内存或安全边界成为主要约束                 |
| tldraw                   | 产品从流程图明确转向自由画布或白板               |
| Yjs                      | 确认多人协作或离线冲突合并需求                   |

候选技术不得仅因“常见”而引入；必须说明它解决的当前问题、替代范围、迁移成本和验证方式。
