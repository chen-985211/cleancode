# 测试规范

## 文档地位

本文定义 cleancode 项目的测试组织方式和测试编写规则。

本文不重新定义架构规则。架构规则以 [架构文档](architecture.md) 为唯一事实来源。AI 编码行为以 [AI 开发规范](ai-rules.md) 为准。

## 核心原则

- 测试目录必须按 DDD 限界上下文组织。
- 测试目录内部不得按 Clean Architecture 分层。
- 测试必须验证业务行为，不得只验证实现细节。
- 测试名称必须使用项目统一语言。
- 测试必须保持高内聚低耦合。
- 测试不得让生产代码为了测试而破坏封装。
- 生产行为变更必须遵循 TDD，先写失败测试，再写最小实现，最后重构。

## TDD 流程

所有生产行为变更必须遵循 Red-Green-Refactor：

```txt
Red：先写失败测试
  ↓
Green：写最小实现让测试通过
  ↓
Refactor：在测试保护下重构
```

Red 阶段必须先表达期望业务行为。测试失败原因必须来自缺少目标行为，不得来自语法错误、测试环境错误或无意义断言。

Green 阶段只能实现让当前测试通过所需的最小代码，不得顺手扩展未确认行为。

Refactor 阶段不得改变外部行为。重构后必须重新运行相关测试。

纯文档、纯注释、纯格式化、测试重构、测试工具调整和构建配置调整不要求 TDD。

不要求 TDD 的测试或配置变更必须说明验证方式，并运行相关回归检查。

## 标准目录结构

```txt
tests/
  contexts/
    project/
      unit/
      integration/
      contract/
      fixtures/
    block-graph/
      unit/
      integration/
      contract/
      fixtures/
    run/
      unit/
      integration/
      contract/
      fixtures/
    agent/
      unit/
      integration/
      contract/
      fixtures/
    plugin/
      unit/
      integration/
      contract/
      fixtures/
  shared-kernel/
    unit/
    fixtures/
  platform/
    integration/
    fixtures/
  presentation/
    unit/
    fixtures/
  e2e/
  support/
```

`tests/contexts` 是业务测试的根目录。每个限界上下文必须有独立测试目录。

上下文内部按测试类型或业务场景组织，不得再拆成 `domain`、`application`、`infrastructure`、`presentation`。

`tests/shared-kernel` 只测试共享内核中稳定的共享领域概念和应用契约。

`tests/platform` 只测试 Electron 启动、IPC、依赖装配、配置等平台能力。

`tests/presentation` 只测试根级应用外壳、路由和布局。上下文专属界面测试必须放在对应上下文的测试目录。

`tests/e2e` 只放跨上下文端到端用户流程测试。

`tests/support` 只放测试运行器配置、测试工具、测试数据生成器和通用断言。

## 测试类型

### Unit

Unit 测试验证一个聚合、领域服务、用例、策略、值对象或纯组件的行为。

Unit 测试必须快速、稳定、无真实外部依赖。

外部能力必须使用 fake、stub 或 mock。

### Integration

Integration 测试验证应用层端口和基础设施适配器之间的集成行为。

Integration 测试允许使用临时 SQLite、临时文件目录、测试 PTY 或本地测试进程。

Integration 测试不得依赖用户真实环境、真实凭据或不可控网络。

### Contract

Contract 测试验证端口契约、运行期 Agent 工具协议、插件声明和跨上下文事件契约。

Contract 测试必须保证调用方和实现方对输入、输出、错误和副作用的理解一致。

以下变更必须新增或更新 contract 测试：

- 应用层端口输入、输出、错误或副作用变化。
- 运行期 Agent 工具协议变化。
- 插件声明、积木注册 schema 或运行器契约变化。
- 跨上下文领域事件名称、载荷或语义变化。

### E2E

E2E 测试验证完整用户流程。

E2E 测试只能覆盖关键路径，不得替代上下文内的 unit、integration 和 contract 测试。

以下变更必须新增或更新 e2e 测试：

- 影响用户从界面发起并完成的核心流程。
- 影响多个限界上下文协作的可见行为。
- 影响运行期 Agent 创建、修改、运行或修复积木图的主路径。
- 修复已发生的端到端回归缺陷。

## 命名规则

测试文件名必须表达业务行为。

标准格式：

```txt
业务对象.行为.spec.ts
```

示例：

```txt
block-graph.connect-blocks.spec.ts
run.execute-graph.spec.ts
agent.record-tool-call.spec.ts
```

测试用例名称必须描述行为结果，不得描述函数实现。

## 测试边界

每个限界上下文的测试默认只测试本上下文行为。

跨上下文行为必须放在发起协作的上下文测试中，或放在 `tests/e2e`。

不得在一个上下文测试中直接修改另一个上下文的内部模型。

不得通过测试绕过聚合根修改聚合内部状态。

## 测试数据

测试数据必须靠近使用它的限界上下文。

上下文专属 fixture 必须放在该上下文的 `fixtures` 目录。

跨上下文共享 fixture 只能放在 `tests/support`，且不得包含业务规则。

测试数据生成器必须使用统一语言命名。

## 开发协作 AI 测试要求

开发协作 AI 修改业务规则时必须新增或更新 unit 测试。

开发协作 AI 修改应用层用例时必须新增或更新 unit 测试。若用例输入、输出、错误或副作用变化，必须补充 contract 测试。

开发协作 AI 修改基础设施适配器时必须新增或更新 integration 测试。

开发协作 AI 修改运行期 Agent 工具协议、插件声明或跨上下文事件时必须新增或更新 contract 测试。

开发协作 AI 修改关键用户流程时必须新增或更新 e2e 测试。关键用户流程是用户通过界面、运行期 Agent 或本地项目文件完成的核心端到端行为。

开发协作 AI 必须先创建或说明失败测试，再实现生产代码。

开发协作 AI 不得用快照测试替代业务断言。
