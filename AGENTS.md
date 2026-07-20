# AGENTS.md

## 定位

本文是 cleancode 仓库的 AI 阅读入口，只负责把当前任务路由到必要文档。

完整文档目录由 [文档中心](docs/README.md) 维护。本文不复制开发、架构、测试或产品规则，也不要求 AI 在每个回合重复读取固定文档集合。

## 阅读原则

1. 先理解用户目标并检查直接目标文件，再判断需要哪些规则。
2. 只读取会影响本次判断、修改或验证的文档和章节，不做预防性全库阅读。
3. 文档中的普通链接只表示导航、出处或事实移交，不自动产生继续阅读义务。
4. 只有当前任务同时命中链接目标的阅读条件，或当前文档不足以解决事实冲突时，才继续读取链接目标。
5. 同一连续任务中，已经读取且内容未变化的文档不重复读取；任务变化后重新按触发条件判断。
6. 修改规则文档时，读取目标文档及本次实际改变的规则 owner；不得因为目标文档包含链接就递归读取所有被引用文档。

默认读取相关章节即可。只有任务会改变整份文档的职责、存在跨章节冲突，或无法通过局部内容确定规则时，才完整阅读该文档。

## 开工要求

只读分析、解释、审查和状态查询不要求读取开发协作规范，也不要求开工回执。

任务会修改项目文件、配置、依赖、Git 状态或其他项目状态时，必须先读取 [开发协作规范](docs/engineering/development.md) 中与任务分级、执行流程、验证和输出相关的章节，并按其要求输出开工回执。架构文档和测试规范不因此自动成为必读文档。

需要修改文件但尚未完成当前任务所需阅读时，不得开始修改、运行测试或创建提交。

## 按任务路由

多个条件同时命中时读取对应文档的并集，不额外扩展为固定套餐。

| 任务条件                                                                | 需要读取                                                                                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 修改业务行为、状态、不变量或生命周期                                    | 对应限界上下文文档；状态 owner 或边界不清楚时再读[架构文档](docs/engineering/architecture.md)                                                 |
| 修改分层、依赖方向、端口、跨上下文协作或 composition root               | [架构文档](docs/engineering/architecture.md)；涉及当前协作关系时再读[上下文地图](docs/engineering/context-map.md)                             |
| 新增或修改测试、选择测试层级、调整测试目录或测试基础设施                | [测试规范](docs/testing/testing.md)；Electron/PTY E2E 稳定性问题再读 [E2E 稳定性改造手册](docs/testing/e2e-stability.md)                      |
| 修改依赖、构建、运行环境、框架或工具链                                  | [技术栈说明](docs/engineering/tech-stack.md)                                                                                                  |
| 修改稳定的用户可见行为、信息架构、对象作用域或状态含义                  | [UI 契约](docs/product/ui-contract.md)                                                                                                        |
| 修改视觉、组件选择、布局、状态呈现、动效或可访问性交互                  | [UI Style Guide](docs/product/ui-style-guide.md)；只有同时改变产品语义时才读 UI 契约                                                          |
| 修改用户可见文案、可访问名称、locale、Message key 或 i18n 门禁          | [国际化规范](docs/i18n/README.md)                                                                                                             |
| 讨论尚未确认或尚未实现的 UI 方向                                        | [UI 路线图](docs/product/ui-roadmap.md)                                                                                                       |
| 修改项目、Git 分支、worktree、checkout、同步或归档                      | [项目与分支工作区生命周期](docs/contexts/project/workspace-lifecycle.md)                                                                      |
| 修改终端积木、终端组合、viewport、连线、图持久化或图恢复                | [积木图模型](docs/contexts/block-graph/block-graph.md)；涉及动作作用对象时再读[积木动作模型](docs/contexts/block-graph/block-action-model.md) |
| 修改普通终端 PTY、输入、中断、resize、工作目录、会话替换或清理          | [终端会话生命周期](docs/contexts/run/terminal-session.md)                                                                                     |
| 修改终端依赖、工作流计划、任务/服务、就绪、状态传播或停止               | [终端依赖工作流](docs/contexts/run/terminal-workflow.md)                                                                                      |
| 修改本地服务端口策略、租约、注入、监听所有权或实际端点                  | [本地服务端口治理](docs/contexts/run/service-port-management.md)                                                                              |
| 修改 Agent 身份、布局、thread 绑定、Agent PTY 或挂起恢复                | [Agent 与会话生命周期](docs/contexts/agent/agent-session.md)                                                                                  |
| 修改 cleancode 原生 MCP、工具 Schema、鉴权、审批、审计或 Codex MCP 注入 | [cleancode 原生 MCP](docs/contexts/agent/cleancode-mcp.md)                                                                                    |
| 修改日志、错误传递、诊断输出或日志门禁                                  | [日志与错误规范](docs/engineering/logging.md)                                                                                                 |
| 修改 xterm 渲染、PTY 行列、CJK/emoji cell、滚动条或可见裁剪             | [终端渲染排障指南](docs/terminal/rendering.md)                                                                                                |
| 新增、移动、重命名或删除文档                                            | [文档中心](docs/README.md)；只改文档内容时直接读取目标文档                                                                                    |

## 阻塞处理

如果当前任务按上述条件必需的文档无法读取，必须停止会受该规则影响的动作并说明原因。未命中的文档不可读不构成阻塞。
