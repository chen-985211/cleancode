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
- `scope`：日志来源，例如 `project.git`、`project.workspace`、`block-graph`、`run.terminal`。
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

## 错误码

应用错误必须使用 `AppError` 和已登记的 `AppErrorCode`。

错误码必须稳定、英文大写、以下划线分隔，例如：

- `GIT_BRANCH_ALREADY_EXISTS`
- `BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES`
- `MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES`
- `TERMINAL_SESSION_NOT_FOUND`
- `BLOCK_GRAPH_NOT_FOUND`
- `UNEXPECTED_ERROR`

新增业务错误时必须先登记错误码，再在用例、聚合或平台边界使用。

## IPC 错误边界

Electron main 进程不得直接裸用 `ipcMain.handle`。

所有 IPC handler 必须通过 `registerIpcHandler` 注册。该 wrapper 负责：

- 生成 `correlationId`。
- 记录操作耗时。
- 将成功结果包装为 `{ ok: true, value }`。
- 将 `AppError` 包装为 `{ ok: false, error }`。
- 将未知异常转换为 `UNEXPECTED_ERROR`。
- 按 handler 显式配置记录成功日志。
- 始终记录结构化失败日志。

preload 层负责解包 IPC 结果，并把失败结果恢复成 renderer 可识别的 `AppError`。

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

## 工程门禁

`pnpm check:logging` 必须检查：

- `src` 中不得直接调用 `console.*`，平台日志 sink 除外。
- Electron main 中不得裸用 `ipcMain.handle`。
- 表现层不得用 `error.message.includes(...)` 判断应用错误。
- 上下文 `domain` 和 `application` 层不得新增裸 `throw new Error(...)`。

`pnpm pre-commit` 必须包含 `pnpm check:logging`。

## 参考

本规范参考了成熟观测与安全日志实践：

- OpenTelemetry Logs Data Model：结构化日志、严重级别和关联上下文。
- OWASP Logging Cheat Sheet：敏感信息和日志保护。
- Elastic Common Schema：事件 action/outcome/category 等可检索字段思想。
