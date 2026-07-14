# AGENTS.md

## 定位

本文件是 cleancode 仓库的 AI 阅读入口，只定义开发协作 AI 进入本仓库后必须阅读哪些文档，以及在什么情况下继续阅读任务相关文档。

本文不展开具体开发规则、架构规则、测试规则或任务规则。文档内容以被引用文档自身为准。

## 必读文档

开发协作 AI 处理本仓库任何任务时，必须在当前回合完整阅读 [开发协作规范](docs/engineering/development.md)、[架构文档](docs/engineering/architecture.md) 和 [测试规范](docs/engineering/testing.md)。

其中，[开发协作规范](docs/engineering/development.md) 是开发协作行为、任务分级、开工回执、开发流程、验证要求和最终汇报要求的事实来源。

[架构文档](docs/engineering/architecture.md) 是架构范式、分层规则、依赖方向、领域边界、端口归属、业务事实来源和跨层调用方式的事实来源。

[测试规范](docs/engineering/testing.md) 是测试组织方式、测试类型、测试命名、测试边界和测试数据规则的事实来源。

完成必读文档阅读后，开发协作 AI 必须按 [开发协作规范](docs/engineering/development.md) 的要求输出开工回执，再进入对应任务动作。

## 文档目录

- [文档中心](docs/README.md)：按限界上下文、产品语义和工程治理组织的文档总索引。
- [开发协作规范](docs/engineering/development.md)：定义开发协作 AI 的需求分析、Spec、Plan、TDD、验证、提交和汇报规则。
- [架构文档](docs/engineering/architecture.md)：定义架构范式、分层规则、依赖方向、限界上下文、端口归属和业务事实来源。
- [测试规范](docs/engineering/testing.md)：定义测试金字塔、测试类型、目录结构、命名、边界、数据和门禁规则。
- [技术栈说明](docs/engineering/tech-stack.md)：区分当前采用技术与候选技术，并说明工具链和使用边界。
- [上下文地图](docs/engineering/context-map.md)：集中记录当前上下文、聚合和跨上下文端口协作。
- [日志与错误规范](docs/engineering/logging.md)：定义诊断日志、应用错误、IPC 错误传递和日志门禁规则。
- [终端渲染排障指南](docs/engineering/terminal-rendering.md)：沉淀 xterm、PTY 行列同步、滚动条几何、CJK cell 度量和 Electron 视觉验证经验。
- [UI 契约](docs/product/ui.md)：定义长期有效的工作台信息架构、对象语义、交互不变量、状态反馈和视觉原则。
- [UI 路线图](docs/product/ui-roadmap.md)：记录尚未确认、尚未实现或等待实现对齐的 UI 方向；不作为当前功能或验收事实来源。
- [项目与分支工作区生命周期](docs/contexts/project/workspace-lifecycle.md)：维护项目、登记簿、Git 分支/worktree 和 Agent 挂起协作规则。
- [积木图模型](docs/contexts/block-graph/block-graph.md)：维护终端积木、组合、连接、布局和恢复规则。
- [积木动作模型](docs/contexts/block-graph/block-action-model.md)：定义当前终端积木与终端组合动作的功能意图和作用对象。
- [终端会话生命周期](docs/contexts/run/terminal-session.md)：维护普通终端 PTY 的状态、输入、中断、替换和清理规则。
- [终端依赖工作流](docs/contexts/run/terminal-workflow.md)：维护终端依赖图的上下文协作、状态模型、任务/服务语义、实现入口和验证矩阵。
- [Agent 与会话生命周期](docs/contexts/agent/agent-session.md)：维护 Agent 身份、布局、分支 thread 绑定与 Codex PTY 生命周期。
- [cleancode 原生 MCP](docs/contexts/agent/cleancode-mcp.md)：维护内建 MCP 的工具目录、协议、会话鉴权、审批、上下文协作、实现入口和验证矩阵。

## 按任务阅读

如果任务涉及技术选型、运行环境、工具链、依赖、构建配置或框架使用，开发协作 AI 必须继续阅读 [技术栈说明](docs/engineering/tech-stack.md)。

如果任务涉及界面、交互、视觉、组件、布局或前端体验，开发协作 AI 必须继续阅读 [UI 契约](docs/product/ui.md)。

如果任务涉及 xterm、PTY 行列同步、终端字符宽度、CJK 或 emoji 渲染、终端滚动条、终端黑边或可见字符裁剪，开发协作 AI 必须继续阅读 [终端渲染排障指南](docs/engineering/terminal-rendering.md)。

如果任务涉及 UI 规划、未来功能、未实现方向或产品路线图，开发协作 AI 必须继续阅读 [UI 路线图](docs/product/ui-roadmap.md)。路线图不得被当作当前功能清单或验收标准。

如果任务涉及积木按钮、批量操作、组合动作、动作作用对象或新增积木类型，开发协作 AI 必须继续阅读 [积木动作模型](docs/contexts/block-graph/block-action-model.md)。

如果任务涉及项目、最近项目、Git 分支、worktree、主工作区 checkout、工作区同步或归档，开发协作 AI 必须继续阅读[项目与分支工作区生命周期](docs/contexts/project/workspace-lifecycle.md)。

如果任务涉及终端积木、终端组合、画布 viewport、图持久化、连线校验或图恢复，开发协作 AI 必须继续阅读[积木图模型](docs/contexts/block-graph/block-graph.md)。

如果任务涉及普通终端 PTY、终端输入、Ctrl+C、resize、工作目录、会话替换或清理，开发协作 AI 必须继续阅读[终端会话生命周期](docs/contexts/run/terminal-session.md)。

如果任务涉及终端连线、依赖图、工作流计划、任务/服务模式、服务就绪、流程状态、失败传播或流程停止，开发协作 AI 必须继续阅读 [终端依赖工作流](docs/contexts/run/terminal-workflow.md)。

如果任务涉及 cleancode 原生 MCP、MCP Server、工具名称或 Schema、JSON-RPC 桥接、会话端点、Bearer Token、工具审批、工具审计或 Codex MCP 配置注入，开发协作 AI 必须继续阅读 [cleancode 原生 MCP](docs/contexts/agent/cleancode-mcp.md)。

如果任务涉及 Agent 身份、多个 Agent、布局、Codex thread 绑定、分支对话恢复、Agent PTY、挂起恢复或删除生命周期，开发协作 AI 必须继续阅读 [Agent 与会话生命周期](docs/contexts/agent/agent-session.md)。

如果任务涉及新增或修改跨限界上下文协作、调用方端口、上下文适配器或 Platform composition root，开发协作 AI 必须继续阅读[上下文地图](docs/engineering/context-map.md)。

如果任务涉及日志、错误处理、异常传递、IPC 错误返回、诊断输出、日志级别或日志门禁，开发协作 AI 必须继续阅读 [日志与错误规范](docs/engineering/logging.md)。

如果任务涉及修改文档规则本身，开发协作 AI 必须继续阅读被修改文档及其直接引用的相关文档。

## 行动边界

未完成本文件要求的当前回合阅读前，开发协作 AI 不得修改文件、实现代码、运行测试、创建提交，或声称已理解项目规则。

## 阻塞处理

如果必读文档或当前任务所需的按任务阅读文档无法读取，开发协作 AI 必须停止开发动作，并向用户说明阻塞原因。
