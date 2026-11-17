# 日志与错误规范

## 文档地位

本文定义 cleancode 的诊断日志、应用错误、IPC 错误传递和日志门禁规则。

本文不定义业务事实来源。业务规则仍以 [架构文档](architecture.md) 中定义的领域层、应用层用例和应用层端口为准。

本文不重新定义 Agent 审计协议。Agent 工具调用历史属于 Agent 上下文，当前由追加式 JSONL 审计仓储保存，不能和普通诊断日志混用；具体工具状态见 [cleancode 原生 MCP](../contexts/agent/cleancode-mcp.md)。

## 目标

日志规范必须同时满足：

- 用户能看到稳定、可理解的错误提示。
- 开发者能从日志中定位失败的上下文、操作、耗时和错误码。
- AI 或开发者新增代码时，违规写法能被本地门禁发现。
- 日志不成为业务状态事实来源。

## 日志类型

### 诊断日志

诊断日志用于排查运行时问题，例如 IPC 调用失败、Git 操作失败、PTY 启动失败、项目元数据损坏。

诊断日志由平台层 logger 输出。领域层和应用层不得直接写日志。

### 用户提示

用户提示由表现层根据稳定错误码映射生成。

表现层不得解析 `error.message` 来判断业务错误。

### 审计记录

当前审计记录用于保存运行期 Agent 工具调用的会话、工作区、工具、输入、审批属性和 `started`、`awaiting_approval`、`completed`、`failed` 等状态。

审计记录不属于诊断日志体系，也不是命令日志。当前没有审计回放、撤销或从审计重建业务状态的能力；业务事实仍以目标上下文聚合和仓储为准。

## 日志字段

每条结构化日志至少应支持以下字段：

```json
{
  "timestamp": "2026-07-06T21:40:12.321Z",
  "level": "warn",
  "scope": "project.git",
  "operation": "createBranchWorkspace",
  "outcome": "failure",
  "durationMs": 43,
  "correlationId": "createBranchWorkspace-lx0",
  "error": {
    "code": "GIT_BRANCH_ALREADY_EXISTS",
    "isExpected": true,
    "message": "Git branch already exists."
  }
}
```

字段含义：

- `timestamp`：日志发生时间。
- `level`：`debug`、`info`、`warn` 或 `error`。
- `scope`：日志来源，例如 `project.git`、`project.workspace`、`block-graph`、`run.terminal`、`run.service-port`。
- `operation`：应用动作，例如 `createBranchWorkspace`。
- `outcome`：`success` 或 `failure`。
- `durationMs`：操作耗时。
- `correlationId`：一次 IPC/用户操作的关联 ID。
- `error.code`：稳定错误码。
- `error.isExpected`：是否为预期业务失败。
- `error.message`：开发诊断消息，不直接作为用户提示。

## 日志级别

- `debug`：开发期细节，默认不得在普通运行中输出到控制台。
- `info`：关键操作成功，例如打开项目、切换工作区、创建终端积木。
- `warn`：预期业务失败，例如分支已存在、worktree 有未提交更改。
- `error`：非预期异常，例如未分类系统异常、数据损坏、外部能力异常。

预期业务失败不得作为 raw stack 穿过 Electron IPC。

成功日志必须显式声明。IPC handler 的成功路径默认不记录日志，只有关键用户动作才允许配置为 `info`。

高频 UI 同步、恢复流程和生命周期噪声不得配置为 `info`，例如：

- 画布视口保存。
- 节点拖拽位置保存。
- 终端 resize/write。
- 工作区切换或窗口恢复过程中批量发生的终端 start/terminate。

应用正常退出时，各清理阶段成功必须保持静默；只有阶段超时或失败才记录包含阶段、耗时和关联 ID 的 `warn` 或 `error`。

工作区重挂载对已退出 session 产生的迟到 write/resize/interrupt 属于可收敛生命周期竞态，应由 Run 幂等返回权威快照，不记录 `TERMINAL_SESSION_NOT_RUNNING` 警告。renderer 终止一个已经不存在的旧 session 同样属于已完成的幂等清理，不记录 `TERMINAL_SESSION_NOT_FOUND` 警告。终端视图使用已经过期的完整运行身份执行 `attachTerminalView` 并收到 `RUN_SCOPE_STALE` 时，renderer 必须停止重试该身份；请求仍匹配当前身份、但 PTY 尚未完成启动并收到 `TERMINAL_RUNTIME_NOT_READY` 时，renderer 只允许有界且可取消地重试。IPC 仍返回这两种结构化错误，但这些预期生命周期收敛都不写 warning。受管服务监听关闭失败则必须以 `run.service-port`、`SERVICE_PORT_CLEANUP_FAILED` 和精确运行身份记录结构化清理失败。

