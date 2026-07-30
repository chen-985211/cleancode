# 架构文档

## 文档地位

本文是 cleancode 架构规则的唯一事实来源。

其他文档不得重新定义架构范式、分层规则、依赖方向、领域边界、端口归属、业务事实来源和跨层调用方式。如其他文档与本文冲突，以本文为准。

## 产品定位

cleancode 是一个由本地运行期 Agent 驱动的积木式桌面工作台。用户通过自然语言、画布交互和终端协作来创建、连接、运行和调试可组合的工作流积木。

## 架构范式

cleancode 只采用 DDD + Clean Architecture。

DDD 用于定义业务领域、限界上下文、聚合、实体、值对象、领域服务、领域事件和统一语言。

Clean Architecture 用于定义代码分层、依赖方向、用例入口、端口接口和外部技术适配器。

领域模型必须独立于 Electron、React、SQLite、Node.js、文件系统、PTY、MCP、JSON-RPC 和具体 AI CLI。

## 核心原则

- 领域层是业务规则的唯一事实来源。
- 应用层用例是业务动作的唯一入口。
- 应用层端口是外部能力的唯一抽象入口。
- 基础设施层是外部技术的唯一实现位置。
- 表现层是用户交互和界面状态的唯一实现位置。
- 已提交的业务状态以持久化仓储为唯一事实来源。
- 项目结构必须以限界上下文为第一组织维度，以 Clean Architecture 分层为第二组织维度。
- 每个模块必须高内聚，只表达一个清晰的业务意图、技术职责或界面职责。
- 模块之间必须低耦合，跨模块协作只能依赖稳定契约，不得依赖对方内部实现。
- 运行期 Agent 只能通过应用层用例操作系统，不得直接修改领域对象、数据库、文件存储或 UI 状态。
- 所有运行期 Agent 工具调用都必须形成可审计记录。回放和撤销尚未实现，不得把审计记录表述为可执行操作历史。
- 新增积木能力时必须先明确所属上下文与分层职责，不得把业务规则硬编码在 UI 组件或基础设施适配器里。
- 所有画布对象必须使用 Shared Kernel 的规范身份 `projectId + workspaceId + objectKind + objectId`。Git 分支、Git 初始化状态、目录、显示名和运行实例 ID 都是元数据或其他事实，不得改变画布对象身份。
- 终端、完整流程、顶层执行单元和组合的稳定跨上下文定义必须使用 Shared Kernel 的画布执行语义契约；BlockGraph 继续拥有图结构与成员状态，Presentation、模板和 Agent 只能消费纯分析结果或生成的说明投影。

## 分层规则

```txt
表现层
  ↓
应用层
  ↓
领域层

基础设施层
  ↓
应用层
  ↓
领域层
```

依赖方向必须指向内层。外层允许依赖内层，内层不得依赖外层。

表现层和基础设施层不得相互直接调用。二者只能通过应用层用例和应用层端口协作。

## 内聚与耦合规则

高内聚低耦合是 DDD 与 Clean Architecture 在本项目中的长期约束。

高内聚要求代码按同一个变化原因聚合。一个限界上下文、聚合、用例、端口、适配器、组件或模块只能承担一个清晰职责。

低耦合要求代码通过稳定契约协作。跨层协作必须通过应用层用例和应用层端口；跨上下文协作必须通过应用层用例、应用层端口或领域事件；同一上下文内部不得绕过聚合根修改状态。

以下行为违反高内聚低耦合：

- 把多个限界上下文的业务规则放入同一个模块。
- 把 UI 状态、持久化细节、外部命令和领域规则写在同一个文件。
- 为了复用而创建没有明确领域含义的通用业务工具。
- 让一个上下文直接 import 另一个上下文的领域模型并修改其内部状态。
- 让领域层依赖基础设施实现、表现层组件或平台层代码。
- 让基础设施适配器决定业务规则。
- 让表现层组件直接承载用例编排或领域判断。

共享代码必须满足稳定、明确、跨上下文共同使用三个条件。否则代码必须留在所属限界上下文内。

## 统一策略与单一规则所有者

架构统一首先以动作完成后的可观察结果状态为导向。相同用户意图和等价有效约束必须收敛到同一个结果状态契约；入口、对象类型、Provider、平台、算法步骤和中间状态的差异不得自行改变最终语义。

