# cleancode 原生 MCP

## 文档地位

本文是当前已实现 cleancode 原生 MCP 能力的统一维护入口，集中描述协议边界、工具目录、会话与鉴权、审批、跨上下文协作、实现入口和验证矩阵。

本文不重新定义全仓规则：

- 限界上下文、依赖方向和事实来源以[架构文档](../../engineering/architecture.md)为准。
- Agent 控制台的用户可见语义以[UI 契约](../../product/ui.md)为准。
- 测试层级和组织以[测试规范](../../testing/testing.md)为准。
- BlockGraph 的积木动作语义以[积木动作模型](../block-graph/block-action-model.md)为准。

代码和自动化测试是当前可执行行为的最终证据。本文只描述已实现能力；未来工具不得在实现和契约测试落地前写入当前工具目录。

## 能力状态与范围

cleancode 原生 MCP 已经实现。它是 cleancode 为画布内 Codex Agent 注入的内建工具服务，使 Agent 能通过应用层用例查看和修改当前工作区的终端积木与终端组合。

当前能力包括：

- 为每个工作区 Agent 持久化独立能力开关；新建和旧数据迁移默认开启。
- 为每个已启用能力的运行中 Agent 会话注册独立 MCP 端点和 Bearer Token。
- 通过 MCP `initialize`、`tools/list` 和 `tools/call` 暴露工具。
- 查看积木图，创建、更新、删除终端积木，创建、更新、解散终端组合。
- 对删除类工具发起 cleancode UI 审批。
- 记录 Agent 工具调用审计，并在图变更完成后刷新当前工作面。

当前不包括：

- MCP resources、prompts、sampling 或动态工具列表。
- 用户自行配置或管理任意外部 MCP Server。
- 文件读写、Shell、PTY 输入输出等通用系统工具。
- 积木连线、终端依赖工作流运行、日志读取或自定义积木工具。
- 远程监听、跨设备调用、端点持久化或应用重启后恢复 MCP 请求。

## 统一语言

| 术语       | 含义                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 原生 MCP   | 由 cleancode 进程启动并注入内嵌 Codex CLI 的内建 MCP 服务                      |
| Agent 会话 | 一个拥有独立 `sessionId`、Codex PTY、MCP 端点、Token 和审批队列的运行时实例    |
| MCP 端点   | 当前 Agent 会话对应的本机 HTTP JSON-RPC URL                                    |
| 工具协议   | 工具名称、说明、输入 JSON Schema、安全注解、审批属性和结构化结果组成的外部契约 |
| 工具桥接层 | 把 MCP JSON-RPC 请求转换为 Agent 应用层工具命令的基础设施入站适配器            |
| 工具审批   | cleancode UI 对破坏性工具调用作出的独立批准或拒绝                              |
| 工具审计   | Agent 上下文记录的工具名称、输入、会话、工作区、审批属性和执行状态             |

## 上下文边界

原生 MCP 的协议与运行生命周期由 Agent 上下文拥有；被操作的积木图事实仍由 BlockGraph 上下文拥有。

| 责任                                   | Owner                   | 稳定协作方式                        |
| -------------------------------------- | ----------------------- | ----------------------------------- |
| 工具名称、说明、输入 Schema 和安全注解 | Agent application       | `AgentToolProtocol`                 |
| 删除类审批规则                         | Agent domain            | `AgentToolApprovalPolicy`           |
| MCP 端点、Token 和 HTTP 请求处理       | Agent infrastructure    | `AgentMcpServerPort` 的实现         |
| Agent 会话注册、审批等待和图更新通知   | Agent application       | `AgentSessionService`               |
| 工具执行、审计和跨上下文协调           | Agent application       | `ExecuteAgentToolUseCase`           |
| 积木图结构与变更规则                   | BlockGraph              | BlockGraph 聚合与应用层用例         |
| Agent 到 BlockGraph 的稳定边界         | Agent application port  | `AgentBlockGraphToolPort`           |
| Codex 进程启动和 MCP 配置注入          | Agent infrastructure    | `CodexAgentProcessPort` 的 PTY 实现 |
| UI 审批和图快照刷新                    | Presentation / Platform | Agent IPC 事件与应用外壳            |

调用方向固定为：

```txt
Codex CLI
  -> Agent MCP HTTP 入站适配器
  -> Agent JSON-RPC 工具桥接层
  -> Agent 应用层用例
  -> AgentBlockGraphToolPort
  -> BlockGraph 应用层用例
  -> BlockGraph 聚合与仓储
```

Agent 基础设施不得直接修改 BlockGraph 聚合、持久化文件或 React 状态。BlockGraph 也不得依赖 Agent 的 MCP 协议类型。

## 传输、鉴权与会话生命周期

