# AGENTS.md

## 定位

本文是 cleancode 仓库的 AI 阅读入口，只负责把当前任务路由到必要文档。

完整文档目录由 [文档中心](docs/README.md) 维护。本文不复制开发、架构、测试或产品规则，也不要求 AI 在每个回合重复读取固定文档集合。

## 阅读原则

1. 先理解用户目标、列出已知目标路径并检查直接目标文件，再判断本次实际动作。
2. 必读文档由“目标路径基础路由”和“动作与风险叠加路由”共同决定；多个条件同时命中时读取并集，不得只选择其中一种归类。
3. 只读取会影响本次判断、修改或验证的文档和章节，不做预防性全库阅读。
4. 文档中的普通链接只表示导航、出处或事实移交，不自动产生继续阅读义务。只有当前任务也命中链接目标的路由条件，或当前文档不足以解决事实冲突时，才继续读取。
5. 同一连续任务中，已经读取且内容未变化的文档不重复读取；复用时必须在开工回执中如实注明。任务目标、目标路径或实际动作变化后重新路由。
6. 修改规则文档时，读取目标文档及本次实际改变的规则 owner；不得因为目标文档包含链接就递归读取所有被引用文档。

默认读取相关章节即可。只有任务会改变整份文档的职责、存在跨章节冲突，或无法通过局部内容确定规则时，才完整阅读该文档。

## 开工要求

只读分析、解释、审查和状态查询不要求读取开发协作规范，也不要求开工回执；当结论依赖项目规则时，仍须按本文路由读取必要的 owner 文档。

任务会修改项目文件、配置、依赖、Git 状态或其他项目状态时，必须先读取 [开发协作规范](docs/engineering/development.md) 中与任务分级、执行流程、验证和输出相关的章节，并按其要求输出包含规则路由证据的开工回执。

需要修改文件但尚未完成当前任务所需阅读时，不得开始修改、运行测试或创建提交。

用户要求“直接开始”、跳过 SDD、跳过 Spec/Plan 或不等待确认时，只影响开发协作规范允许省略的流程，不取消本文的文档路由、开工回执、适用的 TDD 或验证要求。

## 确定性路由流程

在执行会改变项目状态的动作前，必须按以下顺序完成路由：

1. 列出当前已知的目标文件、目录或配置。
2. 按“目标路径基础路由”确定基础必读文档。
3. 按“动作与风险叠加路由”加入本次行为实际命中的文档。
4. 在开工回执中记录“目标路径或动作 → 命中文档及章节”，然后才能修改、运行测试或提交。
5. 执行中新增目标路径、跨入新层级或发现新的行为风险时，先补充路由和开工回执，再处理新增范围；已经完成且未变化的路由无需重复。

### 目标路径基础路由

