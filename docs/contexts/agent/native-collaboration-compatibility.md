# 原生 Agent 协作兼容性与验证

## 范围与版本口径

本表记录 2026-09-07 的适配代码、上游证据和验证范围。继承 main（核对提交 a6860dcde3056be7764e9505106d123a0c895892）的既有验证事实，本次边界试验不能抹去已有通过记录。消息身份、确认、关联回复和调度仍由 [原生 MCP](cleancode-mcp.md)拥有；稳定身份和恢复仍由 [Agent 生命周期](agent-session.md)拥有。本文不建立第二套通信协议。

- **上游能力边界**：某个正式入口首次发布的版本，不能单独代表整条链路的最低版本。
- **CleanCode 兼容条件**：本实现实际需要的接口、参数和已知限制；可探测的能力以本次启动的实际 CLI 为准。
- **已验证版本**：明确写出平台、模型、场景和验证方式。“未实测”不表示“不支持”；模拟 CLI 不能证明真实 CLI 支持。

## 四种 Agent × 三个平台

“实现”表示适配代码已接入；实际平台运行结果单列。发现、创建、发送、领取、确认、关联回复共用同一组 MCP 工具，均不根据平台分叉。

| Agent       | 平台    | 原生启动、MCP、发现/创建、收发确认 | 身份绑定、恢复 | 已有会话自动继续                         | 忙碌与清理                              | 真实 CLI 记录（既有 / 本次）                                                                        |
| ----------- | ------- | ---------------------------------- | -------------- | ---------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Codex       | macOS   | 实现                               | 实现           | 官方 queue + remote app-server           | 原生队列；独立后台进程组、launch 清理   | 既有 0.153.4 双向 MCP 通过；本次 0.149.0 / gpt-5.5 新建及恢复的空闲协作通过                         |
| Codex       | Linux   | 实现                               | 实现           | 同上                                     | POSIX 进程组                            | 未实测：无 Linux 主机                                                                               |
| Codex       | Windows | 实现                               | 实现           | 同一 unix://；官方 proxy 负责 AF_UNIX    | PowerShell 参数文件、taskkill 进程树    | 未实测：无 Windows 主机                                                                             |
| Claude Code | macOS   | 实现                               | 实现           | FileChanged + asyncRewake                | 忙碌/审批时延后；单次信号领取           | 既有 2.1.261 双向 MCP 通过；本次 2.1.139 唤醒/领取/确认有实测，完整回复未通过；2.1.263 部分启动验证 |
| Claude Code | Linux   | 实现                               | 实现           | 同上，无平台禁用                         | exec-form Hook，无 shell 引号依赖       | 未实测：无 Linux 主机                                                                               |
| Claude Code | Windows | 实现                               | 实现           | 同上，无平台禁用                         | exec-form Hook，无 Git Bash 依赖        | 未实测：无 Windows 主机                                                                             |
| OpenCode    | macOS   | 实现                               | 实现           | 原生插件 SDK session.promptAsync         | 原生 busy 复核；通知去重；撤销 listener | 1.18.21：含手动创建的新建/恢复空闲协作通过；忙碌试验未完整通过                                      |
| OpenCode    | Linux   | 实现                               | 实现           | 同上，无平台禁用                         | 认证 loopback HTTP，无 Unix socket 假设 | 未实测：无 Linux 主机                                                                               |
| OpenCode    | Windows | 实现                               | 实现           | 同上，无平台禁用                         | file URL、HTTP、原生 npm 启动路径       | 未实测：无 Windows 主机                                                                             |
| Gemini CLI  | macOS   | 实现                               | 实现           | **尚无满足本方案约束的上游空闲唤醒入口** | 保留主动领取；Hook 和临时配置清理       | 0.58.0：原生 TUI、MCP 和 SessionStart 通过；模型场景被未登录阻挡                                    |
| Gemini CLI  | Linux   | 实现                               | 实现           | 同上，非平台限制                         | 保留系统策略/defaults；POSIX Hook       | 未实测：无 Linux 主机                                                                               |
| Gemini CLI  | Windows | 实现                               | 实现           | 同上，非平台限制                         | PowerShell Hook、Windows 系统路径       | 未实测：无 Windows 主机                                                                             |

既有 main 记录来自 2026-09-06 的 Codex 0.153.4 ↔ Claude Code 2.1.261 真实双向代码审查协作，含 list/send/wait 和关联回复，未向 PTY 注入协作消息，见 [原生 MCP 的既有验证记录](cleancode-mcp.md)。它没有证明更低版本、Linux 或 Windows；本次 2.1.139 的试验未完成也不推翻 2.1.261 的通过记录。

