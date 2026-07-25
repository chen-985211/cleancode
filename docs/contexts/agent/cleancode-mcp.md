# cleancode 原生 MCP

## 文档地位

本文是当前已实现 cleancode 原生 MCP 能力的统一维护入口，集中描述协议边界、工具目录、会话与鉴权、审批、跨上下文协作、实现入口和验证矩阵。

本文不重新定义全仓规则：

- 限界上下文、依赖方向和事实来源以[架构文档](../../engineering/architecture.md)为准。
- Agent 控制台的用户可见语义以[UI 契约](../../product/ui-contract.md)为准。
- 测试层级和组织以[测试规范](../../testing/testing.md)为准。
- BlockGraph 的积木动作语义以[积木动作模型](../block-graph/block-action-model.md)为准。

代码和自动化测试是当前可执行行为的最终证据。本文只描述已实现能力；未来工具不得在实现和契约测试落地前写入当前工具目录。

## 能力状态与范围

cleancode 原生 MCP 已经实现。它是 cleancode 为声明支持该能力的画布 Agent Provider 注入的内建工具服务，使 Agent 能通过应用层用例查看和修改当前工作区的终端积木、终端组合、执行配置与依赖工作流图。

当前能力包括：

- 为每个工作区 Agent 持久化独立能力开关；新建和旧数据迁移默认开启。
- 为每个已启用能力的运行中 Agent 会话注册独立 MCP 端点和 Bearer Token。
- 由 Provider contribution 生成只作用于本次 launch 的 MCP 配置、Token 传递和画布路由 instructions，不修改用户全局配置。
- Provider 原生预批准范围只允许当前 `cleancode` Server；CLI 自身不重复询问时，破坏性动作仍必须经过 cleancode UI 审批。
- 通过 MCP `initialize`、`tools/list` 和 `tools/call` 暴露工具。
- 查看积木图，创建、更新、删除终端积木，创建、更新、解散终端组合。
- 配置终端的 task/service 执行语义和服务端口意图，创建或断开终端依赖，并在不启动 PTY 的前提下构建和校验工作流计划。
- 对删除积木、解散组合和断开依赖发起 cleancode UI 审批。
- 记录 Agent 工具调用审计，并在图变更完成后刷新当前工作面。

当前不包括：

- MCP resources、prompts、sampling 或动态工具列表。
- 用户自行配置或管理任意外部 MCP Server。
- 文件读写、Shell、PTY 输入输出等通用系统工具。
- 终端依赖工作流运行、运行状态/日志读取或自定义积木工具。
- 远程监听、跨设备调用、端点持久化或应用重启后恢复 MCP 请求。

## 统一语言

| 术语       | 含义                                                                              |
| ---------- | --------------------------------------------------------------------------------- |
| 原生 MCP   | 由 cleancode 启动并按 Provider 能力注入当前 Agent launch 的内建 MCP 服务          |
| Agent 会话 | 一个拥有独立 `sessionId`、Provider launch、MCP 端点、Token 和审批队列的运行时实例 |
| MCP 端点   | 当前 Agent 会话对应的本机 HTTP JSON-RPC URL                                       |
| 工具协议   | 工具名称、说明、输入 JSON Schema、安全注解、审批属性和结构化结果组成的外部契约    |
| 工具桥接层 | 把 MCP JSON-RPC 请求转换为 Agent 应用层工具命令的基础设施入站适配器               |
| 原生预批准 | Provider 只对当前 CleanCode MCP Server 工具设置的 launch 级允许范围               |
| 工具审批   | cleancode UI 对破坏性工具调用作出的独立批准或拒绝                                 |
| 工具审计   | Agent 上下文记录的工具名称、输入、会话、工作区、审批属性和执行状态                |

## 上下文边界

原生 MCP 的协议与运行生命周期由 Agent 上下文拥有；被操作的积木图事实仍由 BlockGraph 上下文拥有。

| 责任                                        | Owner                   | 稳定协作方式                     |
| ------------------------------------------- | ----------------------- | -------------------------------- |
| 工具名称、说明、输入/输出 Schema 和安全注解 | Agent application       | `AgentToolProtocol`              |
| 破坏性工具审批规则                          | Agent domain            | `AgentToolApprovalPolicy`        |
| MCP 端点、Token 和 HTTP 请求处理            | Agent infrastructure    | `AgentMcpServerPort` 的实现      |
| Agent 会话注册、审批等待和图更新通知        | Agent application       | `AgentSessionService`            |
| 同工作区 MCP 工具串行与会话调用准入         | Agent application       | `AgentToolInvocationCoordinator` |
| 工具执行、审计和跨上下文协调                | Agent application       | `ExecuteAgentToolUseCase`        |
| 积木图结构与变更规则                        | BlockGraph              | BlockGraph 聚合与应用层用例      |
| Agent 到 BlockGraph 的稳定边界              | Agent application port  | `AgentBlockGraphToolPort`        |
| Provider launch 和 MCP 配置注入             | Agent infrastructure    | `AgentProviderContribution`      |
| UI 审批和图快照刷新                         | Presentation / Platform | Agent IPC 事件与应用外壳         |