同一业务语义或用户可见结果状态必须只有一个规范化策略 owner。对象类型、入口、Provider、平台或表现形态的差异如果不改变语义，就只能作为该策略的输入或适配边界，不得形成多套相互接近但独立演化的规则、常量、公式或默认值。

统一策略必须遵守以下规则：

- owner 放在能够完整解释该语义的最窄稳定边界内；单一上下文行为留在该上下文，跨上下文业务协作仍通过应用层用例、端口或领域事件完成，共同的纯表现层行为由根级表现层策略或协调器拥有。
- 消费者只负责提供自身事实并适配为统一输入，不得复制策略判断；结果状态的后置条件、阈值和相关常量随策略集中维护。
- 一个规则 owner 不等于一个状态 owner。各上下文仍拥有自己的业务事实，统一策略只能消费公开 DTO、读模型或调用方已经合法持有的值，不得借复用绕过上下文边界。
- 新增同类对象必须通过实现稳定输入契约获得统一行为，不得要求在既有消费者中继续追加类型分支。
- 同一规则涉及并发操作时，必须由一个协调入口决定顺序、占用或冲突结果，不能让多个入口基于各自过期快照独立决策。
- 只有具有明确领域或产品理由的差异才允许成为例外；例外必须有命名、有 owner、有验收标准，并由测试锁定。

是否进入共享内核仍以稳定、明确、跨上下文共同使用为前提。仅仅出现重复代码不构成共享内核理由；可以由根级表现层协调的画布几何策略，也不得被伪装成跨上下文领域规则。

以画布节点创建为例，若统一结果状态是“新节点完整位于安全视口并保留边距”，终端、终端组合和 Agent 只提供节点边界、占用集合与创建意图，统一几何策略负责让不同初始视口收敛到该状态。当前缩放值是输入，目标缩放和动画过程是实现细节，任何具体缩放案例都不能拥有独立结果定义。

## 层级职责

### 领域层

领域层放置实体、值对象、聚合、领域服务、领域事件、领域策略和领域错误。

领域层只表达业务规则。领域层不得包含 UI、数据库、文件系统、进程、网络、Electron、React、SQLite、Node.js、PTY、MCP、JSON-RPC 或具体 AI CLI 相关代码。

### 应用层

应用层放置用例、命令、查询、DTO、事务边界、应用服务、端口接口和授权编排。

应用层负责协调领域对象完成具体业务目标，例如创建积木、连接积木、运行积木图、记录运行期 Agent 操作。

仓储接口、文件系统接口、PTY 接口、AI CLI 接口、MCP 接口、事件发布接口和审计日志接口都属于应用层端口。

### 基础设施层

基础设施层放置入站适配器和出站适配器。

入站适配器负责把外部协议、外部事件或本地 CLI 输入转换为应用层用例调用，例如 MCP 服务、JSON-RPC 服务和运行期 Agent 桥接适配器。

出站适配器负责实现应用层端口，例如文件系统仓储、PTY 适配器、Git/AI CLI 适配器、上下文级系统能力适配器和运行事件发布器。未来替换为 SQLite 等存储时也只能发生在这一层。

基础设施层不得实现业务规则。入站适配器不得绕过应用层用例，出站适配器不得绕过应用层端口。

### 表现层

表现层放置 React 页面、React Flow 节点组件、面板组件、终端界面、预览界面和界面状态。

表现层只负责展示、输入收集、用户反馈和临时 UI 状态。表现层不得直接访问数据库、文件系统、PTY、AI CLI 或领域聚合。

## DDD 领域边界

当前已实现以下限界上下文：

- 项目上下文：负责项目、本地项目目录、项目登记簿、分支工作区和 Git 分支绑定。
- 积木图上下文：负责终端积木、终端组合、viewport、依赖连接、图校验和图变更。
- 运行上下文：负责 block/agent 类型化终端 owner、PTY 会话、权威终端模型与视图、前台任务、终端工作流计划、服务端口租约、运行状态和失败传播。
- Agent 上下文：负责工作区 Agent、固定 Provider、Provider session ref、Agent launch/activity、原生 MCP、工具调用、审批、审计和权限约束。

Plugin 是规划中的候选上下文，预期负责积木能力声明、自定义积木定义和扩展生命周期；当前没有 Plugin 领域模型、用例、端口或持久化事实，不属于已实现能力。

