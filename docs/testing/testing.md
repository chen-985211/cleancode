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

## 统一 Oracle 与参数化验证

测试统一必须以动作完成后的可观察结果状态为 oracle。相同意图和等价约束下，测试应证明不同输入与执行路径最终满足同一个后置条件，而不是要求它们使用相同算法、固定参数或中间步骤。

一个真实缺陷中的具体数值、对象类型、Provider、平台或操作顺序是回归样本，不自动等于完整需求。编写 Red 测试前，必须先判断该样本是否属于更一般的不变量；如果属于，测试必须同时锁定统一结果状态和原始回归样本。

同一语义的测试必须使用一个规范化结果状态 oracle。不同消费者不得各自复制近似断言、容差、阈值或期望值。oracle 应直接表达外部可观察的后置条件或领域不变量，不得绑定无产品含义的实现中间值。

参数化验证必须遵守以下规则：

- 列出会影响行为的输入维度、等价类、边界值和明确例外；原始缺陷样本只是矩阵中的一项。
- 使用表驱动或参数化测试让同一结果状态 oracle 覆盖对象类型、入口、状态和环境组合；组合过多时优先覆盖每个等价类、边界值和已知交互风险。
- 能从稳定注册表或契约发现同类实现时，应由测试矩阵读取该事实，防止新增类型静默漏测；不能自动发现时，必须维护一份集中、可审查的 canonical case table。
- 纯策略和不变量优先由 unit 测试穷举主要矩阵；integration 或 contract 测试证明各消费者正确接入；E2E 只保留低层测试无法证明的代表性用户路径。
- 显式差异必须有独立命名和理由，不得通过复制整套测试把偶然差异固化为产品规则。

以画布节点创建为例，若不变量是“创建后节点完整位于扣除遮挡层后的安全视口内，并保留规定边距”，统一结果状态 oracle 应断言节点屏幕矩形包含于安全视口矩形。当前缩放、窗口和安全视口尺寸、节点类型与尺寸、遮挡区域都是参数；目标缩放和动画步骤不是 oracle，某个具体缩放值只能作为回归样本。

修复单个案例但没有覆盖其所属不变量，或者同一语义存在多套结果状态 oracle，均不视为完整回归保护。

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

`pnpm pre-commit` 必须执行 `pnpm test:full`，确保 AI 或开发者每次修改生产代码、测试代码、构建配置、工具配置或依赖后都会运行全部低层测试和完整 Electron E2E。

测试命令和门禁顺序的可执行事实来源是根目录 `package.json`。

`pnpm check:quality` 聚合依赖、文档、文件规模、日志、Provider 边界、主题、动效、国际化、可移植路径、测试稳定性、格式、Lint、类型、依赖方向和未使用代码门禁；`pnpm test:core` 聚合全部 unit、integration 和 contract。`pnpm test:unit` 通过独立 Vitest projects 让 `tests/unit/presentation` 使用 jsdom，其余 unit 使用 Node 环境；integration 和 contract 也使用 Node 环境。CI 使用 `pnpm test:core:ci` 串行运行 integration 文件，避免原生 PTY、端口和系统进程在同一 runner 内竞争。Windows CI 可以把 unit、integration 和 contract 文件确定性地分到两个独立 runner；每个 runner 内的 integration 仍须串行，两个 shard 的并集必须覆盖全部测试文件。

国际化静态门禁必须通过 `pnpm check:i18n` 执行，并在 `tests/unit/support/check-i18n.spec.ts` 使用违规与合法 fixture 锁定检测边界。文案归属、不可翻译内容和 AI 修改要求以 [国际化规范](../i18n/README.md) 为准。

可移植文件系统路径门禁必须通过 `pnpm check:portable-paths` 执行，并由 `pnpm check:quality` 自动进入本地和三平台 CI。它检查 `src` 与 `tests` 中高置信度的手工路径分隔符拼接，以及对平台中立路径使用单平台绝对路径正则的断言；文件系统路径必须使用 `node:path` 的 `join`、`resolve`、`dirname`、`basename` 或显式 `posix` / `win32` API。URL、路由、静态路径 fixture 和已经明确规范化为 POSIX 的内部表示不属于违规。`tests/unit/support/check-portable-paths.spec.ts` 必须使用违规与合法 fixture 锁定这些检测边界。

测试稳定性静态门禁必须通过 `pnpm check:test-stability` 执行，并由 `pnpm check:quality` 自动进入本地和三平台 CI。它扫描 Electron E2E、直接 fixture、支撑代码和 E2E Vitest 配置，拒绝 `waitForTimeout`、统一状态轮询原语之外的 timer-only sleep、直接 `expect.poll` / `vi.waitUntil`、配置级自动重试，以及在循环中捕获并重复启动或执行场景动作。Node 侧普通轮询必须通过 `tests/support/e2ePolling.ts` 提交可观察状态、完成谓词、失败 deadline 和诊断描述；Playwright locator 自动等待和只计算页面内确定性状态的 `waitForFunction` 仍由 Playwright 生命周期负责。事件订阅、清理和“稳定一段时间”语义仍可在具体支撑中使用 timer 作为失败 deadline 或明确完成条件。`tests/unit/support/check-test-stability.spec.ts` 必须使用违规与合法 fixture 锁定静态检测边界，`tests/unit/support/e2ePolling.spec.ts` 必须证明状态决定成功且 deadline 保留最后观测诊断。静态门禁只拒绝可机械证明的高置信度违规，不能替代对 `observe` 与 `accept` 业务语义的行为测试和审查。