| 目标路径或文件类型                                                                                                                                                        | 基础必读文档                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 任意 `src/**` 生产代码                                                                                                                                                    | [架构文档](docs/engineering/architecture.md)的“核心原则”“分层规则”和目标所属“层级职责”；同时读取[测试规范](docs/testing/testing.md)以确定最低有效测试层。仅注释、纯格式化或不改变契约的机械生成物可以免读测试规范，并在回执说明理由 |
| `src/shared-kernel/**`                                                                                                                                                    | [架构文档](docs/engineering/architecture.md)的领域边界、跨上下文协作和顶层结构章节；[上下文地图](docs/engineering/context-map.md)                                                                                                   |
| `src/contexts/project/**`                                                                                                                                                 | [项目与分支工作区生命周期](docs/contexts/project/workspace-lifecycle.md)                                                                                                                                                            |
| `src/contexts/block-graph/**`                                                                                                                                             | [积木图模型](docs/contexts/block-graph/block-graph.md)；动作目标、审批作用对象或 Agent 工具同时命中时再读[积木动作模型](docs/contexts/block-graph/block-action-model.md)                                                            |
| `src/contexts/run/infrastructure/{pty,provider,persistence,terminal-model,filesystem}/**`，或 Run 中名称包含 `Terminal`、`Session`、`Recovery`、`WorkingDirectory` 的目标 | [终端会话生命周期](docs/contexts/run/terminal-session.md)                                                                                                                                                                           |
| `src/contexts/run/infrastructure/{block-graph,readiness}/**`，或 Run 中名称包含 `Workflow`、`Task`、`ManagedService` 的目标                                               | [终端依赖工作流](docs/contexts/run/terminal-workflow.md)                                                                                                                                                                            |
| `src/contexts/run/infrastructure/network/**`，或 Run 中名称包含 `Port`、`Lease`、`Endpoint` 的目标                                                                        | [本地服务端口治理](docs/contexts/run/service-port-management.md)                                                                                                                                                                    |
| 其他 `src/contexts/run/**`                                                                                                                                                | 根据实际动作至少选择一份 Run owner 专文，并在回执写明选择依据；命中多种 Run 语义时读取并集                                                                                                                                          |
| `src/contexts/agent/infrastructure/{providers,pty,run,cli}/**`，或 Agent 中名称包含 `Session`、`Provider`、`Terminal`、`Thread`、`Layout` 的目标                          | [Agent 与会话生命周期](docs/contexts/agent/agent-session.md)                                                                                                                                                                        |
| `src/contexts/agent/infrastructure/{mcp,rpc}/**`，或 Agent 中名称包含 `Tool`、`Approval`、`Audit`、`Mcp` 的目标                                                           | [cleancode 原生 MCP](docs/contexts/agent/cleancode-mcp.md)                                                                                                                                                                          |
| 其他 `src/contexts/agent/**`                                                                                                                                              | 根据实际动作至少选择一份 Agent owner 专文，并在回执写明选择依据；会话与 MCP 语义同时命中时读取并集                                                                                                                                  |
| `src/**/presentation/**`、`src/presentation/**`、`src/platform/renderer-bootstrap/**`、生产 `.tsx` 或 `.css`                                                              | [UI Style Guide](docs/product/ui-style-guide.md)中与组件、状态、动效和可访问性相关的章节                                                                                                                                            |
| `src/platform/composition-root/**`                                                                                                                                        | [架构文档](docs/engineering/architecture.md)的 Platform、调用流和跨上下文协作章节；[上下文地图](docs/engineering/context-map.md)；明确受影响的上下文专文                                                                            |
| `src/platform/{ipc,electron-preload}/**`、`src/platform/electron-main/**/*IpcHandlers.ts`                                                                                 | [架构文档](docs/engineering/architecture.md)的 Platform 和调用流章节；[上下文地图](docs/engineering/context-map.md)；[日志与错误规范](docs/engineering/logging.md)；明确受影响的上下文专文                                          |
| `src/platform/electron-main/**`、`src/platform/config/**`                                                                                                                 | [架构文档](docs/engineering/architecture.md)的 Platform 相关章节；[技术栈说明](docs/engineering/tech-stack.md)；实际涉及 IPC、跨上下文装配或日志时继续按叠加路由                                                                    |
| `src/platform/logging/**`                                                                                                                                                 | [日志与错误规范](docs/engineering/logging.md)                                                                                                                                                                                       |
| `src/vite-env.d.ts`                                                                                                                                                       | [技术栈说明](docs/engineering/tech-stack.md)；修改 `Window.cleancode`、preload 或其他运行时契约声明时，再按 IPC 路由读取架构、日志、上下文专文和测试规范                                                                            |
| `tests/**`、`tests/fixtures/**`、`tests/support/**`、`vitest*.ts`                                                                                                         | [测试规范](docs/testing/testing.md)                                                                                                                                                                                                 |
| `tests/e2e/**`、`vitest.e2e*.ts`、`tests/support/e2e*.ts`、`tests/support/*E2e.ts`，以及被 E2E 直接或间接引用的 support                                                   | [测试规范](docs/testing/testing.md)和 [E2E 稳定性改造手册](docs/testing/e2e-stability.md)                                                                                                                                           |
| `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.npmrc`、`patches/**`、`*.config.*`、`tsconfig*.json`、`.dependency-cruiser.cjs`、`knip.json`                   | [技术栈说明](docs/engineering/tech-stack.md)；如果改变测试命令、测试基础设施或测试 workflow，再叠加[测试规范](docs/testing/testing.md)                                                                                              |
| `scripts/**`、`.github/workflows/**`、`index.html`、`public/**`                                                                                                           | [技术栈说明](docs/engineering/tech-stack.md)；测试、日志、主题、i18n 或文档门禁脚本同时读取对应规则 owner                                                                                                                           |
| 新增、移动、重命名或删除文档                                                                                                                                              | [文档中心](docs/README.md)；只修改既有文档内容时读取目标文档及实际改变的规则 owner                                                                                                                                                  |

### 动作与风险叠加路由