当前上下文 owner 与实际协作契约集中维护在[上下文地图](context-map.md)。

上下文之间不得直接读取或修改对方内部模型。跨上下文协作只能通过应用层用例、应用层端口或领域事件完成。

## 跨上下文协作模式

跨上下文协作必须保护上下文边界。

同步命令必须进入目标上下文的应用层用例，不得直接调用目标上下文的领域模型、仓储实现或基础设施适配器。

同步查询必须通过目标上下文公开的应用层查询契约完成，只能返回 DTO 或读模型，不得返回聚合、实体或可变内部状态。

应用层端口不得成为跨上下文访问内部模型的后门。端口只能表达稳定外部契约，不能暴露其他上下文的仓储、聚合或实体集合。

领域事件只能表达已经发生的业务事实。事件发布方拥有事件定义，事件消费方拥有自己的投影、读模型和处理策略。

跨上下文投影和读模型只是消费方上下文的本地视图，不是发布方上下文的事实来源。需要判断业务真相时，必须回到事实所属上下文的应用层用例或查询契约。

## 聚合边界

当前实现使用以下聚合：

- `Project`：项目上下文的项目与分支工作区聚合根。
- `ProjectRegistry`：项目上下文的最近项目目录与当前项目选择登记簿聚合根。
- `BlockGraph`：积木图上下文的聚合根。
- `TerminalSession`：运行上下文的类型化 owner PTY 会话聚合根。
- `ForegroundJob`：长期交互 shell 中一次受管前台任务的技术聚合。
- `WorkflowRun`：运行上下文的终端依赖工作流聚合根。
- `AgentSession`：Agent 上下文的聚合根，负责工作区 Agent 的稳定身份、固定 Provider、名称、画布布局、CleanCode MCP 开关和单一 Provider session ref。

聚合外部只能通过聚合根修改聚合内部状态。任何代码不得绕过聚合根直接修改聚合内部实体或集合。

`Project` 聚合可以拥有分支工作区实体或值对象。分支工作区不得成为独立聚合，除非本文先更新聚合边界。

## 端口归属

所有端口接口统一放在应用层。

领域层不得定义仓储接口。领域层只接收领域对象、值对象和领域服务完成业务规则，不感知对象如何被读取或保存。

入站适配器只调用应用层用例，不定义业务用例入口。

出站适配器只实现应用层端口，不定义业务用例入口。

## 事实来源

每类事实只能有一个来源。

- 业务规则的唯一事实来源：领域层。
- 业务动作入口的唯一事实来源：应用层用例。
- 已提交业务状态的唯一事实来源：应用层仓储端口背后的持久化实现。
- 项目、项目目录、稳定工作区 ID、工作区类型/目录/显示名和 Git 分支绑定的唯一事实来源：`Project` 聚合。
- 最近项目目录列表与当前项目选择的唯一事实来源：`ProjectRegistry` 聚合。
- 积木图结构的唯一事实来源：`BlockGraph` 聚合。
- 普通终端和 Agent terminal 的 PTY 会话生命周期、类型化 owner 与终端运行身份的唯一事实来源：Run 上下文的 `TerminalSession` 聚合。
- 终端依赖工作流运行生命周期的唯一事实来源：`WorkflowRun` 聚合。
- 当前终端运行的 `sessionId + runId + generation` 与退出保留/恢复资格由 Run 上下文解释。live PTY 与权威终端模型可由独立 Provider 跨 Electron 应用进程持有；版本化 checkpoint 和有界输出记录是 Run 基础设施恢复资料，不是已提交业务状态。端口租约与实际端点仍是易失运行时事实，warm attach 后必须重新验证监听所有权；端口策略和注入方式仍是 BlockGraph 持久化的服务意图。
- 运行期 Agent 操作历史的唯一事实来源：Agent 上下文的审计记录。
- 工作区 Agent 的稳定身份、固定 Provider、名称、已提交画布布局和 CleanCode MCP 开关的唯一事实来源：`AgentSession` 聚合及其仓储。
- Agent 对话恢复绑定的唯一事实来源：`AgentSession` 聚合及其仓储。绑定键由项目、稳定工作区 ID 和 `agentId` 组成，绑定值是版本化 Provider session ref。
- Provider 对话正文的唯一事实来源：对应 CLI 自身；cleancode 不复制或解析对话正文。
- Agent terminal 的 PTY、权威屏幕、sequence 和视图由 Run 拥有；当前 Provider launch、activity、MCP URL/Token、Hook 和审批属于 Agent 易失状态。
- 选择、悬停、拖动中尺寸等临时交互状态的唯一事实来源：表现层状态。已经提交的积木图布局由 `BlockGraph` 聚合拥有，已经提交的 Agent 画布布局由 `AgentSession` 聚合拥有。
- 技术能力实现的唯一事实来源：基础设施层适配器。