本次新增真实验证使用生产适配器、真实 PTY、生产 MCP/收件箱和受控同伴。它验证原生 CLI 收发，不等于完整 Electron UI 操作或两个真实 CLI 同时协作。通过 MCP **创建** Agent 的完整应用路径由集成/既有 E2E 覆盖，本次 CLI 驱动没有冒充真实模型已调用 create_agent。

## 上游版本与 CleanCode 实现边界

| Agent       | 上游能力最低版本及证据                                                                                                                                         | CleanCode 当前兼容条件与限制依据                                                                                                                                                                                                                                                                                                        | 已验证版本不能替代的结论                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Codex       | queue 首发 **0.149.0**；同一发布源码同时包含 remote TUI、Unix listener、proxy、thread queue 和 Windows uds 实现，见下方证据                                    | 不设置数值启用门槛。探测 queue 的 thread/message/remote、app-server listen/unix、TUI remote、proxy sock，并做真实 WebSocket upgrade；随后须有正式 thread 身份。0.149.0 是当前官方发行版的已核对下边界，macOS 完整空闲链路已实测；发行包/平台仍须通过能力探测                                                                            | 0.153.4 曾是验证样本，不能作为最低门槛；有 queue 帮助文本也不能单独证明可协作                    |
| Claude Code | FileChanged：**2.1.83**；Hook exec-form args：**2.1.139**；asyncRewake 已存在于 2.1.139 发行物，但未独立确定首次发布版本                                       | **2.1.139**，依据是本实现所有 Hook 使用 args 数组，不经过 shell；不是按开发机版本选取。默认 detector 对更早版本返回 upgrade_required；启动时的 SessionStart/认证 Hook 确认可用性，未知版本不会仅因缺少版本字符串被禁用                                                                                                                  | 2.1.261 不代表 FileChanged/asyncRewake 首发。2.1.139 的完整模型唤醒仍需正常模型服务复测          |
| OpenCode    | prompt_async 首次出现在 **1.0.111**：1.0.110 源码没有该路由，1.0.111 有；这是关键入口边界                                                                      | 不设置数值门槛。原生插件探测 get/messages/status/promptAsync；缺少接口报告 pull_only。1.0.111 源码已有这四个 SDK 方法、plugin config/chat.message/event、prompt/session 参数，但旧版内联配置不展开环境变量；本次用正式 config Hook 补齐自有认证 Header。尚未完成该发行物的完整启动/恢复验证，**不把单一入口版本宣称为完整方案最低版本** | 1.18.21 是 macOS 实测版本，不是最低门槛；SDK 模拟通过不等于早期真实 CLI 通过                     |
| Gemini CLI  | 0.58.0 源码提供 session-id、resume、prompt-interactive、MCP 与生命周期 Hook；这些接口各自的首次发布版本未完全定位。AfterAgent 是回合结束回调，不是空闲监听入口 | 无数值版本禁用；基础适配要求上述正式接口。完整原生空闲唤醒目前**没有可声明的最低兼容版本**；必须先有满足约束的上游入口                                                                                                                                                                                                                  | 0.58.0 仅是本次安装/启动验证版本；不能写成基础功能的最低兼容版本，也不能承诺未来版本均无唤醒能力 |

一手证据：