当前服务使用本机 HTTP JSON-RPC：

- Server 只监听 `127.0.0.1`，由操作系统分配随机可用端口。
- 每个 Agent 运行时会话注册路径 `/mcp/<sessionId>`。
- 每次注册生成 24 字节随机值并编码为 base64url Bearer Token。
- 请求只接受 `POST`，且 `Authorization` 必须精确等于 `Bearer <token>`。
- 非 POST 请求返回 `405`，未知会话返回 `404`，鉴权失败返回 `401`，无效 JSON 或 JSON-RPC 请求返回 `400`。

启用能力时，会话启动顺序固定为：先注册 MCP 端点，再启动 Codex PTY。cleancode 通过单个进程级内联配置表注入完整的 `mcp_servers.cleancode` URL、Bearer Token 环境变量名和启用状态，通过子进程环境变量 `CLEANCODE_MCP_TOKEN` 提供 Token；该过程不修改用户的全局 Codex 配置，也不注入默认工具批准模式。

关闭能力时，不注册端点，不向 Codex 参数或环境注入 CleanCode MCP 配置、Token 或 MCP 专用 `NO_PROXY` 修改。无论开关状态，cleancode 都不强制覆盖 Codex 的 sandbox、approval 或 developer instructions；这些设置继承用户 Codex 配置。画布工具说明由 MCP `initialize` 响应提供。

Agent 会话释放时必须注销对应端点并取消未完成审批；应用退出时必须清空会话并关闭 HTTP Server。端点 URL、Token、待审批请求和进行中的 HTTP 调用都是易失运行时状态，不得作为持久化会话绑定。

切换运行中 Agent 的能力时，先保存期望状态，再取消旧审批、停止旧 PTY、注销旧端点并生成新 `sessionId`，随后使用原 Codex thread 重启。关闭后只移除未来调用能力；原 thread 中已经存在的 MCP 交互记录仍属于 Codex 对话历史。没有活动 PTY 时只持久化开关，待下次附加时生效。

## MCP 协议面

当前初始化结果声明：

- MCP `protocolVersion`：`2025-06-18`。
- Server 名称：`cleancode-agent-tools`。
- Server 版本：`0.1.0`。
- Capability：`tools`，且 `listChanged` 为 `false`。

当前只处理以下方法：

| 方法                        | 行为                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `initialize`                | 返回协议版本、Server 信息、工具能力和 cleancode 画布使用说明 |
| `notifications/initialized` | 接受初始化完成通知，HTTP 层返回 `202`                        |
| `tools/list`                | 返回当前工具名称、说明、输入 JSON Schema 和安全注解          |
| `tools/call`                | 把工具名和参数交给 Agent 应用层执行                          |

未知方法返回 JSON-RPC `-32601`；工具名或调用结构无效时返回 `-32602`。工具 Schema 使用 `additionalProperties: false` 描述严格输入，但服务端当前只完成工具调用外形和工具名识别，不能把声明的 Schema 误写成独立的服务端全量校验器。

`initialize.instructions` 同时承担开启 CleanCode MCP 时的画布语义消歧：用户未加限定地说“终端”“整理终端”“终端布局”“终端组合”或同义的终端组织请求时，Agent 应先调用 `inspect_graph`，并默认把作用对象理解为 CleanCode 画布终端积木与终端组合，不应先搜索项目仓库。只有用户明确提到“终端源码”、`Terminal component`、xterm、PTY 或终端模块实现等源码限定词时，才把请求理解为项目代码工作。关闭 MCP 时不提供该 Server 及其 instructions，不给原生 Codex 行为注入这层语义。

## 当前工具目录

以下 7 个工具是当前完整工具集合：

| 工具                    | 行为                           | 必填输入                               | 可选输入                                                   | UI 审批 |
| ----------------------- | ------------------------------ | -------------------------------------- | ---------------------------------------------------------- | ------- |
| `inspect_graph`         | 读取当前工作区积木图快照       | 无                                     | `reason`                                                   | 否      |
| `create_block`          | 创建终端积木                   | `type: "terminal"`、`name`、`position` | `description`、`launchCommand`、`size`                     | 否      |
| `update_block`          | 更新终端积木元数据、位置或大小 | `blockId`                              | `name`、`description`、`launchCommand`、`position`、`size` | 否      |
| `delete_block`          | 删除终端积木                   | `blockId`                              | 无                                                         | 是      |
| `create_terminal_group` | 用至少两个现有终端积木创建组合 | `name`、`memberBlockIds`               | 无                                                         | 否      |
| `update_terminal_group` | 更新组合名称、位置或折叠状态   | `terminalGroupId`                      | `name`、`position`、`isCollapsed`                          | 否      |
| `delete_terminal_group` | 解散组合并保留成员终端         | `terminalGroupId`                      | 无                                                         | 是      |