## 错误码

业务错误必须使用所属上下文声明的有限错误码类型和错误工厂，并继承通用 `AppError` 结构。`AppErrorCode` 只表示观测到的错误标识，不承担业务码登记或编译期词表约束。

上下文领域规则通过自己的 `domain/errors/<Context>DomainError` 声明错误码、错误类和构造方法；用例协调与外部能力失败由该上下文 `application/errors/<Context>Errors` 声明。基础设施使用所属上下文公开的应用错误契约，不把 Provider、存储和网络故障放入公共领域错误表。错误类型由规则产生的层级及所选工厂确定；应用层工厂不根据历史码名反推领域错误类型。同码的领域异常在经过应用层时保留原错误类型。

`shared-kernel/domain/errors/AppError` 只拥有通用错误结构、错误标识格式与真正公共的 `INVALID_CANVAS_OBJECT_IDENTITY`、`UNEXPECTED_ERROR`。`AppErrorCode` 是观测错误标识的通用类型，不是集中登记所有业务码的枚举。`shared-kernel/application/errors/AppError` 负责序列化、客户端恢复和结构识别；错误码、details、isExpected、message 和 correlationId 的既有传输字段保持兼容。

IPC 的已知码校验由 Platform `applicationErrorCatalog` 组合各上下文公开声明与 `IpcError` 得到；Provider RPC 使用 Run 自己的错误契约校验。共享内核不得反向导入上下文目录或维护其业务码清单。通用结构识别与边界上的已知码校验分别负责格式和协议范围，未知 IPC 码仍归一化为 `UNEXPECTED_ERROR`。

部分历史协议码被不同上下文复用，例如 Run 的工作流成员缺失和 BlockGraph 的终端缺失都对外使用 `TERMINAL_BLOCK_NOT_FOUND`。这是保留原协议的兼容例外；领域错误以自己的错误类和 `context + code` 区分归属，不导入另一上下文的领域错误模型，也不把同名文本自动提升为共享语义。context 不进入既有序列化结果。

错误码必须稳定、英文大写、以下划线分隔，例如：

- `GIT_BRANCH_ALREADY_EXISTS`
- `BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES`
- `MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES`
- `TERMINAL_SESSION_NOT_FOUND`
- `BLOCK_GRAPH_NOT_FOUND`
- `RUN_SCOPE_STALE`
- `RUN_START_BLOCKED`
- `TERMINAL_WORKFLOW_SCOPE_CONFLICT`
- `SERVICE_PORT_FIXED_CONFLICT`
- `SERVICE_PORT_ALLOCATION_EXHAUSTED`
- `SERVICE_LISTENER_OWNERSHIP_MISMATCH`
- `SERVICE_LISTENER_OWNERSHIP_UNVERIFIED`
- `SERVICE_PORT_CLEANUP_FAILED`
- `SERVICE_ENDPOINT_NOT_OPENABLE`
- `UNEXPECTED_ERROR`

新增业务错误时必须先在所属上下文声明错误码与工厂，再在用例或聚合中使用；新增真正公共错误时才修改共享声明。

新增码经上下文公开声明参与 Platform 错误目录组合，并更新相应用户提示和最低有效层测试；不得为新增码改写 `tests/fixtures/applicationErrorCodes.ts` 中的历史兼容基线。契约测试要求全部历史码继续存在，同时校验当前声明集合、格式和校验器一致性；只有显式记录的历史跨上下文同码例外可以重复，新码不继承这些例外。

公共错误使用 Shared Kernel Domain 中受 `CommonErrorCode` 约束的工厂。通用 Application 构造器只在上下文业务层使用已声明的公共字面量码；其他动态错误封装属于传输或表现层恢复。应用层和基础设施层可以用单一原错误展开重建诊断信息，但只能覆盖 `message`、`details`、`correlationId`，不能覆盖 `code` 或 `isExpected`；领域层不使用通用构造器重建业务错误。

## IPC 错误边界

Electron main 进程不得直接裸用 `ipcMain.handle`。

所有 IPC handler 必须通过 `registerIpcHandler` 注册。该 wrapper 负责：

- 生成 `correlationId`。
- 记录操作耗时。
- 将成功结果包装为 `{ ok: true, value }`。
- 将 `AppError` 包装为 `{ ok: false, error }`。
- 将未知异常转换为 `UNEXPECTED_ERROR`。
- 按 handler 显式配置记录成功日志。
- 默认记录结构化失败日志；只有 handler 明确声明且 owner 文档列出的预期生命周期收敛可以保持静默，错误仍须结构化返回调用方。

