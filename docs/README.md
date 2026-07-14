# cleancode 文档中心

## 定位

`docs` 按 DDD 限界上下文和跨上下文语义组织。目录表达文档归属，文件表达一个稳定主题；除本索引外，不在 `docs` 根目录堆放主题文档。

仓库级 AI 阅读入口仍是 [AGENTS.md](../AGENTS.md)。本文件面向开发者和协作 AI，负责解释文档地图、归属规则和阅读路径，不重新定义业务或工程规则。

## 目录模型

```txt
docs/
  README.md
  contexts/                 # 业务能力，按限界上下文归属
    agent/
    block-graph/
    project/
    run/
  product/                  # 跨上下文的产品与表现层契约
  engineering/              # 跨上下文的架构与工程治理
```

目录职责：

- `contexts/<bounded-context>/`：只维护该限界上下文拥有的统一语言、业务规则、状态模型、用例边界和能力说明。
- `product/`：维护跨上下文的产品信息架构、用户可见契约和未实现路线图。
- `engineering/`：维护全仓架构、开发协作、测试、技术栈、日志和技术排障规则。
- `README.md`：只做导航和归属说明。

新增文档时应先确定事实 owner。不能确定 owner 的内容不得先放入“通用”目录；应先澄清它是业务事实、产品契约还是工程约束。

## 限界上下文文档

| 限界上下文 | 状态   | 负责范围                                 | 当前文档                                                                                                       |
| ---------- | ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Project    | 已实现 | 项目、分支工作区、Git 绑定和项目登记簿   | [项目与分支工作区生命周期](contexts/project/workspace-lifecycle.md)                                            |
| BlockGraph | 已实现 | 终端积木、组合、连接、图校验和布局       | [积木图模型](contexts/block-graph/block-graph.md)、[积木动作模型](contexts/block-graph/block-action-model.md)  |
| Run        | 已实现 | PTY 会话、执行计划、运行状态和失败恢复   | [终端会话生命周期](contexts/run/terminal-session.md)、[终端依赖工作流](contexts/run/terminal-workflow.md)      |
| Agent      | 已实现 | Agent 身份、运行时会话、工具、审计和权限 | [Agent 与会话生命周期](contexts/agent/agent-session.md)、[cleancode 原生 MCP](contexts/agent/cleancode-mcp.md) |
| Plugin     | 规划中 | 候选的积木能力声明和扩展                 | 当前没有领域实现；规划边界见[上下文地图](engineering/context-map.md)与 [UI 路线图](product/ui-roadmap.md)      |

跨上下文能力应归入发起协作、拥有生命周期的上下文，并在文档中显式列出其他上下文提供的契约。终端依赖工作流由 Run 拥有运行生命周期，因此专文位于 `contexts/run/`；BlockGraph 通过稳定计划契约提供图结构事实。

## 产品文档

- [UI 契约](product/ui.md)：当前长期有效的信息架构、对象语义、交互不变量和状态反馈。
- [UI 路线图](product/ui-roadmap.md)：尚未确认或尚未实现的产品方向，不是当前功能清单。

## 工程文档

- [架构文档](engineering/architecture.md)：DDD、Clean Architecture、限界上下文、依赖方向和事实来源的唯一规则来源。
- [上下文地图](engineering/context-map.md)：当前上下文 owner、聚合和跨上下文端口协作总览。
- [开发协作规范](engineering/development.md)：任务分级、Spec、Plan、TDD、门禁和汇报规则。
- [测试规范](engineering/testing.md)：测试金字塔、目录、命名、边界和测试数据规则。
- [技术栈说明](engineering/tech-stack.md)：框架、运行环境、依赖和工具链选择。
- [日志与错误规范](engineering/logging.md)：诊断日志、应用错误、IPC 错误传递和日志门禁。
- [终端渲染排障指南](engineering/terminal-rendering.md)：xterm、PTY、CJK cell、滚动条和 Electron 几何验证经验。

## 阅读路径

处理仓库任务时，必须以 [AGENTS.md](../AGENTS.md) 的路由规则为准。常见阅读路径：

- 任意开发任务：开发协作规范 + 架构文档 + 测试规范。
- 项目、Git 分支、worktree、项目登记簿：再读项目与分支工作区生命周期。
- 图结构、终端组合、布局和连接不变量：再读积木图模型。
- 普通终端 PTY、输入、中断、resize 和会话替换：再读终端会话生命周期。
- Agent 身份、分支 thread 绑定、PTY 生命周期和挂起恢复：再读 Agent 与会话生命周期。
- 原生 MCP、工具 Schema、会话鉴权、审批或 Codex 注入：再读 cleancode 原生 MCP。
- 终端依赖、任务/服务编排、就绪探测：再读终端依赖工作流。
- 界面和交互：再读 UI 契约。
- 积木按钮、组合动作和类型边界：再读积木动作模型。
- xterm、PTY 尺寸和字符裁剪：再读终端渲染排障指南。
- 日志、错误码和 IPC 错误：再读日志与错误规范。

## 事实来源与重复规则

同一规则只允许一个 owner：

1. 架构和上下文边界以架构文档为准。
2. 上下文业务事实以所属上下文的领域模型和专文为准。
3. 用户可见稳定语义以 UI 契约为准。
4. 测试层级与组织以测试规范为准。
5. 技术实现选择以技术栈和对应排障文档为准。

`pnpm check:docs` 自动检查本地链接、Markdown 标题锚点、`docs` 根目录结构和本索引的直接覆盖。新增主题文档时必须把它放入所属语义目录，并在本文件增加直接链接。

其他文档可以摘要并链接 owner，但不得复制一套会独立演化的完整规则。规则迁移时必须改写旧描述，而不是并列保留互相竞争的事实来源。