| 本次实际动作或风险                                                         | 必须叠加读取                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新增能力，修改生产行为，修复缺陷，进行性能优化或重构生产代码               | 按[测试规范](docs/testing/testing.md)确定是否适用 TDD、最低有效测试层和回归范围；不能以动作名称、尚未修改测试文件或“行为不变”为由跳过测试影响分析    |
| 修改业务事实、状态、不变量、事实来源或生命周期                             | 对应限界上下文专文；[架构文档](docs/engineering/architecture.md)中相关的聚合、端口、事实来源和调用流章节                                             |
| 修改分层、依赖方向、应用层端口、跨上下文协作或 composition root            | [架构文档](docs/engineering/architecture.md)和[上下文地图](docs/engineering/context-map.md)；跨上下文时读取调用方与提供方两侧专文                    |
| 修改稳定的用户可见行为、信息架构、对象作用域、状态含义、焦点结果或交互结果 | [UI 契约](docs/product/ui-contract.md)                                                                                                               |
| 修改视觉、组件选择、布局、状态呈现、动效或可访问性交互                     | [UI Style Guide](docs/product/ui-style-guide.md)；只有同时改变稳定产品语义时再叠加 UI 契约                                                           |
| 修改用户可见文案、可访问名称、locale、Message key 或 i18n 门禁             | [国际化规范](docs/i18n/README.md)                                                                                                                    |
| 讨论尚未确认或尚未实现的 UI 方向                                           | [UI 路线图](docs/product/ui-roadmap.md)；不得把路线图内容当成当前已交付行为                                                                          |
| 修改项目登记、Git 分支、worktree、checkout、同步、归档或补偿               | [项目与分支工作区生命周期](docs/contexts/project/workspace-lifecycle.md)                                                                             |
| 修改终端积木、终端组合、viewport、连线、图持久化或图恢复                   | [积木图模型](docs/contexts/block-graph/block-graph.md)；涉及动作作用对象时叠加[积木动作模型](docs/contexts/block-graph/block-action-model.md)        |
| 修改普通终端 PTY、输入、中断、resize、工作目录、会话替换、恢复或清理       | [终端会话生命周期](docs/contexts/run/terminal-session.md)                                                                                            |
| 修改终端依赖、工作流计划、任务/服务、就绪、状态传播或停止                  | [终端依赖工作流](docs/contexts/run/terminal-workflow.md)                                                                                             |
| 修改本地服务端口策略、租约、注入、监听所有权或实际端点                     | [本地服务端口治理](docs/contexts/run/service-port-management.md)                                                                                     |
| 修改 Agent 身份、布局、thread 绑定、Provider、Agent PTY 或挂起恢复         | [Agent 与会话生命周期](docs/contexts/agent/agent-session.md)                                                                                         |
| 修改 cleancode 原生 MCP、工具 Schema、鉴权、审批、审计或 MCP 注入          | [cleancode 原生 MCP](docs/contexts/agent/cleancode-mcp.md)                                                                                           |
| 修改持久化 schema、版本、仓储格式、迁移或文件布局                          | [技术栈说明](docs/engineering/tech-stack.md)、对应上下文专文和[测试规范](docs/testing/testing.md)                                                    |
| 修改 IPC channel、preload/Window API、命令协议、事件载荷或外部协议         | [架构文档](docs/engineering/architecture.md)、[日志与错误规范](docs/engineering/logging.md)、受影响上下文专文和[测试规范](docs/testing/testing.md)   |
| 修改日志、错误传递、诊断输出、敏感信息处理或日志门禁                       | [日志与错误规范](docs/engineering/logging.md)                                                                                                        |
| 修改 xterm 渲染、PTY 行列、CJK/emoji cell、滚动条或可见裁剪                | [终端渲染排障指南](docs/terminal/rendering.md)                                                                                                       |
| 新增或修改测试、选择测试层级、调整测试目录或测试基础设施                   | [测试规范](docs/testing/testing.md)；Electron/PTY E2E、flaky、固定等待、资源隔离或清理问题再叠加 [E2E 稳定性改造手册](docs/testing/e2e-stability.md) |
| 修改依赖、构建、打包、运行环境、框架或工具链                               | [技术栈说明](docs/engineering/tech-stack.md)                                                                                                         |

### 复合场景判定

复合任务必须累计命中条件，不得用一个宽泛标签覆盖其他规则。例如：

- 修改 Agent 控制台的恢复按钮：生产 Presentation 路径先命中架构、测试规范和 UI Style Guide；如果改变交互结果、文案或 Agent 状态，再分别叠加 UI 契约、i18n 和 Agent 生命周期。
- 修复终端 resize：Run 路径 + 生产行为 + PTY/resize；如果涉及 xterm 可见几何，再叠加终端渲染排障指南。
- 新增 IPC：Platform 路径 + IPC 协议 + 受影响上下文 + 生产行为，必须同时命中架构、上下文地图、日志、上下文专文和测试规范。
- 只修复 E2E flaky：E2E 路径 + flaky 风险，读取测试规范和 E2E 稳定性手册；只有同时修改生产代码时才叠加生产代码路径规则。

## 阻塞处理

如果当前任务按上述条件必需的文档无法读取，必须停止会受该规则影响的动作并说明原因。未命中的文档不可读不构成阻塞。