表现层允许缓存视图模型，基础设施层允许缓存外部资源，但缓存不得成为业务判断依据。所有业务判断必须回到应用层用例和领域层规则。

## 运行期 Agent 操作规则

运行期 Agent 是产品运行时的外部参与者，不属于领域层。

运行期 Agent 工具调用进入系统的唯一入口是应用层用例。运行期 Agent 桥接层属于基础设施层入站适配器，负责把 Codex、Claude Code、Gemini CLI 或其他本地 CLI Agent 的输入转换为应用层命令。

Agent 会话必须按项目、稳定 `workspaceId` 和 `agentId` 隔离。Provider 在 Agent 创建时确定且不可切换；一个工作区允许同时拥有多个相同或不同 Provider Agent。每个 Agent 通过应用层端口取得独立 agent-owned Run terminal、Provider launch、MCP 与审批，但共享工作目录，应用不得把这种共享误表示为文件级隔离。默认物理工作区执行普通 Git checkout 时，分支只更新 launch 与显示元数据，不得替换 Agent 身份、terminal、PTY 或 Provider session ref。非 Git 状态、普通分支和 detached HEAD 都不创造新的工作区或 Agent 身份。

cleancode 只持久化版本化 Provider session ref，并通过该 Provider 的正式恢复入口恢复。引用只能来自仍匹配当前 Agent runtime session 与 launch generation 的结构化通知、由 Run 通过 Provider 无关端口交付且经对应 contribution 校验的标准终端 metadata，或由 cleancode 通过 Provider 正式 session 参数预分配并在本次前台 launch 确认启动后接受；预分配引用不得在启动前持久化。系统不能扫描 Provider 历史目录、解析可见终端文本、猜测最近会话或跨 Agent 回退。Provider registry 负责差异；Agent domain、Run domain、通用 IPC 和 UI 不得按 Provider ID 分支。

运行期 Agent 不得直接执行以下操作：

- 直接修改持久化文件或未来数据库。
- 直接修改积木图 JSON。
- 直接修改 React 状态。
- 直接调用领域聚合方法。
- 直接读写运行历史。
- 绕过应用层端口访问文件系统、PTY 或系统命令。

## 运行期 Agent 工具协议

MCP Server 和 JSON-RPC 桥接属于 Agent 基础设施层入站适配器。所有工具实现必须先进入 Agent 应用层用例；工具操作其他限界上下文时，必须依赖 Agent 应用层定义的稳定端口，再由基础设施适配器连接目标上下文的应用层用例。

工具协议必须遵守以下架构不变量：

- 工具名称、输入 Schema、审批属性和结果结构形成明确的外部协议契约，并由契约测试保护。
- MCP 端点和授权必须按 Agent 运行时会话隔离；易失端点、Token 和待审批请求不得成为持久化业务事实。
- 破坏性工具必须通过 Agent 领域策略和应用层审批流程控制，不得只依赖外部 CLI 的批准设置。
- 工具调用必须形成 Agent 审计记录；跨上下文变更仍由目标上下文拥有业务规则和持久化事实。
- 架构文档不得把尚未实现的候选工具列为当前协议能力。

当前原生 MCP 的工具目录、传输与鉴权、会话生命周期、上下文协作、实现入口和验证矩阵以 [cleancode 原生 MCP](../contexts/agent/cleancode-mcp.md) 为唯一维护入口。

## 未来积木扩展约束

当前没有通用积木注册中心或 Plugin 上下文。未来引入注册与插件能力时必须按以下职责分层：

