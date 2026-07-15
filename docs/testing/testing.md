# 测试规范

## 文档地位

本文定义 cleancode 项目的测试组织方式和测试编写规则。

本文不重新定义架构规则。架构规则以 [架构文档](../engineering/architecture.md) 为唯一事实来源。AI 编码行为以 [开发协作规范](../engineering/development.md) 为准。

## 核心原则

- 测试目录必须按测试类型组织。
- 测试类型目录内部必须继续按 DDD 限界上下文或层级归属组织。
- 测试目录内部不得按 Clean Architecture 生产分层组织。
- 测试必须验证业务行为，不得只验证实现细节。
- 测试名称必须使用项目统一语言。
- 测试必须保持高内聚低耦合。
- 测试不得让生产代码为了测试而破坏封装。
- 测试必须遵循测试金字塔，默认选择能证明行为的最低测试层级。
- E2E 是少量、高成本、覆盖关键路径的测试，不得作为默认回归手段，也不得替代 unit、integration 或 contract 测试。
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

## 测试金字塔与层级选择

测试层级选择必须从低到高判断。开发协作 AI 和开发者不得因为用户从界面触发某个行为，就默认新增 E2E 测试。

选择测试层级时必须按以下顺序提问：

1. 是否可以用 unit 测试证明目标行为。
2. 是否需要真实基础设施适配器或本地外部能力，因此应使用 integration 测试。
3. 是否修改了端口、协议、事件或跨边界契约，因此应使用 contract 测试。
4. 是否仍有无法由低层测试证明的关键跨上下文用户路径，才考虑 E2E 测试。

Unit 测试优先覆盖以下行为：

- 领域规则、值对象、聚合不变量和领域服务。
- 应用层用例的输入、输出、错误和可观察副作用。
- 纯表现层状态、组件交互、表单校验、占位提示、按钮状态、文案和非真实浏览器依赖的 UI 行为。
- 能通过 fake、stub 或 mock 稳定表达的外部依赖交互。

Integration 测试用于证明应用层端口与基础设施适配器能真实协作，例如文件系统仓储、临时数据库、测试 PTY、本地测试进程或平台适配器。不得为了验证纯 UI 状态、纯领域规则或单个用例分支而新增 integration 测试。

Contract 测试用于证明调用方和实现方对稳定边界的理解一致，例如 IPC 载荷、运行期 Agent 工具协议、插件声明、应用层端口输入输出和跨上下文事件。

E2E 测试只允许作为测试金字塔顶端的少量关键路径验证。新增或更新 E2E 测试前，必须明确说明低层测试为什么不足以证明该风险。E2E 测试只覆盖主路径或已发生的端到端回归；边界条件、错误分支、视觉细节、表单提示、按钮状态和内部状态迁移应下沉到 unit、integration 或 contract 测试。

开发过程中应优先运行受影响层级的目标测试来获得快速反馈。最终需要运行哪些统一门禁，以 [开发协作规范](../engineering/development.md) 和根目录 `package.json` 的脚本为准。

## 测试门禁

应用开发测试必须纳入本地统一质量门禁。

`pnpm pre-commit` 必须执行 `pnpm test`，确保 AI 或开发者每次修改生产代码、测试代码、构建配置、工具配置或依赖后都会运行测试。

测试命令和门禁顺序的可执行事实来源是根目录 `package.json`。

`pnpm test` 必须按测试金字塔从低层到高层串行执行：

```txt
pnpm test:unit
  ↓
pnpm test:integration
  ↓
pnpm test:contract
  ↓
pnpm test:e2e
```

底层测试必须先失败先反馈。更慢、更接近真实用户路径的测试必须放在后面运行。任何新增测试类型或调整测试目录时，都必须同步维护 `package.json` 的测试脚本和本文档。

开发协作 AI 在最终说明中必须说明新增或更新了哪些测试、运行了哪些测试，以及是否存在未覆盖风险。

## 标准目录结构

```txt
tests/
  unit/
    contexts/
      project/
      block-graph/
      run/
      agent/
      plugin/
    shared-kernel/
    presentation/
    support/
  integration/
    contexts/
      project/
      block-graph/
      run/
      agent/
      plugin/
    platform/
  contract/
    contexts/
      project/
      block-graph/
      run/
      agent/
      plugin/
    shared-kernel/
  e2e/
  fixtures/
    contexts/
      project/
      block-graph/
      run/
      agent/
      plugin/
    shared-kernel/
    presentation/
    platform/
  support/
```

`tests/unit` 是单元测试根目录。上下文内单元测试放在 `tests/unit/contexts/<context>`；共享内核单元测试放在 `tests/unit/shared-kernel`；根级表现层单元测试放在 `tests/unit/presentation`；测试工具自身的单元测试放在 `tests/unit/support`。

`tests/integration` 是集成测试根目录。上下文内集成测试放在 `tests/integration/contexts/<context>`；平台能力集成测试放在 `tests/integration/platform`。

`tests/contract` 是契约测试根目录。上下文内端口、运行期 Agent 工具协议、插件声明和跨上下文事件契约测试放在 `tests/contract/contexts/<context>`；共享内核契约测试放在 `tests/contract/shared-kernel`。

