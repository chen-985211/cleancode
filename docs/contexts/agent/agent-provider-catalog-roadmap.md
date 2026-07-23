# Agent Provider catalog 路线图

## 定位

本文记录 Agent 进入 cleancode Provider registry 的支持范围与增强路线。当前稳定行为以 [UI 契约](../../product/ui-contract.md)和 [Agent 与会话生命周期](agent-session.md)为准，Provider 扩展架构以 [Agent 终端底座与 Provider 扩展路线图](terminal-provider-roadmap.md)为准。

未进入下表的 Agent 不得出现在 cleancode 的注册 catalog、快捷菜单或安装承诺中。

## 当前目录

当前 registry 固定包含 33 个 Provider。目录中的每项都提供稳定 ID、离线图标、官方文档地址、PATH 检测元数据、交互启动命令和已知的 Yolo 参数或环境变量；设置页始终展示完整目录，快捷菜单只展示本机检测为 `installed` 且没有被用户禁用的项目。

| 能力层级      | Provider                                                                                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 增强 Provider | Codex、Claude Code、OpenCode                                                                                                                                                                                                                                               |
| 基础终端      | OpenClaude、Grok、GitHub Copilot、MiMo Code、Ante、Pi、OMP、Gemini、Antigravity、Aider、Goose、Amp、Kilocode、Kiro、Charm、Auggie、Autohand Code、Cline、Codebuff、Command Code、Continue、Cursor、Droid、Kimi、Mistral Vibe、Qwen Code、Rovo Dev、Hermes、Devin、OpenClaw |

增强 Provider 具有正式的 session ref、恢复、活动或 CleanCode MCP contribution；基础终端 Provider 只承诺启动、输入、输出、resize、`Ctrl+C`、退出后保留 shell 和重启。没有正式协议证据前，不声明会话恢复、活动跟踪、CleanCode MCP 或 launch instructions。

Hermes 固定以 `hermes --tui` 进入全屏交互界面，OpenClaw 固定以 `openclaw tui` 启动，Kiro 以当前默认 TUI 命令 `kiro-cli chat` 启动，Command Code 以 `cmd --trust` 启动，Rovo Dev 以 `acli rovodev run` 启动。

## 设置与检测

设置页把目录分为：

- `已安装`：当前 PATH 检测成功；可以启用或禁用、设为默认、打开官方文档和编辑启动覆盖。
- `可安装`：未安装、需要升级或暂时不可用；只提供状态与官方安装文档，不自动执行安装脚本。

检测只检查可执行文件是否存在，不执行第三方 CLI，不触发登录、升级或配置迁移。别名检测当前用于 Mistral Vibe 的 `vibe` / `mistral-vibe`；复合启动项必须同时满足其真实依赖。检测得到的版本字符串只用于状态，不出现在新建 Agent 的快捷菜单。

应用级 Agent 偏好独立持久化，默认权限模式为 `Yolo`，默认“新 Agent 启用 CleanCode MCP”为开。MCP 默认值只初始化之后新建的 Agent，并且仍受 Provider capability 约束，不改写已有 Agent。禁用 Provider 只阻止之后从快捷菜单创建；既有 Agent 保持稳定 Provider，仍可按其配置重新启动。

启动配置按固定层级合并：

1. 内建交互命令、基础参数与环境变量。
2. 当前权限模式管理的 Yolo 参数或环境变量。
3. 用户为该 Provider 保存的命令、附加参数与环境变量覆盖。
4. 系统拥有的 session 恢复、遥测、工作目录与 CleanCode MCP 参数。

因此用户覆盖不能删除或替换系统拥有的恢复、遥测和 MCP 注入。更改在下次启动或重启 Agent 时生效。

## 后续增强

后续工作不再以“把名称放入目录”为目标，而是逐个验证正式协议后增强能力：

1. 会话引用与恢复。
2. 结构化活动状态和审批状态。
3. launch instructions。
4. CleanCode MCP；未验证前必须保持 `unsupported`。
5. 原生平台的检测、PTY 中断、退出回 shell 和恢复 smoke test。

任何增强都不得依赖终端文本猜测会话身份或活动，也不得修改用户全局 CLI 配置。