- 领域层定义积木类型、端口、连接规则和图校验规则。
- 应用层定义注册、查询、启用、禁用和版本迁移用例。
- 基础设施层定义运行器实现、插件加载、文件读取和外部命令执行。
- 表现层定义节点外观、图标、表单布局和展示元数据。

这些条目是未来实现的架构约束，不是当前已存在的注册、插件加载或自定义积木能力。运行器实现或 UI 展示元数据不得放入领域模型。

## 运行规则

当前运行终端依赖图必须通过 Run 应用层用例发起。

BlockGraph 领域层负责校验终端依赖图并生成不可变计划；Run 领域层负责维护运行状态和失败传播规则。

基础设施层负责执行外部命令、启动 PTY、预留回环端口、探测服务就绪、检查监听者所有权和发布运行事件。普通交互/直接启动终端可以由独立本地 Provider 持有 live PTY、权威模型和已认证 session，并通过版本化 checkpoint 与有界追加输出支持 cold history；领域和应用层只依赖 Provider/进程/模型端口，不依赖 socket、文件或 Electron API。端口租约和实际端点不作为 checkpoint 业务事实，warm attach 后必须由当前 Run 重新证明监听所有权。活动 `WorkflowRun` 仍只存在于当前应用进程，不随普通 PTY 恢复。

表现层只订阅运行事件并展示终端输出、节点状态和失败反馈。

BlockGraph 持久化服务对端口的意图：`fixed`、`preferred` 或 `auto` 策略，`none`、环境变量或安全参数后缀注入，以及 `http`、`https` 或 `tcp` 协议。Run 在每次启动时产生唯一实际端点；直接启动、组合批量启动和依赖工作流中的受管服务必须复用同一 Run 启动语义。服务就绪、运行事件、界面地址和安全打开都以该实际端点为准，不能把“某个进程可连接配置端口”当成本次服务已经就绪。

Project 在 worktree 归档、项目移除和权威 Git 同步清理失效或目录重绑定的物理工作区时，通过自己拥有的 `WorkspaceRunLifecyclePort` 排空并阻止旧 Run 作用域重启；默认工作区 checkout 不触发清理。BlockGraph 删除终端时通过自己拥有的 `TerminalRunLifecyclePort` 完成同一终端的硬清理。Run 每次启动还通过自己拥有的 `RunRuntimeScopeValidationPort` 向 Project 的公开用例校验项目、稳定工作区 ID 和物理目录；Git 分支不参与 owner 身份。跨上下文契约及失败恢复见[上下文地图](context-map.md)。

### 终端依赖工作流

当前终端依赖工作流只编排 `Terminal` 积木，不把终端组合或 Agent 当作工作流节点。

本节只定义跨上下文边界和事实来源。完整能力语义、状态模型、实现入口和验证矩阵统一维护在 [终端依赖工作流](../contexts/run/terminal-workflow.md)。

- `BlockGraph` 拥有终端执行配置、连接校验与不可变计划生成。
- `WorkflowRun` 拥有启动后的状态和失败传播；Run 通过自己拥有的 `TerminalWorkflowPlanPort` 获取计划，不读取 BlockGraph 内部模型。
- 活动工作流只存在于当前进程；工作区只持久化终端执行配置和连接。
- 任务、服务、并行、汇合、停止和用户反馈的完整当前语义只在终端工作流专文维护。

## 顶层结构

```txt
cleancode
  ├─ 限界上下文
  │   ├─ 项目上下文
  │   ├─ 积木图上下文
  │   ├─ 运行上下文
  │   ├─ Agent 上下文
  │   └─ Plugin（规划中，尚无当前实现）
  │
  ├─ 共享内核
  │   ├─ 共享领域概念
  │   └─ 共享应用端口
  │
  └─ 平台层
      ├─ Electron 应用入口
      ├─ 依赖装配
      ├─ 进程入口路由
      └─ 系统级适配器
```

## 标准目录结构

