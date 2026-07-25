# Agent Provider catalog 与能力演进

## 文档地位

本文记录 cleancode 当前正式支持的 Agent Provider catalog、共同能力、可选增强能力和后续能力演进约束。

Agent 身份、固定 Provider、可创建发现和运行时生命周期以 [Agent 与会话生命周期](agent-session.md)为准；用户可见行为以 [UI 契约](../../product/ui-contract.md)为准；Provider 扩展架构以 [Agent 终端底座与 Provider 扩展路线图](terminal-provider-roadmap.md)为准。本文不替代这些稳定行为 owner，也不把尚未实现的能力写成当前承诺。

## 支持口径

registry descriptor 集合是 cleancode 正式支持的完整 Provider catalog。一个 Agent 进入 catalog，表示 cleancode 已为它注册稳定 ID、离线图标、官方文档、可用性检测和交互启动配置，并能通过统一的 Agent terminal 运行。

“已支持”和“本机当前可创建”是两个不同事实：

- 已注册 Provider 都属于正式支持 catalog，不因本机没有安装对应 CLI 而失去支持身份。
- 只有当前检测为 `installed` 且未被用户禁用的 Provider 才进入本次新建 Agent 的候选列表。
- Provider 是否具有会话恢复、活动跟踪或 CleanCode MCP 等可选能力，不构成支持等级。未声明增强能力的 Provider 仍然是正式支持的 CLI Agent。

未注册的 Agent 不得出现在快捷菜单、设置 catalog 或对外支持承诺中。

## 当前 catalog

当前 registry 内建 33 个 Agent Provider，并按市场认知、CLI 社区活跃度与 cleancode 场景相关性维护产品展示顺序：

Claude Code、Codex、OpenCode、Gemini、Cursor、GitHub Copilot、OpenClaw、Hermes、Pi、Cline、Goose、Aider、Continue、Charm、Kilocode、Qwen Code、Kimi、Amp、Grok、Droid、Antigravity、Kiro、Mistral Vibe、MiMo Code、OpenClaude、OMP、Devin、Auggie、Codebuff、Autohand Code、Command Code、Ante、Rovo Dev。

每个 Provider 都提供内建启动 metadata；经过验证且确有需要的 Provider 还会提供 Yolo 权限参数或环境变量。没有专用 Yolo 配置的 Provider 继续使用其内建交互启动方式，不得虚构第三方 CLI 参数。

以下 Provider 使用适配后的交互启动入口：

- Hermes：`hermes --tui`
- OpenClaw：`openclaw tui`
- Kiro：`kiro-cli chat`
- Command Code：`cmd --trust`
- Rovo Dev：`acli rovodev run`

## 当前能力矩阵

| 能力                             | Provider                             | 当前保证                                                                                                               |
| -------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 基础终端运行                     | 全部 33 个 Provider                  | 启动、输入、输出、resize、`Ctrl+C`、CLI 退出后保留 shell，以及重新启动                                                 |
| 正式 session ref、身份捕获与恢复 | Codex、Claude Code、OpenCode、Gemini | 只使用 Provider 正式协议建立和恢复对话；Gemini 的预分配 ref 只在本次 launch 启动后确认；不扫描历史目录或从终端文本猜测 |
| launch instructions              | Codex、Claude Code、OpenCode         | 只向当前 launch 注入经过维护的画布路由语义，不修改用户全局配置                                                         |
| 结构化活动状态                   | Claude Code、OpenCode                | 由正式 Hook 或插件事件投影；其他 Provider 不从输出频率猜测活动                                                         |
| CleanCode MCP                    | Codex、Claude Code、OpenCode、Gemini | 共用同一 Server、鉴权、工具、审批与失败语义；MCP 初始化或失败不阻止 Provider launch，能力状态独立呈现                  |
| 其他未声明的可选能力             | 各 Provider 按 descriptor 独立声明   | 保持诚实降级；不能因为已经支持基础终端、会话或 MCP 中的一项，就展示未实现的 activity、instructions 或其他 capability   |

该矩阵描述的是可选 capability，不是产品支持层级。无论是否具有增强 capability，catalog 中的 33 个 Provider 都属于 cleancode 当前正式支持的 Agent。