调用方向固定为：

```txt
Provider CLI
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
- 非 POST 请求返回 `405`，未知会话返回 `404`，鉴权失败返回 `401`，超过 1 MiB 的请求体返回 `413`，无效 JSON 或 JSON-RPC 请求返回 `400`。
- 已鉴权请求体的硬上限是 1 MiB；HTTP 适配器必须按 UTF-8 字节数在流式接收期间执行该限制，超限请求不得进入 JSON-RPC 桥接层。
- 并发会话注册只共享一次 HTTP Server 监听初始化；监听失败必须显式结束注册并清理失败实例，畸形路径和请求不得把原始异常文本返回调用方。
- `registerSession` 返回精确 registration handle；替代注册会使旧注册失效，但旧 handle 后续 `dispose` 只能释放自身，不能删除同 sessionId 的新注册。

启用能力时，顺序固定为：先注册 MCP 端点，再由当前 Provider contribution 生成 launch 级配置，最后在 Agent terminal 中启动 Provider CLI。Codex 使用进程级 `--config` 注入 `mcp_servers.cleancode`、Token 环境变量、默认批准模式和 developer instructions；Claude Code 使用 mode `0600` 的会话临时 MCP 文件、环境变量展开的 Authorization header、`--mcp-config`、`--allowedTools mcp__cleancode__*` 和追加 system prompt；OpenCode 合并用户已有的 `OPENCODE_CONFIG_CONTENT`，用 `{env:...}` header 引用 launch token，并注入临时 instructions 与 `file://` reporter 插件；Gemini 使用 mode `0600` 的 launch 临时 system settings，通过 `GEMINI_CLI_SYSTEM_SETTINGS_PATH` 注入 `mcpServers.cleancode.httpUrl`、引用 `${CLEANCODE_MCP_TOKEN}` 的 Authorization header 与 `trust: true`。Gemini 依赖官方 settings 层的对象合并语义保留用户和项目中的其他 MCP；四者都不得覆盖用户其他 MCP 或写入工作区/全局配置。

Provider 只声明是否支持安全的 launch 级 CleanCode MCP 注入，不声明失败策略。支持时，Provider launch 与 MCP readiness 独立投影：launch 启动后即可进入 running；认证后的 `initialize` 请求与随后 `notifications/initialized` 通知完成后，MCP 才进入 ready。端点注册失败或注册后 10 秒内未完成握手时，只把 MCP 投影为 failed 并释放失效端点，不中断 terminal 或 Provider launch。不支持时不注册端点且 UI 不提供开关。未鉴权通知、只发 initialized 通知、旧 registration 回调、已注销回调或迟到超时都不能发布 ready 或覆盖新 registration。

关闭能力或 Provider 不支持该能力时，不注册端点，也不注入配置、Token 或画布路由 instructions。UI 对不支持的 Provider 隐藏开关，不能伪装成已启用。开启时，配置只约束画布意图路由，不改变 Provider 的 sandbox、全局 approval policy、Shell、文件、Git、网络或其他 MCP Server 权限。画布工具说明同时由 launch 级指令和 MCP `initialize` 响应提供。

Agent launch 退出、替换或会话释放时，先同步关闭新工具调用准入并用精确 handle 注销对应端点，再取消仍在等待的审批、等待全部已经准入或开始执行的调用收束，最后由 `AgentLaunchArtifactScope` 按 LIFO 释放 Provider reporter、临时配置和插件；只有删除、挂起或上层生命周期清理才停止底层 Agent terminal。已经批准并开始的调用不能伪装成取消。首次检查返回待审批与登记审批之间也受同一关闭门控，不能在旧 launch 结束后补登记。成功清理的 artifact 不得重复执行，失败项必须保留供后续重试。应用退出时必须尝试全部会话的排空与 scope 清理并关闭 HTTP Server，再聚合报告错误。端点 URL、Token、待审批请求和进行中的 HTTP 调用都是易失状态。

切换运行中 Agent 的能力时，先保存偏好，再取消旧审批、注销旧端点并替换运行时 session/launch；支持恢复的 Provider 使用原 session ref 继续对话。关闭后只移除未来调用能力，Provider 对话历史中的既有 MCP 交互仍属于 Provider。没有活动运行时时只持久化开关，待下次附加时生效。