```txt
src/
  contexts/
    project/
      domain/
        aggregates/
        entities/
        value-objects/
        services/
        events/
        errors/
      application/
        use-cases/
        commands/
        queries/
        ports/
        dto/
      infrastructure/
        persistence/
        filesystem/
      presentation/
        view-models/
        components/
    block-graph/
      domain/
        aggregates/
        entities/
        value-objects/
        services/
        policies/
        events/
        errors/
      application/
        use-cases/
        commands/
        queries/
        ports/
        dto/
      infrastructure/
        persistence/
        registry/
      presentation/
        view-models/
        components/
    run/
      domain/
        aggregates/
        entities/
        value-objects/
        services/
        policies/
        events/
        errors/
      application/
        use-cases/
        commands/
        queries/
        ports/
        dto/
      infrastructure/
        persistence/
        filesystem/
        pty/
        agent-cli/
      presentation/
        view-models/
        components/
    agent/
      domain/
        aggregates/
        entities/
        value-objects/
        services/
        policies/
        events/
        errors/
      application/
        use-cases/
        commands/
        queries/
        ports/
        dto/
      infrastructure/
        persistence/
        cli/
        mcp/
        rpc/
      presentation/
        view-models/
        components/
  shared-kernel/
    domain/
      policies/
      value-objects/
      events/
      errors/
    application/
      ports/
      dto/
  platform/
    electron-main/
    electron-preload/
    renderer-bootstrap/
    composition-root/
    ipc/
    config/
  presentation/
    app-shell/
    routes/
    layouts/
```

`src/contexts` 是业务代码的根目录。每个限界上下文必须在自己的目录内表达领域层、应用层、基础设施层和表现层。

`src/shared-kernel` 只放多个上下文共同使用且稳定的领域概念和应用层契约。共享内核不得成为跨上下文复用杂物的目录。

当前画布执行语义契约属于 Shared Kernel 的稳定领域策略：它只计算终端依赖的完整弱连通流程、顶层执行单元、组合资格和规范说明，不读取仓储或修改 BlockGraph。产品定义以[画布语义契约](../product/canvas-semantic-contract.md)为唯一维护入口。

`src/platform` 只放应用启动、依赖装配、Electron 入口、IPC、配置和系统级连接代码。平台层不得包含业务规则。

`src/platform` 属于外层技术装配代码，不是业务上下文。限界上下文内的代码不得依赖 `src/platform`。

Electron 主进程代码只负责应用启动、窗口生命周期、菜单、IPC 注册和依赖装配。任何带有业务含义的 Electron 能力接入，必须通过所属限界上下文的应用层端口和基础设施适配器完成。

普通终端持久 Provider 以独立 Node 进程入口运行：Platform 只负责构建入口、启动参数和 Run composition，协议认证、PTY/model 所有权、checkpoint 与恢复实现位于 Run infrastructure。renderer、Electron main 与 Provider 可以分别故障；重建窗口或应用 controller 不得绕过 `TerminalSessionService` 直接读取 Provider socket 或恢复文件。

`src/presentation` 只放跨上下文的应用外壳、路由和布局。上下文专属界面必须放在对应上下文的 `presentation` 目录。

目录允许随着实现演进新增子目录，但不得改变限界上下文优先、四层职责和依赖方向。

## 调用流

### 用户操作调用流

```txt
用户操作
  ↓
表现层
  ↓
应用层用例
  ↓
领域模型
  ↓
应用层端口
  ↓
基础设施适配器
  ↓
持久化状态 / 外部系统
```

### Agent 操作调用流

```txt
Agent CLI
  ↓
Provider contribution / MCP 入站适配器
  ↓
Agent 应用层用例
  ↓ AgentTerminalRuntimePort
Run 应用层 TerminalSession / ForegroundJob
  ↓
领域模型
  ↓
应用层端口
  ↓
基础设施适配器
  ↓
审计记录 / 持久化状态 / 运行产物
```

## 项目数据

当前持久化实现位于 Electron 应用数据目录的当前状态代际：项目及当前项目选择、积木图、工作区 Agent 定义及其会话绑定使用版本化 JSON，Agent 审计记录使用 JSONL。积木图仓储只接受版本 `2`，工作区 Agent 仓储只接受 schema v5；旧版本和项目内 `.cleancode` 状态不迁移、不回写。产品尚未公开期间通过新的状态根生成全新当前数据。Run 终端恢复目录另存 checkpoint 和有界追加输出；它只用于技术恢复，不得被 Project、BlockGraph、UI 或 Agent 当作可编辑业务仓储。写入持久化业务状态必须通过应用层仓储端口。

当前没有工作流导入、导出、运行实例恢复、审计回放或撤销能力。这些方向只有在领域语义、用例和测试落地后才能迁入本文的当前事实。