测试类型目录内部按 DDD 限界上下文、共享内核、平台或表现层归属组织，不得再拆成 `domain`、`application`、`infrastructure`、`presentation` 等生产分层目录。

`tests/e2e` 只放跨上下文端到端用户流程测试。

`tests/fixtures` 只放测试数据、fixture 和测试数据生成器。上下文专属 fixture 放在 `tests/fixtures/contexts/<context>`；跨上下文共享 fixture 只能放在 `tests/fixtures` 中有明确归属的目录，且不得包含业务规则。

`tests/support` 只放测试运行器配置、通用断言和测试运行支撑文件。`tests/support` 不放 `.spec.ts` 或 `.spec.tsx` 测试文件。

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

E2E 测试验证完整用户流程，是测试金字塔中最少、最慢、最接近真实用户路径的一层。

E2E 测试只能覆盖关键路径，不得替代上下文内的 unit、integration 和 contract 测试。不得因为改动发生在 UI 上、按钮由用户点击、或功能最终可由用户操作，就自动新增 E2E 测试。

以下变更必须先评估是否需要新增或更新 E2E 测试；只有低层测试无法证明完整风险时，才新增或更新 E2E 测试：

- 影响用户从界面发起并完成的核心流程。
- 影响多个限界上下文协作的可见行为。
- 影响运行期 Agent 创建、修改、运行或修复积木图的主路径。
- 修复已发生的端到端回归缺陷。

以下场景不得优先使用 E2E 测试：

- 纯领域规则、用例分支、值对象、格式化、排序、过滤或状态计算。
- 单个 React 组件的显示状态、表单 placeholder、按钮 disabled/hover/focus、tooltip、文案或布局细节。
- 已能由 unit、integration 或 contract 测试稳定证明的行为。
- 为了提高覆盖率、补心理安全感或观察实现细节而新增的重复测试。

每个新增 E2E 测试必须保持范围最小，只验证一个关键用户目标。若同一能力有多个边界条件或失败分支，E2E 只覆盖代表性主路径，其余分支必须放到更低层级。

### E2E 稳定性与诊断

Electron E2E 必须使用确定性同步条件，不得以固定时长的 `waitForTimeout` 代替进程、协议或界面状态就绪。终端场景必须按当前 `sessionId` 等待精确输出 marker；只验证终端渲染或选区时应使用可控本地程序产生固定输出，不得额外依赖交互式 shell 的启动时机。验证 PTY 工作目录时应查询 Run 上下文公开的工作目录能力，不得通过输入 `pwd` 后解析界面回显间接推断。

整套 Electron E2E 只允许在全局 setup 中构建一次产物，测试文件不得各自重复构建。场景之间仍必须使用独立 Electron 进程、项目目录和应用状态目录，并在清理时等待 Electron 进程退出。

E2E 失败时必须保留足以定位异步缺口的诊断产物，至少包括页面截图、Playwright trace、Electron/renderer 日志、当前终端 `sessionId` 和输出尾部。失败产物写入被 Git 忽略的 `test-results/`，不得污染业务目录或持久化 fixture。重试只能用于暴露并统计 flaky，不能替代确定性同步和根因修复；本地统一门禁不得靠静默重试掩盖首次失败。

确定性触发、完成条件、稳定身份、断言 oracle、场景隔离、清理和失败证据的落地方法见 [E2E 稳定性改造手册](e2e-stability.md)。该手册是操作指南，不改变本文件定义的测试规则。

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

每个限界上下文的测试默认只测试本上下文行为，并放在对应测试类型目录下的 `contexts/<context>` 中。

跨上下文行为必须放在发起协作的上下文测试中，或放在 `tests/e2e`。

不得在一个上下文测试中直接修改另一个上下文的内部模型。

不得通过测试绕过聚合根修改聚合内部状态。

## 测试数据

测试数据必须按使用它的限界上下文或层级归属放置。

上下文专属 fixture 必须放在 `tests/fixtures/contexts/<context>`。

跨上下文共享 fixture 只能放在 `tests/fixtures` 中有明确归属的目录，且不得包含业务规则。

测试数据生成器必须使用统一语言命名。

## 开发协作 AI 测试要求

开发协作 AI 修改业务规则时必须新增或更新 unit 测试。

开发协作 AI 修改应用层用例时必须新增或更新 unit 测试。若用例输入、输出、错误或副作用变化，必须补充 contract 测试。

开发协作 AI 修改基础设施适配器时必须新增或更新 integration 测试。

开发协作 AI 修改运行期 Agent 工具协议、插件声明或跨上下文事件时必须新增或更新 contract 测试。

开发协作 AI 修改关键用户流程时必须先做测试层级选择，并优先补充能证明行为的最低层测试。只有低层测试无法证明跨上下文主路径风险时，才新增或更新 E2E 测试。关键用户流程是用户通过界面、运行期 Agent 或本地项目文件完成的核心端到端行为，但“由用户触发”本身不是新增 E2E 的充分理由。

开发协作 AI 新增或更新 E2E 测试时，必须在 Spec、Plan 或最终说明中写明：低层测试为什么不足、该 E2E 证明的用户目标是什么、是否存在可下沉到 unit、integration 或 contract 的分支。

开发协作 AI 必须先创建或说明失败测试，再实现生产代码。

开发协作 AI 不得用快照测试替代业务断言。