主题静态门禁必须通过 `pnpm check:theme` 执行。除禁止生产 UI 在集中主题文件外写入颜色字面量外，它还必须校验由主题 CSS 确定性生成、供 Run 与 Presentation 共用的 canonical terminal palette，并拒绝缺失或陈旧生成物；显式生成入口是 `node scripts/check-theme.mjs --write-terminal-palette`，`tests/unit/support/check-theme.spec.ts` 使用生成、陈旧和合法 fixture 锁定边界。

Agent Provider-neutral Presentation 门禁必须通过 `pnpm check:agent-provider-boundary` 执行。它必须从内建 contribution 的静态 descriptor 自动发现当前和未来 Provider ID，拒绝生产表现层中的品牌 ID 与具体 Provider infrastructure 引用，并在无法发现 ID 时失败关闭；`tests/unit/support/check-agent-provider-boundary.spec.ts` 锁定未知 Provider、TSX/CSS、import、legacy 例外和发现失败边界。Provider registry 与组件仍须分别使用行为测试证明未知 descriptor 能沿通用路径工作，静态门禁不能替代 capability 降级与 attach/retry 测试。

`pnpm test` 是本地快速测试门禁，必须按测试金字塔从低层到高层串行执行：

```txt
pnpm test:unit
  ↓
pnpm test:integration
  ↓
pnpm test:contract
  ↓
pnpm test:e2e:smoke
```

底层测试必须先失败先反馈。`smoke` 标签只允许用于少量关键跨上下文主路径，不能把边界分支、视觉细节或历史重复测试重新带回本地快速门禁。

`pnpm test:full` 按相同顺序运行 unit、integration、contract 和完整 `pnpm test:e2e`，并由本地统一门禁 `pnpm pre-commit` 调用。完整 Electron E2E 也由 [Electron E2E workflow](../../.github/workflows/e2e.yml) 在每个 Pull Request 和 `main` 分支上执行；发布前或排查整套交互时可以单独使用 `pnpm test:full`。CI 可以把完整 E2E 分到独立 runner，但每个 runner 内仍必须串行执行，不能让系统剪贴板、端口或 Electron profile 在同一环境中竞争。

任何新增测试类型、调整测试目录或改变快速/完整门禁时，都必须同步维护 `package.json`、对应 CI workflow 和本文档。

开发协作 AI 在最终说明中必须说明新增或更新了哪些测试、运行了哪些测试，以及是否存在未覆盖风险。

### 全量跨平台门禁

桌面应用的支持矩阵是 macOS、Linux 和 Windows，平台条件分支或在其他系统上生成 PowerShell 文本不算 Windows 验收。[Full cross-platform quality workflow](../../.github/workflows/agent-terminal-platform.yml) 不使用路径过滤，每个 Pull Request 和 `main` 都必须在三个原生平台上执行 `pnpm check:quality`、全部 unit/integration/contract 和 `pnpm build`。Linux 与 macOS 各使用一个完整 runner；Windows 将静态检查与构建、两个低层测试 shard 并行执行，再由稳定的汇总 job 要求三者全部成功：

| Runner       | 原生边界                     | 必须证明                                                                                     |
| ------------ | ---------------------------- | -------------------------------------------------------------------------------------------- |
| macOS 15     | node-pty + POSIX PTY/shell   | 全量静态与低层测试、构建、前台任务、端口所有权和 Electron 主路径                             |
| Ubuntu 24.04 | node-pty + POSIX PTY/shell   | 与 macOS 相同，并使用 Linux `/proc` 证明监听 PID 和进程祖先关系                              |
| Windows 2025 | node-pty + ConPTY/PowerShell | 全量静态与低层测试、构建、npm `.cmd` CLI、`Ctrl+C`、退出码、端口所有权和外层 PowerShell 可写 |

[Electron E2E workflow](../../.github/workflows/e2e.yml) 在每个平台分别构建原生产物，再运行三个独立 shard，共九个完整 E2E 任务。Windows build job 额外准备一份与当前平台、架构、Electron 和 `node-pty` 版本精确匹配的 native artifact，三个 Windows shard 恢复后必须重新执行 Electron native probe，不得各自重复编译。Windows packaged terminal 与 Provider smoke 使用同一份已验证产物在独立 job 中打包，并与源码 E2E shards 并行；它们仍是必需验收，不能被完整 shard 替代。Linux 通过 Xvfb 提供真实显示服务器；Windows 使用 PowerShell/ConPTY 和 `.cmd` fixture；每个 shard 内关闭文件并行和自动重试。某个平台 runner 未执行或失败时，最终报告必须写为“该平台未验收”，不得以模拟测试或另外两个平台通过宣告跨平台完成。

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