preload 层负责解包 IPC 结果，失败时以普通 `SerializedAppError` 数据拒绝 Promise，使错误码、details 和 correlationId 完整通过 contextBridge。不得在跨 contextBridge 前恢复为 Error 实例，因为 Electron 会丢弃自定义字段。renderer 使用统一错误识别函数读取稳定错误码。

## 表现层规则

表现层只能根据错误码生成用户提示。

禁止：

```ts
error.message.includes('Git branch already exists')
```

允许：

```ts
resolveUserFacingErrorMessage(error, '工作区操作失败。')
```

## 敏感信息

默认不得记录：

- 密钥、token、cookie、认证头。
- 完整环境变量。
- terminal 全量输出。
- 用户源码内容。
- 大段文件内容。

路径可以作为本地诊断信息记录，但不得把路径当成业务事实来源。

本地服务端口诊断可以记录稳定运行身份、候选/实际端口、租约状态、所有权分类、有限重试次数和结构化失败原因；不得记录完整环境变量、Bearer Token、项目命令输出或把操作系统 PID 直接提升为用户可见业务身份。当前冲突界面不展示外部 PID，也不提供终止未知进程的动作。

终端 Provider 使用应用状态目录中的本地轮转诊断文件记录 ready、controller 断连、协议/存储失败等事件。日志可以记录 Provider instance、结构化失败原因和有界计数，不得记录认证 token、终端输入、terminal 输出、checkpoint 内容、环境变量或用户源码。E2E 失败证据可以附带有界 Provider 日志尾部，但仍遵守这些内容限制；Provider 日志不是会话或恢复事实来源。

### 用户导出诊断

用户从应用设置主动导出诊断时，Platform 在用户选择保存位置后即时收集一份 `schemaVersion: 1` 的 JSON 文件。收集范围固定为最近 30 分钟的当前及轮转 `main.log`、终端 Provider `provider.log`，以及应用版本、打包状态、操作系统、架构和 Electron/Node/Chromium 版本；序列化结果上限为 5 MiB，超限时从最旧记录开始裁剪并标记 `truncated`。文件只保存在用户选定位置，不自动上传或发送。

导出记录使用显式字段白名单。主日志只允许时间、级别、scope、operation、outcome、耗时、correlation ID 和有限错误 code / expected / message；Provider 日志只允许时间、event、phase 和有限 message。已知用户目录与应用状态目录必须替换为稳定占位符，其他绝对路径和常见凭证形态必须再次脱敏。无法解析或不满足白名单的行只计数并跳过；单条文本和每个日志文件读取尾部都必须有界。

用户诊断文件不得读取或包含 Agent 审计日志、普通终端输入/输出、会话恢复与 checkpoint、Agent prompt/输出/对话、源码、完整环境变量、stack、details、未知日志字段、截图、crash dump 或操作系统全量日志。复制到剪贴板的诊断摘要只能包含相同快照中的应用与运行环境信息、收集计数及有界近期失败元数据，不能包含日志 message。

## 工程门禁

`pnpm check:logging` 必须检查：

- `src` 中不得直接调用 `console.*`，平台日志 sink 除外。
- Electron main 中不得裸用 `ipcMain.handle`。
- 表现层不得用 `error.message.includes(...)` 判断应用错误。
- 上下文 `domain` 和 `application` 层不得新增裸 `throw new Error(...)`。
- 使用 TypeScript AST 和绑定符号识别实际调用，覆盖命名导入别名、namespace、静态成员访问及常量别名，忽略注释、字符串和同名局部绑定。
- 上下文 Domain、Application 和 Infrastructure 不得绕过所属错误工厂创建业务错误；有限公共错误工厂、已声明公共字面量码以及应用/基础设施层保留错误身份的诊断重建按上述规则允许。
- 门禁从 Shared Kernel 的 `commonErrorCodes` 读取公共字面量码，不维护第二份公共业务词表；普通类型检查继续约束有限公共工厂的参数。

`pnpm pre-commit` 必须包含 `pnpm check:logging`。

## 参考

本规范参考了成熟观测与安全日志实践：

- OpenTelemetry Logs Data Model：结构化日志、严重级别和关联上下文。
- OWASP Logging Cheat Sheet：敏感信息和日志保护。
- Elastic Common Schema：事件 action/outcome/category 等可检索字段思想。