launch 级 instructions 和 MCP 工具元数据分别在 Provider CLI 启动与 MCP 初始化时读取。应用升级这些内容后，已有 launch 不热替换；必须切换一次能力、重新启动 Agent 或新建对话才能获得新版本。持久化 Provider session 可以继续恢复，不要求丢弃对话历史。

## MCP 协议面

当前初始化结果声明：

- MCP `protocolVersion`：`2025-06-18`。
- Server 名称：`cleancode-agent-tools`。
- Server 版本：`0.3.1`。
- Capability：`tools`，且 `listChanged` 为 `false`。

当前只处理以下方法：

| 方法                        | 行为                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| `initialize`                | 返回协议版本、Server 信息、工具能力和 cleancode 画布使用说明              |
| `notifications/initialized` | 在本 registration 已接受 `initialize` 后发布一次 ready；HTTP 层返回 `202` |
| `tools/list`                | 返回当前工具名称、说明、输入/输出 JSON Schema 和安全注解                  |
| `tools/call`                | 把工具名和参数交给 Agent 应用层执行                                       |

未知方法返回 JSON-RPC `-32601`；未知工具名、非法调用外形或显式传入非对象 `arguments` 时返回 `-32602`。已识别工具的参数由 `tools/list` 暴露的同一份 Schema 在应用层递归校验，使用 `additionalProperties: false`、必填属性、联合类型、数值边界、数组长度和唯一性等约束；每个 MCP `outputSchema` 的根明确声明 `type: object`，再以严格分支描述完成、失败和可选取消结果。输入失败返回 `AGENT_TOOL_INPUT_INVALID`，不得触达 BlockGraph 端口。工具输入、领域规则或执行失败仍属于合法的 MCP 工具结果：HTTP 保持 `200`，`isError` 为 `true`，并返回结构化错误。未知异常统一净化为 `UNEXPECTED_ERROR`，不得暴露原始异常文本或堆栈。

进程级 `developer_instructions` 与 `initialize.instructions` 共同承担开启 CleanCode MCP 时的画布语义消歧：用户未加限定地说“终端”“整理终端”“终端布局”“终端组合”“终端工作流”“启动项目的终端组合”或同义请求时，Agent 必须先调用 `inspect_graph`，并默认把作用对象理解为 CleanCode 画布事实。Agent 可以在查看画布后读取仓库以确认启动命令，但必须继续通过画布工具创建终端、配置 task/service、建立依赖和组合，对精确相关终端调用 `arrange_terminal_layout`，再用 `inspect_terminal_workflow_plan` 校验计划；不得把直接运行 Shell 进程、创建 package script、`.vscode` task 或项目配置当成替代品。当前工具目录只能创作和检查工作流，没有启动工具，因此 Agent 只能声明已经搭建，不能声称终端或工作流已经运行。只有用户明确提到“终端源码”、`Terminal component`、xterm、PTY 或终端模块实现等源码限定词时，才把请求理解为项目代码工作。关闭 MCP 时不提供该 Server 及其 instructions，也不注入这层进程级画布语义。

## 当前工具目录

以下 12 个工具是当前完整工具集合：

| 工具                               | 行为                                          | 必填输入                         | 可选输入                                                   | UI 审批 |
| ---------------------------------- | --------------------------------------------- | -------------------------------- | ---------------------------------------------------------- | ------- |
| `inspect_graph`                    | 读取当前工作区积木图快照                      | 无                               | `reason`                                                   | 否      |
| `create_block`                     | 创建终端；省略位置时在当前 Agent 附近智能落位 | `type: "terminal"`、`name`       | `description`、`launchCommand`、`position`、`size`         | 否      |
| `update_block`                     | 更新终端积木元数据、位置或大小                | `blockId`                        | `name`、`description`、`launchCommand`、`position`、`size` | 否      |
| `delete_block`                     | 删除终端积木                                  | `blockId`                        | 无                                                         | 是      |
| `create_terminal_group`            | 用至少两个现有终端积木创建视觉组合            | `name`、`memberBlockIds`         | 无                                                         | 否      |
| `update_terminal_group`            | 更新组合名称、位置或折叠状态                  | `terminalGroupId`                | `name`、`position`、`isCollapsed`                          | 否      |
| `delete_terminal_group`            | 解散组合并保留成员终端                        | `terminalGroupId`                | 无                                                         | 是      |
| `update_terminal_execution_config` | 替换 task/service 配置并声明服务端口意图      | `blockId`、`executionConfig`     | 无                                                         | 否      |
| `connect_terminal_blocks`          | 建立 source 上游到 target 下游的依赖          | `sourceBlockId`、`targetBlockId` | 无                                                         | 否      |
| `disconnect_terminal_blocks`       | 按 `connectionId` 断开一条依赖并保留终端      | `connectionId`                   | 无                                                         | 是      |
| `inspect_terminal_workflow_plan`   | 构建并校验拓扑计划，不启动任何进程            | `scope`                          | 无                                                         | 否      |
| `arrange_terminal_layout`          | 确定性排列精确终端作用域及其完整组合          | `blockIds`                       | 无                                                         | 否      |