普通终端跨 worktree 保留场景由 `git-branch-workspaces.e2e.spec.ts` 使用超过 8192 字符的本地 fixture 覆盖：断言返回后仍是原 `sessionId` 和原 xterm DOM surface、隐藏期间输出可见，并通过 `Shift+PageUp` 读取早于文本尾部的滚动历史。该场景必须留在真实 Electron E2E，因为 jsdom 不能证明 xterm buffer、DOM reparent、node-pty 与 IPC 输出的组合行为；精确身份路由和生命周期清理分支仍由 unit 测试覆盖。

普通终端日常交互主路径由 `terminal-daily-interactions.e2e.spec.ts` 在同一真实 session 中覆盖 Unicode 输出、搜索结果、WebGL context loss 后的 DOM fallback，以及降级后的剪贴板输入到 PTY。该场景必须使用真实 Electron，因为 unit 测试无法证明 GPU context、真实 xterm buffer、ClipboardEvent、IPC 和 node-pty 的连续组合；搜索分支、链接授权、粘贴分片和 renderer controller 清理仍放在 unit、integration 与 contract 层。

普通终端跨应用恢复主路径由 `terminal-runtime-recovery.e2e.spec.ts` 代表性覆盖正常退出重开、renderer/main/Provider 故障和多终端自然退出。它必须保留在真实 Electron E2E，因为低层测试不能证明 detached Provider、Electron 生命周期、preload/renderer 对账、真实 PTY 连续输入、精确会话身份和可写 live/只读 history 交互的组合；永久关闭、项目清理、工作流保留限制、启动锁回收、checkpoint 边界、协议、损坏数据、监听所有权和容量分支继续下沉到 unit/integration。

单次本地 Electron E2E 调用只允许在全局 setup 中构建一次产物，测试文件不得各自重复构建。CI 必须在 macOS、Linux 和 Windows 分别生成该系统的不可变 `out` 和 Electron runtime artifact；同一系统的三个 shard 共享对应 artifact，不能跨系统复用 Electron 或 `node-pty` 产物。Windows `node-pty` cache key 必须覆盖架构、lockfile、补丁、Electron builder 配置和 native 准备/验证脚本，不得使用宽泛 restore key；build job 导出的 run-scoped native artifact 必须携带平台、架构、Electron 和 `node-pty` 版本 manifest，消费者恢复后删除 fallback 并通过真实 Electron probe 才能启动测试或打包。分片仅可在显式预构建模式下跳过构建，并在启动测试前 fail closed 校验 main、preload 和 renderer 入口均存在。场景之间仍必须使用独立 Electron 进程、项目目录和应用状态目录，并在清理时等待 Electron 进程退出。跨应用终端场景还必须通过认证 health/instance 证据定位并停止该场景的 Provider；不得只凭 metadata PID 清理，也不得把 Provider 留给后续场景。

`pnpm test:e2e:smoke` 只运行带 `smoke` 标签的关键路径；`pnpm test:e2e` 运行完整套件。两者默认使用屏幕外非激活的真实 Electron `BrowserWindow`，并校验窗口已经显示、未获得焦点且不与任何显示器边界相交。窗口必须在 renderer 就绪后通过 `showInactive()` 显示，E2E 模式必须关闭 renderer 后台节流；macOS 保持正常应用激活策略和 Dock 图标行为。该模式必须保留真实 renderer、GPU、IPC、PTY、页面几何、截图和 trace，不得替换为纯 Chromium headless 或通过禁用 GPU 改变被测运行时。Linux CI 使用 Xvfb 提供显示服务器。跨平台终端场景必须使用 `tests/support/e2eTerminal.ts` 的平台 shell、PATH 和 Node 命令生成器，不得在通用 spec 中直接写 `/bin/sh`、`printf`、`pwd` 或 Unix shebang 假设。

`pnpm test:e2e:visible` 使用相同构建产物、启动支撑和测试套件，仅显式显示 Electron 窗口用于诊断。只有必须验证系统焦点、原生对话框、原生菜单或操作系统级输入的个别场景，才应通过该入口定向运行；这类场景不得迫使默认套件切回前台。系统剪贴板不要求窗口可见，但测试必须在 `finally` 中恢复原值，且不得与其他剪贴板写入场景并行执行。

E2E 失败时必须保留足以定位异步缺口的诊断产物，至少包括页面截图、Playwright trace、Electron/renderer 日志、当前终端 `sessionId` 和输出尾部；涉及持久 Provider 时追加其有界诊断日志尾部。失败产物写入被 Git 忽略的 `test-results/`，不得污染业务目录或持久化 fixture。重试只能用于暴露并统计 flaky，不能替代确定性同步和根因修复；本地统一门禁不得靠静默重试掩盖首次失败。

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

开发协作 AI 修复具体回归时，必须说明该样本是否属于更一般的不变量；属于时必须使用统一结果状态 oracle 补充参数化矩阵，不得只锁定原始案例。

开发协作 AI 不得用快照测试替代业务断言。
