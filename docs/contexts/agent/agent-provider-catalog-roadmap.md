# Agent Provider catalog 路线图

## 定位

本文记录候选 Agent 进入 cleancode Provider registry 的分批路线。它只拥有“支持范围与后续批次”这一规划事实；当前稳定行为以 [UI 契约](../../product/ui-contract.md)和 [Agent 与会话生命周期](agent-session.md)为准，Provider 扩展架构以 [Agent 终端底座与 Provider 扩展路线图](terminal-provider-roadmap.md)为准。

未列为“已实现”的 Agent 不得出现在 cleancode 的注册 catalog、快捷菜单或安装承诺中。

## 当前批次

当前 registry 包含六个 Provider：

| Provider    | 本机目标 | 当前能力                                                     |
| ----------- | -------- | ------------------------------------------------------------ |
| Codex       | 已安装   | 会话引用、恢复、launch instructions、CleanCode MCP           |
| Claude Code | 已安装   | 会话引用、恢复、精确活动、launch instructions、CleanCode MCP |
| Pi          | 已安装   | 基础终端启动与交互                                           |
| Hermes      | 已安装   | 以 `hermes --tui` 启动的基础终端交互                         |
| OpenClaw    | 已安装   | 基础终端启动与交互                                           |
| OpenCode    | 未安装   | 既有完整 Provider 保留；未安装时只在 Agent 设置显示配置状态  |

快捷菜单只显示当前检测为 `installed` 的项目，因此当前目标体验是 Codex、Claude Code、Pi、Hermes 和 OpenClaw 五项。完整设置页继续展示 OpenCode，不因本机缺失删除既有能力。

基础终端 Provider 只承诺启动、输入、输出、resize、`Ctrl+C`、退出后保留 shell 和重启。没有正式协议证据前，不声明会话恢复、活动跟踪、CleanCode MCP 或 launch instructions。

## 候选 backlog

当前批次之外的 28 个候选记录如下：

| 类别        | 候选                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude 派生 | OpenClaude                                                                                                                                                                                                                  |
| Pi 派生     | OMP                                                                                                                                                                                                                         |
| 通用 CLI    | AutoHand、MiMo Code、Gemini、Antigravity、Aider、Goose、Amp、Kilo、Kiro、Crush、Augment、Cline、Codebuff、Command Code、Continue、Cursor、Droid、Kimi、Mistral Vibe、Qwen Code、Rovo Dev、GitHub Copilot、Grok、Devin、Ante |
| 特殊编排    | Claude Agent Teams                                                                                                                                                                                                          |

`Claude Agent Teams` 不是独立上游 CLI，而是额外依赖 Claude CLI 以及 pane 或 tmux 等进程编排；cleancode 在拥有相应的平台降级和生命周期 owner 之前不得把它当作普通 Provider 接入。

## 后续接入门槛

每个候选进入实现批次前必须分别确认：

1. 官方可执行文件名、别名、必需依赖和不支持的平台。
2. 可交互 TUI 的准确启动参数；不得把一次性 headless 命令当作 Agent terminal。
3. PATH 存在性检测不会执行第三方 CLI、触发登录、安装迁移或修改用户配置。
4. 官方配置文档入口和可离线稳定展示的品牌图标；不得依赖运行时 favicon 网络请求。
5. capability 声明具有正式协议或可重复测试证据；未知能力保持 `unsupported`。
6. Provider contribution、注册校验、创建、启动、退出、重试和至少一个原生平台 smoke test 完成。

后续批次优先按“安全检测 + 空 TUI 启动”接入基础终端能力，再为有正式会话、Hook 或 MCP 协议的 Provider 单独增加增强 contribution。不得为了扩大列表一次性引入未经独立验证的 prompt 注入、状态猜测或宿主专属 shim。