`executionConfig` 必须是完整 task 或 service 联合结构。`0.3.0` 在保持 12 个工具名称不变的前提下扩展 service Schema：输出就绪服务可以不声明端口；TCP 就绪以及任何受管服务必须声明 `port`，其中策略为 `fixed(port)`、`preferred(port)` 或 `auto`，协议为 `http`、`https` 或 `tcp`，注入为固定策略可用的 `none`、环境变量或恰好包含一个 `{port}` 的安全参数模板。动态策略不能搭配 `none`。这些字段只是 BlockGraph 持久化意图；工具仍不能分配端口、启动 PTY 或返回实际端点。

`0.3.1` 不改变上述输入形状，而是把并行端口决策变成 Agent 可发现的协议事实。Developer Instructions、MCP 初始化说明、工具描述和嵌套 JSON Schema 统一要求：本地 HTTP/HTTPS/TCP 开发服务存在惯用端口时，默认使用 `preferred(port)` 与已经验证的注入；没有惯用端口时使用 `auto` 与已经验证的注入；只有用户或项目契约明确要求端口不可变化时才使用 `fixed`。环境变量注入只允许选择项目现有启动路径已经读取的变量，参数注入只允许选择现有 CLI 或任务包装器已经接受的安全 `{port}` 后缀；Agent 不得猜测 `PORT`、仅因日志出现 `8000` 就选择 `fixed + none`，也不得为支持动态端口擅自修改源码或项目配置。Schema 把推荐的 `preferred` 和 `auto` 分支放在 `fixed` 前，并提供可由同一 Schema 校验的结构化示例。

工作流计划 `scope` 必须是 `{ type: "full" }` 或 `{ type: "from-block", blockId }`。连接方向固定为 source 上游到 target 下游。终端组合只承担视觉组织，不是工作流节点。

`create_block` 显式提供 `position` 时原样采用；省略时，应用层从当前受管 Agent 的持久化布局注入 anchor，并把同工作区其他 Agent 注入为 reserved regions，模型不能提供或伪造这些区域。`arrange_terminal_layout` 只接受精确 `blockIds`，返回实际排列的终端与组合 ID；部分组合、空或未知作用域由 BlockGraph 拒绝。

Agent 使用画布工具时应先调用 `inspect_graph` 获得当前 ID、配置和依赖，再执行后续变更。创建终端积木、组合和连接的结果会在可识别时分别返回新对象 ID；完成工作流创作后，应先对精确相关终端调用 `arrange_terminal_layout`，再调用 `inspect_terminal_workflow_plan`，利用 BlockGraph 的既有规则统一验证缺失命令、服务端口意图、作用范围和拓扑顺序。Agent 的最终说明应报告持久化的策略与注入方式，不能把请求端口误报为本次运行的实际端点。

所有工具通过 MCP `annotations` 如实声明副作用：`inspect_graph` 和 `inspect_terminal_workflow_plan` 的 `readOnlyHint` 为 `true`；创建、更新和连接属于非破坏性写入；删除积木、解散组合和断开依赖的 `destructiveHint` 为 `true`；所有当前工具的 `openWorldHint` 都为 `false`。即使 Provider launch 已允许当前 Server 的工具，这些注解仍必须真实描述风险，并且不能替代 cleancode UI 审批。

## 执行、审批与结果

支持该能力的 Provider 只为当前 CleanCode MCP Server 建立精确工具允许范围，不由 Provider 原生界面重复询问。该允许范围只决定 CLI 是否再次提示，不授予绕过 cleancode 应用层、领域规则或工具审批的权限。

已识别工具先使用协议 Schema 校验输入；校验失败只记录 `failed`，不得调用目标上下文。合法的非破坏性工具直接进入 `ExecuteAgentToolUseCase`，用例在执行前记录 `started`，完成后记录 `completed`，领域或执行错误记录 `failed`；图读取、写入和计划构建都通过 `AgentBlockGraphToolPort` 进入 BlockGraph 应用层。

`delete_block`、`delete_terminal_group` 和 `disconnect_terminal_blocks` 需要独立的 cleancode UI 审批：

