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
    canvas-arrangement/
    project/
    run/
  product/                  # 跨上下文的产品与表现层契约
  engineering/              # 跨上下文的架构、协作与技术治理
  terminal/                 # 跨层终端运行时、渲染、恢复与专项路线
  i18n/                     # 国际化实现、文案归属与 AI 约束
  testing/                  # 测试规则、方法和稳定性手册
```

目录职责：

- `contexts/<bounded-context>/`：只维护该限界上下文拥有的统一语言、业务规则、状态模型、用例边界和能力说明。
- `product/`：维护跨上下文的产品信息架构、用户可见契约和未实现路线图。
- `engineering/`：维护全仓架构、开发协作、技术栈、日志和技术排障规则。
- `terminal/`：维护跨越 Run、Platform、Presentation 和测试层级的普通终端专项资料，不取代各限界上下文的事实 owner。
- `i18n/`：维护 locale catalog、文案归属、Message key、不可翻译边界和 AI 静态门禁规则。
- `testing/`：维护跨上下文的测试组织规则、测试方法和稳定性排障手册。
- `README.md`：只做导航和归属说明。

新增文档时应先确定事实 owner。不能确定 owner 的内容不得先放入“通用”目录；应先澄清它是业务事实、产品契约、终端专项还是工程约束。普通终端运行时、渲染、恢复和性能等跨层主题进入 `terminal/`，不得因为涉及技术实现就笼统放入 `engineering/`；属于单一限界上下文的终端事实仍保留在对应 `contexts/` 目录。

## 限界上下文文档

| 限界上下文        | 状态   | 负责范围                                         | 当前文档                                                                                                                                                                                                                                                                                   |
| ----------------- | ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project           | 已实现 | 项目、分支工作区、Git 绑定和项目登记簿           | [项目与分支工作区生命周期](contexts/project/workspace-lifecycle.md)                                                                                                                                                                                                                        |
| BlockGraph        | 已实现 | 终端积木、组合、连接、图校验和布局               | [积木图模型](contexts/block-graph/block-graph.md)、[积木动作模型](contexts/block-graph/block-action-model.md)                                                                                                                                                                              |
| CanvasArrangement | 已实现 | 跨类型画布对象的视觉堆叠、锚点与恢复清理         | [画布视觉整理](contexts/canvas-arrangement/canvas-arrangement.md)                                                                                                                                                                                                                          |
| Run               | 已实现 | PTY 会话、运行身份、服务端口、执行计划和失败恢复 | [终端会话生命周期](contexts/run/terminal-session.md)、[终端依赖工作流](contexts/run/terminal-workflow.md)、[本地服务端口治理](contexts/run/service-port-management.md)                                                                                                                     |
| Agent             | 已实现 | Agent 身份、运行时会话、工具、审计和权限         | [Agent 与会话生命周期](contexts/agent/agent-session.md)、[cleancode 原生 MCP](contexts/agent/cleancode-mcp.md)、[Agent 终端底座与 Provider 扩展路线图](contexts/agent/terminal-provider-roadmap.md)、[Agent Provider catalog 与能力演进](contexts/agent/agent-provider-catalog-roadmap.md) |
| Plugin            | 规划中 | 候选的积木能力声明和扩展                         | 当前没有领域实现；规划边界见[上下文地图](engineering/context-map.md)与 [UI 路线图](product/ui-roadmap.md)                                                                                                                                                                                  |

跨上下文能力应归入发起协作、拥有生命周期的上下文，并在文档中显式列出其他上下文提供的契约。终端依赖工作流由 Run 拥有运行生命周期，因此专文位于 `contexts/run/`；BlockGraph 通过稳定计划契约提供图结构事实。

## 产品文档

- [产品功能与快速上手](product/feature-guide.md)：面向新开发者的当前功能目录、核心对象说明和常见使用方法。
- [画布语义契约](product/canvas-semantic-contract.md)：终端、流程、顶层执行单元与组合定义及统一分类规则的唯一产品事实来源。
- [UI 契约](product/ui-contract.md)：当前长期有效的信息架构、对象语义、用户能力、交互不变量和反馈行为。
- [UI Style Guide](product/ui-style-guide.md)：表现层共享的视觉角色、组件选择、状态呈现、动效方法和 UI 评审规则。
- [画布动效演进路线图](product/canvas-motion-roadmap.md)：画布相机、可打断空间运动和对象反馈的阶段顺序与验收边界。
- [UI 路线图](product/ui-roadmap.md)：尚未确认或尚未实现的产品方向，不是当前功能清单。

## 工程文档

- [架构文档](engineering/architecture.md)：DDD、Clean Architecture、限界上下文、依赖方向和事实来源的唯一规则来源。
- [上下文地图](engineering/context-map.md)：当前上下文 owner、聚合和跨上下文端口协作总览。
- [开发协作规范](engineering/development.md)：任务分级、Spec、Plan、TDD、门禁和汇报规则。
- [技术栈说明](engineering/tech-stack.md)：框架、运行环境、依赖和工具链选择。
- [日志与错误规范](engineering/logging.md)：诊断日志、应用错误、IPC 错误传递和日志门禁。

## 终端文档

- [终端文档入口](terminal/README.md)：终端专项文档的定位、边界与放置规则。
- [终端渲染排障指南](terminal/rendering.md)：xterm、PTY、CJK cell、滚动条和 Electron 几何验证经验。
- [普通终端运行时演进路线图](terminal/runtime-roadmap.md)：普通终端权威模型、交互质量、跨应用恢复和多运行环境的分阶段实施方向。

## 国际化文档

- [国际化规范](i18n/README.md)：locale catalog、文案归属、Message key、不可翻译边界和 AI 静态门禁的唯一规则来源。

## 测试文档

- [测试规范](testing/testing.md)：测试金字塔、目录、命名、边界和测试数据规则。
- [E2E 稳定性改造手册](testing/e2e-stability.md)：确定性同步、稳定身份、断言 oracle、场景隔离、清理和失败诊断的通用方法。

## 事实来源与重复规则

同一规则只允许一个 owner。owner 由本文件中的限界上下文表和分类目录确定；其他文档不得重新定义已归属的规则。

`pnpm check:docs` 自动检查本地链接、Markdown 标题锚点、`docs` 根目录结构和本索引的直接覆盖。新增主题文档时必须把它放入所属语义目录，并在本文件增加直接链接。

文档只在目录导航、指出唯一 owner 或移交具体主题时建立链接，不为了互相背书或形式完整建立双向引用。普通链接不产生同步修改关系；规则迁移时必须改写旧描述，不得并列保留互相竞争的事实来源。