## 检测与可创建性

列出 registry descriptor 本身不执行任何第三方 CLI。只有需要判断本机可用性时，系统才通过共享的 `AgentProviderAvailabilityService` 执行检测：

- 基础终端 Provider 只检查 PATH 上的主命令、别名和必需伴随命令，不执行第三方 CLI。
- Codex、Claude Code 和 OpenCode 执行受超时约束的版本命令，用于确认 CLI 可用性并读取版本。
- 当前只有 Claude Code 声明最低版本 `2.1.119`；其他 Provider 不得因虚构的版本门槛返回 `upgrade_required`。
- Mistral Vibe 同时识别 `vibe` 与 `mistral-vibe`；具有复合依赖的 Provider 必须确认全部真实依赖。

cleancode 不主动执行第三方安装、升级、登录或配置迁移命令。检测结果是应用级易失快照，可以是 `installed`、`missing`、`upgrade_required` 或 `temporarily_unavailable`，不是 Agent 或对话的持久化事实。

设置页展示完整 catalog，并将其分为：

- `已安装`：当前检测成功；可以启用或禁用、设为默认、打开官方文档和编辑启动覆盖。
- `可安装`：缺失、需要升级或暂时不可用；只提供检测状态与官方安装文档，不自动执行安装脚本。

新建 Agent 的快捷菜单只展示当前检测为 `installed` 且未被禁用的 Provider，不展示 detector 版本、能力徽章或不可用项目。已持久化 Agent 不按当前安装状态或启用偏好过滤；CLI 后来不可用时，稳定 Agent 身份仍然保留。

## 偏好与启动配置

应用级 Agent 偏好独立持久化，默认权限模式为 `Yolo`，默认“新 Agent 启用 CleanCode MCP”为开。

- Yolo 模式只对声明了已验证权限配置的 Provider 注入对应参数或环境变量。
- MCP 默认值只初始化之后新建的 Agent，并继续受 Provider capability 约束，不批量改写已有 Agent。
- 禁用 Provider 只阻止之后的新建操作，不删除或阻止已有 Agent 按原 Provider 重新启动。
- Provider 在 Agent 创建后保持固定；需要其他 Provider 时必须新建 Agent。

启动配置按固定层级合并：

1. 内建交互命令、基础参数与环境变量。
2. 当前权限模式对应的、已经验证的参数或环境变量。
3. 用户为该 Provider 保存的可执行文件、附加参数与普通环境变量覆盖。
4. 系统拥有的 session 恢复、遥测、工作目录与 CleanCode MCP 参数。

用户覆盖不能删除或替换系统拥有的恢复、遥测、安全控制和 MCP 注入。偏好与覆盖在下次启动或重启 Agent 时生效。

## 能力演进

后续工作不以“把名称放进 catalog”冒充能力完成。Provider 的新能力只有同时满足以下条件，才能从基础终端能力升级为当前产品承诺：

1. 有可验证的第三方正式协议、命令参数、Hook、插件事件或结构化接口。
2. descriptor 如实声明 capability，并提供与声明一致的 contribution。
3. 覆盖检测、参数、会话隔离、失败降级和资源清理测试。
4. 在支持的原生平台验证启动、PTY 中断、退出回 shell；涉及会话能力时继续验证恢复。

只需要正式 session 参数和 MCP 配置注入的 Provider，应优先复用声明式 `freshSession / resume / sessionRefCodec` 与 launch-scoped MCP injector；只有需要 Hook、插件、结构化 reporter 或特殊握手的 Provider 才增加专用适配器。共同的绑定持久化、MCP Server、鉴权、审批、runtime 状态和 UI 投影保持 Provider-neutral。

可继续逐个 Provider 评估的能力包括：

- 正式 session ref、身份捕获与恢复。
- 结构化活动状态和审批状态。
- launch instructions。
- CleanCode MCP；没有验证和实现前必须声明为不支持。

任何增强都不得依赖终端文本猜测会话身份或活动，不得修改用户全局 CLI 配置，也不得在通用 Agent、Run、IPC 或 Presentation 路径中按 Provider ID 写品牌分支。