1. 首次调用只记录 `awaiting_approval`，不得修改积木图。
2. Agent 会话向 UI 发出包含结构化目标的审批请求：删除终端携带 `blockId`，解散组合携带 `terminalGroupId`，断开依赖只携带 `connectionId`；名称和端点继续由当前 BlockGraph 快照解析，当前工具调用等待用户决定。
3. UI 用临时审批意图连线与目标高亮表达作用对象。断开依赖时，展开端点高亮真实工作流边；折叠端点使用 `approval:` 临时不可交互代理边；两个端点处于同一折叠组合时不画自环，只标记组合包含待断开依赖。这些投影不进入 BlockGraph 持久化。
4. 批准后，以显式 `approved` 状态重新进入工具用例；批准 IPC 必须等待工具真正执行结束，成功时返回最新图快照并移除审批，异常时返回失败而不能提前显示成功。
5. 拒绝或会话释放时，仍在等待的调用使用同一 `toolCallId` 追加 `canceled` 审计并且不执行写入；已经批准和开始的调用不得回滚或伪报取消，会话释放必须等待其完成或失败。

Provider MCP 配置中的工具允许范围不替代这层产品审批。破坏性规则由 `AgentToolApprovalPolicy` 决定，不能依赖某个 CLI 自身的批准设置。

同一项目工作区内，由所有 Agent 发起的 MCP 工具执行按完整应用层调用串行进入目标用例，等待 UI 审批本身不占用执行队列；不同工作区可以并行。该队列避免多个 Agent 同时对同一旧图执行读取—修改—保存而互相覆盖，但不改变 BlockGraph 对图事实和业务规则的所有权。

`tools/call` 的结果同时提供：

- `content`：供 Agent 阅读的文本摘要。
- `structuredContent`：遵循每个工具公开的 `outputSchema`。成功图工具包含 `status`、稳定的 `toolCallId`、`graphChanged`、工具输出和最新图快照；计划检查返回计划而不复制图快照；失败返回结构化 `error`。
- `isError`：完成时为 `false`；取消或失败时为 `true`。`awaiting_approval` 是应用内部状态，实际 MCP 调用会保持等待，不把它作为最终外部结果返回。

只有 `graphChanged: true` 的成功变更才通过回调把最新图快照通知表现层；`inspect_graph`、计划检查和幂等布局不得触发伪更新。布局事件额外携带 `terminal_layout_arranged`、原始 `toolCallId` 和实际排列的终端/组合 ID，供表现层在投影完成后执行一次聚焦；这些元数据不持久化，也不改变 BlockGraph 事实。

## 状态所有权与持久化

| 状态                                                | 所有权                 | 是否持久化                   |
| --------------------------------------------------- | ---------------------- | ---------------------------- |
| 工具目录、会话路由/instructions、安全注解和审批策略 | Agent 代码契约         | 随版本发布                   |
| Provider 的 CleanCode Server 精确允许范围           | Agent 基础设施代码契约 | 随版本发布，不属于用户状态   |
| Agent 稳定身份、固定 Provider、布局和 session ref   | Agent 聚合与仓储       | 是                           |
| CleanCode MCP 能力开关                              | Agent 聚合与仓储       | 是                           |
| 工具调用审计                                        | Agent 审计仓储         | 是，当前为 JSONL             |
| 积木图、终端组合、执行配置和终端依赖                | BlockGraph 聚合与仓储  | 是                           |
| MCP URL、Bearer Token、HTTP Server                  | Agent 运行时           | 否                           |
| MCP readiness、binding persistence 状态             | Agent 运行时           | 否                           |
| 待审批请求                                          | Agent 运行时           | 否                           |
| MCP 调用中的图快照                                  | 应用层返回值           | 否，事实仍在 BlockGraph 仓储 |

任何新增 MCP 工具都必须先确定业务事实 owner。Agent 可以拥有协议、权限和审计，但不得因为工具从 Agent 发起，就把目标上下文的业务规则搬入 Agent。

## 安全不变量