- Codex [0.149.0 发布记录](https://github.com/openai/codex/releases/tag/rust-v0.149.0)、[queue 实现](https://github.com/openai/codex/blob/rust-v0.149.0/codex-rs/tui/src/session_queue_commands.rs)、[CLI remote/proxy 参数](https://github.com/openai/codex/blob/rust-v0.149.0/codex-rs/cli/src/main.rs)、[Unix WebSocket listener](https://github.com/openai/codex/blob/rust-v0.149.0/codex-rs/app-server-transport/src/transport/unix_socket.rs)、[Windows uds_windows bind/connect](https://github.com/openai/codex/blob/rust-v0.149.0/codex-rs/uds/src/lib.rs)。本次核对 tag 对应 commit `758ef40f50c1a458425c7cfbf1eb12cbc07af0b0`。
- Claude [官方 CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)的 2.1.83、2.1.139 章节；[Hook 文档](https://code.claude.com/docs/en/hooks)的 exec form、FileChanged、asyncRewake。官方 2.1.139 发行包的 Hook schema/描述包含 asyncRewake；其发布平台包含 Darwin、Linux、Windows。仅有平台发行包不证明 Hook 场景已实测。
- OpenCode [1.0.110 server](https://github.com/anomalyco/opencode/blob/v1.0.110/packages/opencode/src/server/server.ts)、[1.0.111 server](https://github.com/anomalyco/opencode/blob/v1.0.111/packages/opencode/src/server/server.ts)、[引入 prompt_async 的提交](https://github.com/anomalyco/opencode/commit/b1aaa8570eabbec4ad0aafd988ebdd0b33f26f26)、[正式插件 API](https://opencode.ai/docs/plugins/)。本次运行版本 1.18.21 的源码 commit 为 `826d9ad46a22bef0294998e08daa3c4904fea28f`。
- Gemini [v0.58.0 CLI 参数](https://github.com/google-gemini/gemini-cli/blob/v0.58.0/packages/cli/src/config/config.ts)、[Hook reference](https://geminicli.com/docs/hooks/reference/)、[v0.58.0 shell 选择](https://github.com/google-gemini/gemini-cli/blob/v0.58.0/packages/core/src/utils/shell-utils.ts)。另核对当日主线 `85aca163f6c73ac6ce380b5447359146b8adcae4`；不能把主线当作已发布版本。

## 适配行为与剩余限制

### Codex

实际 CLI 在原 PTY 环境中探测。TUI、专属 app-server、queue 继承同一配置与环境，不接管用户 daemon。Windows 继续使用上游 AF_UNIX；**不调用 Node net.createConnection(path) 假装探测 AF_UNIX**。proxy 是字节转发，控制 socket 讲 WebSocket；就绪检测必须发送 HTTP upgrade 并核对 Sec-WebSocket-Accept，不能直接发送 JSONL。

POSIX 后台 server/proxy/queue 使用独立进程组，清理覆盖 npm 包装进程的后代；交互 TUI 留在原终端。Windows 对标准 npm Codex .cmd 进行完整模板和包入口校验，再用该脚本原本选择的 node.exe 执行官方 bin/codex.js，保留其平台选择、环境与信号逻辑，避免 8191 字符的 cmd 上限截断 CleanCode 自身的长指令。其他包装仍由 PowerShell 读取私有参数文件执行，避免巨大的 EncodedCommand；不跳过自定义包装里的逻辑。taskkill /T 清理本次拥有的进程树。该绕过接在消息 launcher 内；显式 profile 等直接退回普通启动的路径，以及自定义或尚未识别的 .cmd 模板，仍受 cmd 长度/转义限制，应选择原生 exe。这个限制来自当前 CleanCode 启动路径，不是 Windows 不支持 AF_UNIX；本次未在 Windows 实测。模板依据是 [npm cmd-shim](https://github.com/npm/cmd-shim/blob/main/lib/index.js)，官方入口见 [Codex bin/codex.js](https://github.com/openai/codex/blob/rust-v0.149.0/codex-cli/bin/codex.js)。

已有显式 remote、profile、OSS 或不能安全投影到 server 的参数继续保留普通原生启动并报告 pull_only。私有 socket 路径须小于 104 字节；过长时保留原生启动。通知使用同一 message ID 去重，但已经由上游接受的队列项无法保证撤回；最多一次安静的空读取仍是允许的竞态结果。模型本身可能要求更高 CLI 版本：0.149.0 使用本机默认 gpt-6-astra 时被服务端拒绝，改用本次明确指定的 gpt-5.5 后空闲链路通过。这是模型兼容限制，不是 queue 的首次版本。

### Claude Code

私有信号文件只写一次，认证 FileChanged Hook 只领取一次；同步 matcher 仅建立监听，不能抢走 asyncRewake Hook 的通知。保留用户 hooks/settings、动态 watchPaths 和权限。SessionStart 的正式握手决定运行期资源就绪，不能把另一 executable 的已验证版本充当当前 CLI 的事实。

用户策略禁用 Hook 或文件监听被平台策略拦截时，通知会超时/失败，收件箱消息保留。2.1.139 和 2.1.263 在本机已完成真实 MCP/身份上报；保留的 2.1.139 验证记录完成 list_agents，但未完成启动阶段所需的收件箱读取和原生回合结束。在本机现有模型配置下观察到空白输出、回合长时间未完成，以及 2.1.263 的未知模型上下文限制；追加的 2.1.139 manual 验证观察到原生空闲唤醒、wait_agent_message 领取和明确确认，但关联回复未在 180 秒内完成；因此仅记录这些已发生场景，不标记完整闭环通过。后续以 gpt-5.5、CLAUDE_CODE_EFFORT_LEVEL=low、360000 毫秒期限复测，真实会话被唤醒并领取消息后结束了回合，未执行确认及关联回复；延长等待也未通过。尚未确定是模型、CLI 还是现有路由配置导致后续动作缺失，不把它归因于版本不支持通知。没有为了测试改写全局配置或权限。

### OpenCode

launch 插件持有原生 SDK，通过带随机 token 的 loopback HTTP 接收固定提醒。早期版本（已核对 1.0.111、1.0.120、1.0.160、1.1.20、1.2.0）对 OPENCODE_CONFIG_CONTENT 直接 JSON.parse，无法展开认证 Header 的环境变量；插件使用正式 config Hook，只替换 CleanCode 的固定占位 Header，并捕获本次 launch 的凭据，不跟随之后的环境变更。依据：[1.0.111 config](https://github.com/anomalyco/opencode/blob/v1.0.111/packages/opencode/src/config/config.ts)、[插件 config 初始化顺序](https://github.com/anomalyco/opencode/blob/v1.0.111/packages/opencode/src/plugin/index.ts)、[SDK 方法](https://github.com/anomalyco/opencode/blob/v1.0.111/packages/sdk/js/src/gen/sdk.gen.ts)。它复核当前顶层会话与 busy 状态，保持上一次已提交用户消息的 agent/model/variant；不读取消息 parts，不将历史正文导出 CleanCode，不覆盖 tools、权限或系统提示。尚未提交的 TUI 本地模型/Agent 选择不属于 v1 插件可观察的会话元数据，这是当前边界。

新建手动 Agent 尚无原生 session 时，通过正式 --prompt 提交一次固定的收件箱提示，建立和 MCP 创建相同的原生会话；恢复则用 --session，并在插件初始化返回后异步调用 get 确认身份，避免插件初始化等待自身服务路由。相同通知的并发/重试共享同一个原生提交；会话切换后旧目标不会被替换成新 session。退出时关闭/撤销 listener，launch 凭据不跟随下一次启动。

### Gemini CLI

补齐 --prompt-interactive；原系统 settings 的安全策略、已有 hooks/MCP 与 system-defaults 保留，JSONC 不被静默丢弃；只在临时文件中合并。POSIX 使用 shell 单引号，Windows 按上游 PowerShell 执行语义使用 & 和单引号转义。

**空闲自动继续尚未实现**：AfterAgent 只能在已经发生的回合结束时执行；它不能让空闲会话因外部消息开始新回合。核对的 [MCP 通知处理](https://github.com/google-gemini/gemini-cli/blob/v0.58.0/packages/core/src/tools/mcp-client.ts)与 [IDE 通道](https://github.com/google-gemini/gemini-cli/blob/v0.58.0/packages/core/src/ide/ide-client.ts)没有同会话 prompt 的正式入口；ACP/独立 headless run 不满足本任务保留原交互 TUI 的约束。不能用向 PTY 塞文本代替该能力。后续需上游提供外部事件唤醒或同一 TUI session 的正式 prompt API，然后接入现有 AgentMessageWakeupPort；当前三平台都保留完整主动领取，未按平台禁用基础通信。

## 验证分类与复现

### 自动化验证

适配代码已通过 pnpm build 和 pnpm verify:full：Contract 31 文件 / 157 项、单元 450 文件 / 2696 项、集成 58 文件 / 533 项、Electron E2E 20 文件 / 56 项通过；另有 21 项跳过。均在本机 macOS 执行，不能据此标记 Linux/Windows 已实测。临时真实 CLI 调查驱动未作为仓库测试基础设施保留；撤除其脚本与配置入口后，最终 pnpm verify:full 再次通过。

- 单元：共享 AgentInboxDelivery 的 idle/busy、确认、合并、失败重试、旧 launch 回调隔离；Provider 配置与身份 codec。
- Contract/集成：四种 Provider 的初始任务；跨 Provider 的真实 MCP HTTP 收发、确认、关联回复及零 PTY 协作写入；Claude 2.1.138/139/261 及非 semver 自定义构建的模拟版本命令边界；未知版本 Hook 握手；Codex 0.149.0/未知版本的模拟 CLI、WebSocket upgrade、通知去重、孙进程清理；OpenCode 真实插件模块/HTTP + **模拟 SDK**；Gemini JSONC 策略保留与本机真实 shell 特殊路径执行。
- 标准 npm shim 的完整模板识别、超过 8191 字符参数的直接 argv 保留，以及修改过的包装拒绝绕过均由集成测试覆盖；这些跨平台运行的文件/参数测试不等于 Windows 执行。Windows 参数字符串断言只证明编码契约。Codex Windows 夹具用 socket marker 模拟上游 proxy，**不是 Windows AF_UNIX 实测**。同一集成测试在目标 OS 上运行后，才可记录该 OS 的进程/Hook 结果。
- Electron E2E 使用仓库原生运行底座与模拟 Agent CLI；它不证明真实厂商 CLI 具备所需接口。

### 既有验证、增量调查与人工复现

用户在引入协作功能的分支已手动验证的结果继续有效。本次仅需要验证改动涉及的较低版本、新增 OpenCode 通知和平台差异，不把已有链路当作未验证重新建设测试工具。本次调查中使用过临时真实 CLI 驱动；其 JSON 记录保留在本机 test-results/native-probe/，驱动及 package/knip 入口已撤除。失败记录可能含终端诊断片段，不自动上传；模型未执行要求的动作、未结束回合或原生 session.error 都不能改记为通过。

在对应原生 OS 中沿用现有 CleanCode 操作流程复现：

1. 准备目标版本的真实 CLI，记录 --version、OS/架构与所用模型；确认该 CLI 已登录且信任测试工作目录。通过现有 Provider 启动配置选择独立 executable 路径，保留用户配置和权限。Windows 同时验证 exe 与标准 npm cmd 启动方式，测试目录包含空格、中文及 shell 特殊字符。
2. 在同一工作区手动创建待测 Agent B 和通信 Agent A，确认各自的原生会话绑定及 CleanCode MCP 可用。让 A 通过 list_agents 发现 B，再以唯一 messageId 发送一条要求关联回复的测试任务；不向 B 的终端输入提醒。观察空闲 B 是否自动调用 wait_agent_message、明确确认，并通过 send_agent_message 回传相同 replyToMessageId。
3. 让 B 处理另一项任务，再由 A 连续发送两条不同 ID 的消息。确认已有任务未被中断，两条消息最终都能领取和确认；确认后不得反复出现同一唤醒。审批等待与普通忙碌分别检查。
4. 改由 A 通过 create_agent 创建 B，重复相同通信；退出、重新打开并恢复 B 后再重复，核对原生身份。对 /new、/clear 或原生会话切换，确认新绑定不接收旧 launch 的通知。
5. 退出 B 后检查本次拥有的进程、socket/HTTP listener、Hook 临时文件和凭据均已清理；重启后重新绑定。记录每个步骤的通过、失败或未实测，不把消息已入箱或通知已接受当成关联回复已完成。

Gemini 当前使用主动领取验证通信；正式空闲唤醒入口缺失单列，不向 PTY 注入文本来伪造通过。项目自动化仍执行既有 pnpm verify:full，人工复现不替代它，模拟 CLI 通过也不替代真实原生会话验证。

本次 macOS 26.5.2（25F84）arm64 的 Codex 0.149.0 和 OpenCode 1.18.21 曾完整通过默认新建/恢复链路及零新增工具调用的确认安静窗口。Codex 0.153.4 另完成 manual 空闲消息闭环；OpenCode 1.18.21 追加的 manual 模式在新建、恢复时均完成空闲唤醒、关联回复和确认安静窗口。忙碌扩展中，Codex 曾返回两条关联回复，但随后过早终止导致恢复写锁冲突；据此补上进程组后代清理测试与等待正式回合结束。后续忙碌试验仍有模型/原生会话未完成的失败记录，不能用此前空闲成功替代忙碌通过。

Gemini 0.58.0 在临时 trustedFolders 文件只信任本次仓库后，完成 MCP 初始化和 SessionStart，随后停在认证选择；没有可用的 Gemini 登录。Linux 和 Windows 没有执行主机，均未实测。补验证应在对应原生 OS 执行上述人工步骤和 pnpm verify:full，并覆盖：路径含空格/中文、npm shim 与 exe、空闲首条消息、忙碌和待审批时多条消息、重复确认、/new 或 /clear、退出后旧 token/endpoint 失效、重启恢复、手动与 MCP 创建一致性。不得用当前 macOS 结果或模拟 CLI 代替这些验收。