Agent 使用画布工具时应先调用 `inspect_graph` 获得当前 ID 和布局，再执行后续变更。创建终端积木和组合的结果会在可识别时返回新对象 ID，供下一次工具调用继续使用。

所有工具通过 MCP `annotations` 如实声明副作用：`inspect_graph` 的 `readOnlyHint` 为 `true`；创建和更新工具属于非破坏性写入；删除积木和解散组合的 `destructiveHint` 为 `true`；所有当前工具都只操作本地私有工作区，因此 `openWorldHint` 为 `false`。这些注解帮助 Codex 理解工具风险，但不覆盖用户的 Codex approval 配置，也不替代删除工具的 cleancode UI 审批。

## 执行、审批与结果

非破坏性工具直接进入 `ExecuteAgentToolUseCase`。用例在执行前记录 `started` 审计，完成后记录 `completed`，异常时记录 `failed`；图变更通过 `AgentBlockGraphToolPort` 进入 BlockGraph 应用层。

`delete_block` 和 `delete_terminal_group` 需要独立的 cleancode UI 审批：

1. 首次调用只记录 `awaiting_approval`，不得修改积木图。
2. Agent 会话向 UI 发出审批请求，并让当前工具调用等待用户决定。
3. 批准后，以显式 `approved` 状态重新进入工具用例并执行。
4. 拒绝或会话释放时，调用以 `canceled` 结束，不执行删除。

Codex MCP 配置中的默认工具批准模式不替代这层产品审批。破坏性规则由 `AgentToolApprovalPolicy` 决定，不能依赖某个 CLI 自身的批准设置。

`tools/call` 的结果同时提供：

- `content`：供 Agent 阅读的文本摘要。
- `structuredContent`：包含 `status`、`toolCallId`、工具输出，以及成功时的最新图快照。
- `isError`：完成时为 `false`；等待审批或取消结果为 `true`。

成功变更后，Agent 会话通过回调把最新图快照通知表现层。表现层刷新只是持久化 BlockGraph 事实的投影，不成为新的事实来源。

## 状态所有权与持久化

| 状态                                       | 所有权                | 是否持久化                   |
| ------------------------------------------ | --------------------- | ---------------------------- |
| 工具目录、instructions、安全注解和审批策略 | Agent 代码契约        | 随版本发布                   |
| Agent 稳定身份、布局和 Codex thread 绑定   | Agent 聚合与仓储      | 是                           |
| CleanCode MCP 能力开关                     | Agent 聚合与仓储      | 是                           |
| 工具调用审计                               | Agent 审计仓储        | 是，当前为 JSONL             |
| 积木图和终端组合                           | BlockGraph 聚合与仓储 | 是                           |
| MCP URL、Bearer Token、HTTP Server         | Agent 运行时          | 否                           |
| 待审批请求                                 | Agent 运行时          | 否                           |
| MCP 调用中的图快照                         | 应用层返回值          | 否，事实仍在 BlockGraph 仓储 |

任何新增 MCP 工具都必须先确定业务事实 owner。Agent 可以拥有协议、权限和审计，但不得因为工具从 Agent 发起，就把目标上下文的业务规则搬入 Agent。

## 安全不变量

- Server 必须保持回环地址监听，不得静默扩大为局域网或公网服务。
- 每个 Agent 会话必须拥有独立 URL 和 Token；不得跨会话复用授权。
- Token 只用于当前子进程环境和 HTTP 鉴权，不得写入持久化会话、审计输入或用户全局配置。
- 未通过鉴权的请求不得进入 JSON-RPC 桥接层或应用层用例。
- 删除类操作必须经过 cleancode UI 审批；CLI 配置不得绕过该规则。
- MCP 开关不得覆盖用户 Codex sandbox 或 approval；Codex 自身提示与 cleancode 删除审批是彼此独立的安全层。
- 会话结束时必须注销端点并取消待审批调用，防止旧 Agent 继续操作工作区。
- 工具只能进入应用层用例和稳定端口，不得提供绕过领域规则的通用数据库、文件或进程后门。

## 实现入口