- Server 必须保持回环地址监听，不得静默扩大为局域网或公网服务。
- 每个 Agent 会话必须拥有独立 URL 和 Token；不得跨会话复用授权。
- Token 只用于当前子进程环境和 HTTP 鉴权，不得写入持久化会话、审计输入或用户全局配置。
- 未通过鉴权的请求不得进入 JSON-RPC 桥接层或应用层用例。
- 超过 1 MiB 的请求体必须在 HTTP 边界拒绝，不得通过无界缓冲消耗主进程内存。
- Provider 的 MCP 配置必须是 launch scoped；注册、初始化或策略失败不得被界面伪装成可用，也不得连带阻断仍可用的 Provider launch。
- Token 进入 Provider 配置时必须通过官方支持的环境变量引用；临时配置文件不得包含 token 明文。
- ready 只能来自当前精确 registration 的已鉴权完整初始化握手；替代注册后旧 handle、旧通知和旧回调不得改变当前 runtime。
- Provider 原生允许范围只能匹配当前 `cleancode` Server 工具，不得扩展到全局权限或其他 MCP Server。
- Provider 组织受管策略的优先级高于 launch 配置；cleancode 不得绕过管理员限制。
- 删除积木、解散组合和断开依赖必须经过 cleancode UI 审批；CLI 配置不得绕过该规则。
- 一次合法工具调用从桥接、校验、审批、执行到审计必须使用同一 `toolCallId`；只有仍在等待审批的调用可以进入 `canceled`。
- MCP 开关不得覆盖用户 Provider sandbox 或全局 approval policy；Shell、文件、Git、网络和其他 MCP 权限继续继承用户配置。
- 会话结束时必须注销端点并取消待审批调用，防止旧 Agent 继续操作工作区。
- launch 进入关闭、挂起、替换或异常退出状态后不得再准入新 MCP 调用；所有已准入调用必须在 launch 资源释放、terminal 停止或会话删除前完成、失败或取消。
- 同一项目工作区的 MCP 工具执行必须跨 Agent 串行，不能让并发读取—修改—保存静默丢失图变更。
- 工具只能进入应用层用例和稳定端口，不得提供绕过领域规则的通用数据库、文件或进程后门。

## 实现入口

| 层级                          | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent domain                  | [`AgentToolName.ts`](../../../src/contexts/agent/domain/value-objects/AgentToolName.ts)、[`AgentToolApprovalPolicy.ts`](../../../src/contexts/agent/domain/policies/AgentToolApprovalPolicy.ts)                                                                                                                                                                                                                                                                        |
| Agent application protocol    | [`AgentToolProtocol.ts`](../../../src/contexts/agent/application/dto/AgentToolProtocol.ts)、[`AgentToolInputValidation.ts`](../../../src/contexts/agent/application/dto/AgentToolInputValidation.ts)、[`AgentTerminalWorkflowProtocol.ts`](../../../src/contexts/agent/application/dto/AgentTerminalWorkflowProtocol.ts)、[`AgentMcpServerPort.ts`](../../../src/contexts/agent/application/ports/AgentMcpServerPort.ts)                                               |
| Agent application execution   | [`ExecuteAgentToolUseCase.ts`](../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase.ts)、[`AgentToolApprovalCoordinator.ts`](../../../src/contexts/agent/application/use-cases/AgentToolApprovalCoordinator.ts)、[`AgentToolInvocationCoordinator.ts`](../../../src/contexts/agent/application/use-cases/AgentToolInvocationCoordinator.ts)、[`AgentSessionService.ts`](../../../src/contexts/agent/application/use-cases/AgentSessionService.ts) |
| Cross-context port            | [`AgentBlockGraphToolPort.ts`](../../../src/contexts/agent/application/ports/AgentBlockGraphToolPort.ts)                                                                                                                                                                                                                                                                                                                                                               |
| HTTP MCP adapter              | [`CleancodeMcpHttpServer.ts`](../../../src/contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer.ts)                                                                                                                                                                                                                                                                                                                                                                |
| JSON-RPC bridge               | [`CleancodeAgentJsonRpcToolBridge.ts`](../../../src/contexts/agent/infrastructure/rpc/CleancodeAgentJsonRpcToolBridge.ts)                                                                                                                                                                                                                                                                                                                                              |
| BlockGraph adapter            | [`BlockGraphAgentToolAdapter.ts`](../../../src/contexts/agent/infrastructure/block-graph/BlockGraphAgentToolAdapter.ts)                                                                                                                                                                                                                                                                                                                                                |
| Provider capability injection | [`providers`](../../../src/contexts/agent/infrastructure/providers)                                                                                                                                                                                                                                                                                                                                                                                                    |
| Presentation projection       | [`agentApprovalPresentation.ts`](../../../src/presentation/app-shell/agentApprovalPresentation.ts)、[`useAgentLayoutCoordination.ts`](../../../src/presentation/app-shell/useAgentLayoutCoordination.ts)、[`useWorkbenchLayoutFocus.ts`](../../../src/presentation/app-shell/useWorkbenchLayoutFocus.ts)                                                                                                                                                               |

## 验证矩阵

