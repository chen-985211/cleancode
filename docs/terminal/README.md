# 终端文档

## 定位

本目录与 `contexts`、`product`、`engineering`、`testing` 同级，集中维护普通终端跨越多个架构层级的专项资料，例如终端运行时演进、PTY 与 renderer 协作、输出恢复、性能预算和终端专项排障。

终端主题不得因为同时涉及 Run、Platform、Presentation 和测试就笼统放入 `engineering/`。当一份文档的主要变化原因是普通终端自身，并且无法由单个限界上下文独立拥有时，应放入本目录。

## 边界

本目录不取代事实 owner：

- 普通终端 PTY 会话生命周期由 [Run](../contexts/run/terminal-session.md) 拥有。
- 终端依赖工作流由 [Run](../contexts/run/terminal-workflow.md) 拥有。
- 服务端口租约和实际端点由 [Run](../contexts/run/service-port-management.md) 拥有。
- 终端积木、组合、连接和执行配置由 [BlockGraph](../contexts/block-graph/block-graph.md) 拥有。
- 稳定用户交互由 [UI 契约](../product/ui-contract.md) 拥有。
- Agent 身份、thread、MCP 和 Agent PTY 生命周期仍由 [Agent](../contexts/agent/agent-session.md) 拥有。

本目录只维护跨层终端专项知识、实施路线和技术证据，不复制上述文档中的稳定业务规则。

## 当前文档

- [普通终端运行时演进路线图](runtime-roadmap.md)：权威模型、交互质量、跨应用恢复和多运行环境的四阶段路线。
- [终端渲染排障指南](rendering.md)：xterm、PTY 行列、CJK/emoji、滚动条、可见裁剪和 Electron 几何验证经验。

## 放置规则

- 属于单个限界上下文的终端业务事实继续放在 `docs/contexts/<context>/`。
- 跨层的终端运行时、渲染、恢复、性能和专项排障文档放在 `docs/terminal/`。
- 全仓通用的架构、协作、技术栈和日志规则继续放在 `docs/engineering/`。
- 纯产品语义和未实现 UI 候选继续放在 `docs/product/`。
- 测试组织与通用稳定性方法继续放在 `docs/testing/`；只服务于终端专项的测试证据可以由本目录文档引用。
- 新增终端专项文档时，必须更新本文和文档中心的直接导航。