| 层级                        | 入口                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agent domain                | [`AgentToolName.ts`](../../../src/contexts/agent/domain/value-objects/AgentToolName.ts)、[`AgentToolApprovalPolicy.ts`](../../../src/contexts/agent/domain/policies/AgentToolApprovalPolicy.ts)                    |
| Agent application protocol  | [`AgentToolProtocol.ts`](../../../src/contexts/agent/application/dto/AgentToolProtocol.ts)、[`AgentMcpServerPort.ts`](../../../src/contexts/agent/application/ports/AgentMcpServerPort.ts)                         |
| Agent application execution | [`ExecuteAgentToolUseCase.ts`](../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase.ts)、[`AgentSessionService.ts`](../../../src/contexts/agent/application/use-cases/AgentSessionService.ts) |
| Cross-context port          | [`AgentBlockGraphToolPort.ts`](../../../src/contexts/agent/application/ports/AgentBlockGraphToolPort.ts)                                                                                                           |
| HTTP MCP adapter            | [`CleancodeMcpHttpServer.ts`](../../../src/contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer.ts)                                                                                                            |
| JSON-RPC bridge             | [`CleancodeAgentJsonRpcToolBridge.ts`](../../../src/contexts/agent/infrastructure/rpc/CleancodeAgentJsonRpcToolBridge.ts)                                                                                          |
| BlockGraph adapter          | [`BlockGraphAgentToolAdapter.ts`](../../../src/contexts/agent/infrastructure/block-graph/BlockGraphAgentToolAdapter.ts)                                                                                            |
| Codex PTY injection         | [`NodePtyCodexAgentProcessAdapter.ts`](../../../src/contexts/agent/infrastructure/pty/NodePtyCodexAgentProcessAdapter.ts)                                                                                          |

## 验证矩阵

| 层级                     | 证明内容                                                      | 主要测试                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / Agent domain      | 哪些工具需要 UI 审批                                          | [`agent.tool-approval-policy.spec.ts`](../../../tests/unit/contexts/agent/agent.tool-approval-policy.spec.ts)                                                                                      |
| Unit / Agent application | 工具路由、审计、审批等待、拒绝和会话释放                      | [`agent.execute-tool.spec.ts`](../../../tests/unit/contexts/agent/agent.execute-tool.spec.ts)、[`agent.session-service.spec.ts`](../../../tests/unit/contexts/agent/agent.session-service.spec.ts) |
| Contract / tool protocol | 完整工具目录、画布语义、严格 Schema、安全注解和排除的通用工具 | [`agent.tool-protocol.spec.ts`](../../../tests/contract/contexts/agent/agent.tool-protocol.spec.ts)                                                                                                |
| Contract / JSON-RPC      | 初始化说明、带安全注解的工具列表和调用结果结构                | [`agent.json-rpc-tool-bridge.spec.ts`](../../../tests/contract/contexts/agent/agent.json-rpc-tool-bridge.spec.ts)                                                                                  |
| Contract / HTTP          | 本机端点、Bearer 鉴权和 MCP 主路径                            | [`agent.http-mcp-server.spec.ts`](../../../tests/contract/contexts/agent/agent.http-mcp-server.spec.ts)                                                                                            |
| Integration / Codex PTY  | 条件注入 URL/Token、继承权限配置和关闭时环境隔离              | [`agent.codex-pty-process.spec.ts`](../../../tests/integration/contexts/agent/agent.codex-pty-process.spec.ts)                                                                                     |

手工验收至少覆盖：

1. MCP 开启时，Agent 对未限定的“整理终端”请求能先查看画布，再创建或整理终端积木和终端组合；明确要求修改终端源码时仍按项目代码处理。
2. 未携带或携带错误 Token 的请求不能列出或调用工具。
3. 删除工具在 UI 批准前不修改画布，拒绝后保持原图。
4. 工具成功后当前工作面的图快照及时刷新。
5. 移除 Agent 或退出应用后，旧端点和待审批调用不可继续使用。
6. 同一工作区的多个 Agent 使用不同会话端点，审批和调用不串线。

## 维护规则

新增、删除或重命名工具时，必须在同一任务中同步：

1. `AgentToolName` 与 `AgentToolProtocol` 的工具定义和输入 Schema。
2. `ExecuteAgentToolUseCase` 的命令类型、路由、输出和审计。
3. 目标上下文应用层端口、适配器和业务用例。
4. 审批策略；破坏性能力默认先设计独立 UI 审批，不得依赖 Agent 自批。
5. 工具协议、JSON-RPC、HTTP、应用层和必要的集成测试。
6. 本文的当前工具目录、实现入口和验证矩阵。

改变监听范围、Token 传递、会话注销或 Codex 注入方式时，必须同步安全不变量、技术栈和相关契约/集成测试。改变用户可见审批或 Agent 控制台行为时，还必须同步 UI 契约和表现层测试。

改变画布语义说明或工具安全注解时，必须同步 `AgentToolProtocol`、JSON-RPC 映射、工具协议契约测试和本文；安全注解必须描述真实副作用，不得用来替代 Agent 领域审批策略。

未来的连线、运行、日志或自定义积木能力必须先明确所属限界上下文和应用层端口，再通过独立 Spec 实现。它们在代码与契约测试落地前只能作为未来方向，不得写入本文件的当前工具目录，也不得在架构文档中列为已经必须实现的协议事实。