| 层级                     | 证明内容                                                                                                                           | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / Agent domain      | 哪些工具需要 UI 审批                                                                                                               | [`agent.tool-approval-policy.spec.ts`](../../../tests/unit/contexts/agent/agent.tool-approval-policy.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Unit / Agent application | 输入校验、12 工具路由、身份注入、动态变更、稳定调用 ID、审计、审批收束、工作区串行和会话关闭排空                                   | [`agent.tool-input-validation.spec.ts`](../../../tests/unit/contexts/agent/agent.tool-input-validation.spec.ts)、[`agent.execute-tool.spec.ts`](../../../tests/unit/contexts/agent/agent.execute-tool.spec.ts)、[`agent.execute-layout-tool.spec.ts`](../../../tests/unit/contexts/agent/agent.execute-layout-tool.spec.ts)、[`agent.tool-approval-coordinator.spec.ts`](../../../tests/unit/contexts/agent/agent.tool-approval-coordinator.spec.ts)、[`agent.tool-invocation-coordinator.spec.ts`](../../../tests/unit/contexts/agent/agent.tool-invocation-coordinator.spec.ts)、[`agent.session-tool-lifecycle.spec.ts`](../../../tests/unit/contexts/agent/agent.session-tool-lifecycle.spec.ts) |
| Unit / Presentation      | 审批投影、布局事件、整组拖动保护、真实几何投影等待和单次聚焦                                                                       | [`agent-approval-presentation.spec.ts`](../../../tests/unit/presentation/agent-approval-presentation.spec.ts)、[`use-agent-layout-coordination.spec.tsx`](../../../tests/unit/presentation/use-agent-layout-coordination.spec.tsx)、[`workbench-layout-focus.spec.tsx`](../../../tests/unit/presentation/workbench-layout-focus.spec.tsx)、[`agent-layout-projection-timing.spec.tsx`](../../../tests/unit/presentation/agent-layout-projection-timing.spec.tsx)、[`preserve-workbench-node-transient-layout.spec.ts`](../../../tests/unit/presentation/preserve-workbench-node-transient-layout.spec.ts)                                                                                            |
| Contract / tool protocol | 12 个工具、共源严格输入/输出 Schema、安全注解和排除的通用工具                                                                      | [`agent.tool-protocol.spec.ts`](../../../tests/contract/contexts/agent/agent.tool-protocol.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Contract / JSON-RPC      | `0.3.1` 初始化、自描述端口策略、工具列表、稳定调用 ID、结构化/净化错误                                                             | [`agent.json-rpc-tool-bridge.spec.ts`](../../../tests/contract/contexts/agent/agent.json-rpc-tool-bridge.spec.ts)、[`agent.tool-protocol.spec.ts`](../../../tests/contract/contexts/agent/agent.tool-protocol.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Contract / HTTP          | 本机端点、Bearer 鉴权、1 MiB 请求体上限、完整初始化握手、精确替代注册、监听失败/并发初始化、净化请求错误和业务错误的 HTTP 200 通道 | [`agent.http-mcp-server.spec.ts`](../../../tests/contract/contexts/agent/agent.http-mcp-server.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Integration / BlockGraph | 四个工作流工具复用真实 BlockGraph 用例、持久化与领域错误透传                                                                       | [`agent.block-graph-tool-adapter.spec.ts`](../../../tests/integration/contexts/agent/agent.block-graph-tool-adapter.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Unit / Provider          | Codex/Claude/OpenCode/Gemini 条件注入、环境变量 Token、精确工具允许范围、用户配置合并和可重试 launch-scope 清理                    | [`agent.codex-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.codex-provider-contribution.spec.ts)、[`agent.additional-provider-contributions.spec.ts`](../../../tests/unit/contexts/agent/agent.additional-provider-contributions.spec.ts)、[`agent.opencode-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.opencode-provider-contribution.spec.ts)、[`agent.gemini-provider-contribution.spec.ts`](../../../tests/unit/contexts/agent/agent.gemini-provider-contribution.spec.ts)、[`agent.session-artifact-lifecycle.spec.ts`](../../../tests/unit/contexts/agent/agent.session-artifact-lifecycle.spec.ts)                                    |

手工验收至少覆盖：

1. MCP 开启时，Agent 对“帮我搭一个前端依赖后端的终端工作流”先查看画布，可以再读取仓库确认启动命令，随后创建/更新真实终端、配置执行模式、建立依赖并检查计划；不得用直接启动 Shell 进程代替，也不得把已搭建表述为已运行。
2. 未携带或携带错误 Token 的请求不能列出或调用工具。
3. 删除和断开工具在 UI 批准前不修改画布；断开审批卡准确显示上游、下游、连接 ID 和保留内容，展开/折叠/同组折叠三类投影都不产生可持久化或可删除的代理依赖。
4. 批准期间展示执行中状态，工具成功后当前工作面的图快照及时刷新并移除审批；失败时不得误报成功。
5. 移除 Agent 或退出应用后，旧端点和待审批调用不可继续使用。
6. 同一工作区的多个 Agent 使用不同会话端点，审批和调用不串线；同时发起图工具时按工作区串行执行且不丢失已完成变更。
7. 在没有更高优先级组织受管策略覆盖时，CleanCode MCP 工具不触发 Provider 的重复审批；破坏性工具仍只等待 cleancode UI 审批。
8. 任一支持 MCP 的 Provider 在 Server 无法注册或认证初始化握手超时时，Agent 仍可使用，MCP 以紧凑对象内状态显示不可用；任何 Provider 都不得把失败伪装成 MCP 已可用。
9. Agent 完成终端工作流后只排列精确相关终端；布局位于发起 Agent 附近并避开其他 Agent/无关对象，用户同时拖动的终端或组合不被迟到布局覆盖，实际变化最多触发一次画布聚焦。
10. 为两个可能并行运行的项目或 worktree 搭建本地服务工作流时，Agent 对已有惯用端口默认写入 `preferred` 与经仓库确认的环境变量或参数注入；没有惯用端口时使用 `auto`；只有明确不可变端口约束时才写入 `fixed`，并在最终说明中报告策略和注入方式而不是声称已经获得实际端点。

## 第二阶段候选：运行态 MCP（尚未实现）

本节只记录已确认的后续设计方向，**不属于当前工具目录、当前协议或当前验收事实**。当前 `tools/list` 不得暴露以下名称，Agent 也不得声称可以通过 CleanCode MCP 启动、查询或停止工作流：

- `start_terminal_workflow`
- `get_terminal_workflow_run`
- `stop_terminal_workflow`

进入第二阶段实现前，必须单独完成 Spec、Plan 和 TDD，并满足以下前置约束：

1. Run 上下文继续拥有运行实例、状态机、任务/服务就绪、失败传播和停止语义；Agent 只拥有 MCP 协议、审批和审计，不复制 Run 规则。
2. 启动输入必须绑定精确项目、工作区和计划版本/图修订，执行期间使用不可变计划，避免画布并发修改改变已经开始的运行。
3. 每次启动返回唯一 `runId`；查询和停止必须使用精确 `runId` 与原工作区作用域，不能用“当前运行”等模糊目标。
4. Run 必须串行化同一作用域的启动/停止，并隔离旧运行的迟到回调，防止状态或输出串入新运行。
5. 启动和停止都属于影响真实进程的动作，必须设计独立 cleancode UI 审批；Provider 工具允许范围不得替代产品审批。
6. 状态查询只返回稳定、有限的运行状态与节点摘要；第一版不得通过 MCP 暴露无限原始终端输出或日志流。
7. 会话释放、应用退出和工作区切换时必须明确运行是否继续、停止或转交，不得沿用当前易失审批的隐含行为。

第二阶段完成后，才能把这些工具迁入“当前工具目录”，并同步 Run 文档、上下文地图、UI 契约、协议版本、实现入口和验证矩阵。

## 维护规则

新增、删除或重命名工具时，必须在同一任务中同步：

1. `AgentToolName` 与 `AgentToolProtocol` 的工具定义和输入 Schema。
2. `ExecuteAgentToolUseCase` 的命令类型、路由、输出和审计。
3. 目标上下文应用层端口、适配器和业务用例。
4. 审批策略；破坏性能力默认先设计独立 UI 审批，不得依赖 Agent 自批。
5. 工具协议、JSON-RPC、HTTP、应用层和必要的集成测试。
6. 本文的当前工具目录、实现入口和验证矩阵。

改变监听范围、Token 传递、会话注销或 Provider 注入方式时，必须同步安全不变量、Provider contract 和相关测试。改变用户可见审批或 Agent 控制台行为时，还必须同步 UI 契约和表现层测试。

改变画布语义说明或工具安全注解时，必须同步 `AgentToolProtocol`、JSON-RPC 映射、工具协议契约测试和本文；安全注解必须描述真实副作用，不得用来替代 Agent 领域审批策略。

未来新增的 CleanCode MCP 工具自动进入当前 Server 的 Provider 精确允许范围。新增工具前仍必须明确业务事实 owner、真实安全注解、cleancode 内部审批策略和审计行为，不得把 Provider 原生允许范围当作业务授权。

未来的运行、日志或自定义积木能力必须先明确所属限界上下文和应用层端口，再通过独立 Spec 实现。它们在代码与契约测试落地前只能作为未来方向，不得写入本文件的当前工具目录，也不得在架构文档中列为已经必须实现的协议事实。
