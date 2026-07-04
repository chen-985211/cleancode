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
- 所有运行期 Agent 修改都必须形成可审计、可回放、可撤销的操作记录。
- 积木能力通过分层注册机制扩展，不得把业务规则硬编码在 UI 组件或基础设施适配器里。

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

出站适配器负责实现应用层端口，例如 SQLite 仓储、文件系统适配器、PTY 适配器、AI CLI 适配器、上下文级系统能力适配器和运行事件发布器。

基础设施层不得实现业务规则。入站适配器不得绕过应用层用例，出站适配器不得绕过应用层端口。

### 表现层

表现层放置 React 页面、React Flow 节点组件、面板组件、终端界面、预览界面和界面状态。

表现层只负责展示、输入收集、用户反馈和临时 UI 状态。表现层不得直接访问数据库、文件系统、PTY、AI CLI 或领域聚合。

## DDD 领域边界

第一版固定划分以下限界上下文：

- 项目上下文：负责项目、本地项目目录、分支工作区、Git 分支绑定、文件引用和项目元数据。
- 积木图上下文：负责积木、端口、连线、图校验和图变更。
- 运行上下文：负责执行计划、运行状态、运行日志、运行产物和错误恢复策略。
- Agent 上下文：负责 Agent 会话、工具调用、操作记录、审计和权限约束。
- 插件上下文：负责积木能力声明、自定义积木定义和能力扩展。

上下文之间不得直接读取或修改对方内部模型。跨上下文协作只能通过应用层用例、应用层端口或领域事件完成。

## 跨上下文协作模式

跨上下文协作必须保护上下文边界。

同步命令必须进入目标上下文的应用层用例，不得直接调用目标上下文的领域模型、仓储实现或基础设施适配器。

同步查询必须通过目标上下文公开的应用层查询契约完成，只能返回 DTO 或读模型，不得返回聚合、实体或可变内部状态。

应用层端口不得成为跨上下文访问内部模型的后门。端口只能表达稳定外部契约，不能暴露其他上下文的仓储、聚合或实体集合。

领域事件只能表达已经发生的业务事实。事件发布方拥有事件定义，事件消费方拥有自己的投影、读模型和处理策略。

跨上下文投影和读模型只是消费方上下文的本地视图，不是发布方上下文的事实来源。需要判断业务真相时，必须回到事实所属上下文的应用层用例或查询契约。

## 聚合边界

第一版固定使用以下聚合：

- `Project`：项目上下文的聚合根。
- `BlockGraph`：积木图上下文的聚合根。
- `Run`：运行上下文的聚合根。
- `AgentSession`：Agent 上下文的聚合根。
- `PluginManifest`：插件上下文的聚合根。

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
- 项目、项目目录、分支工作区和 Git 分支绑定的唯一事实来源：`Project` 聚合。
- 积木图结构的唯一事实来源：`BlockGraph` 聚合。
- 当前运行生命周期的唯一事实来源：`Run` 聚合。
- 运行期 Agent 操作历史的唯一事实来源：Agent 上下文的审计记录。
- UI 布局和临时交互状态的唯一事实来源：表现层状态。
- 技术能力实现的唯一事实来源：基础设施层适配器。

表现层允许缓存视图模型，基础设施层允许缓存外部资源，但缓存不得成为业务判断依据。所有业务判断必须回到应用层用例和领域层规则。

## 运行期 Agent 操作规则

运行期 Agent 是产品运行时的外部参与者，不属于领域层。

运行期 Agent 工具调用进入系统的唯一入口是应用层用例。运行期 Agent 桥接层属于基础设施层入站适配器，负责把 Codex、Claude Code、Gemini CLI 或其他本地 CLI Agent 的输入转换为应用层命令。

运行期 Agent 不得直接执行以下操作：

- 直接修改 SQLite。
- 直接修改积木图 JSON。
- 直接修改 React 状态。
- 直接调用领域聚合方法。
- 直接读写运行历史。
- 绕过应用层端口访问文件系统、PTY 或系统命令。

## 运行期 Agent 工具协议

第一版应用层用例必须覆盖以下运行期 Agent 工具能力：

- `inspect_graph`
- `create_block`
- `update_block`
- `delete_block`
- `connect_blocks`
- `disconnect_blocks`
- `run_block`
- `run_graph`
- `read_run_logs`
- `create_custom_block`

这些工具名是外部协议名称。工具实现必须进入应用层用例，再由应用层协调领域层和基础设施层完成动作。

## 积木注册规则

积木注册必须分层：

- 领域层定义积木类型、端口、连接规则和图校验规则。
- 应用层定义注册、查询、启用、禁用和版本迁移用例。
- 基础设施层定义运行器实现、插件加载、文件读取和外部命令执行。
- 表现层定义节点外观、图标、表单布局和展示元数据。

不得把运行器实现或 UI 展示元数据放入领域模型。

## 运行规则

运行积木图必须通过应用层运行用例发起。

领域层负责校验积木图、生成执行计划、维护运行状态规则和错误恢复规则。

基础设施层负责执行外部命令、启动 PTY、调用 AI CLI、读写文件和持久化运行记录。

表现层只订阅运行事件并展示日志、状态、产物和预览。

## 顶层结构

```txt
cleancode
  ├─ 限界上下文
  │   ├─ 项目上下文
  │   ├─ 积木图上下文
  │   ├─ 运行上下文
  │   ├─ Agent 上下文
  │   └─ 插件上下文
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
    plugin/
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
        loaders/
      presentation/
        view-models/
        components/
  shared-kernel/
    domain/
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

`src/platform` 只放应用启动、依赖装配、Electron 入口、IPC、配置和系统级连接代码。平台层不得包含业务规则。

`src/platform` 属于外层技术装配代码，不是业务上下文。限界上下文内的代码不得依赖 `src/platform`。

Electron 主进程代码只负责应用启动、窗口生命周期、菜单、IPC 注册和依赖装配。任何带有业务含义的 Electron 能力接入，必须通过所属限界上下文的应用层端口和基础设施适配器完成。

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
基础设施层 Agent 适配器
  ↓
应用层用例
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

SQLite 是第一版持久化实现。SQLite 只能作为应用层仓储端口的基础设施实现存在。

单个工作流允许导出为 JSON。导出的 JSON 是交换格式和调试产物，不是运行期业务事实来源。
