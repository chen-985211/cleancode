# E2E 稳定性改造手册

## 文档地位

本文提供跨场景可复用的 E2E 设计、排障和改造方法，不重新定义测试层级、目录、门禁或强制规则。测试规则以[测试规范](testing.md)为唯一事实来源，Electron、Vitest 和 Playwright 的当前采用方式以[技术栈说明](../engineering/tech-stack.md)为准，xterm、PTY 网格和终端几何问题继续使用[终端渲染排障指南](../terminal/rendering.md)。

本文回答“如何把一个偶发通过的 E2E 改成确定性测试”。具体业务断言仍由所属限界上下文的领域规则、用例、端口和产品契约决定。

## 通用公式

```txt
稳定 E2E
  = 确定性触发
  × 可观测完成
  × 稳定身份
  × 权威断言
  × 场景隔离
  × 必然清理
  × 失败证据
```

这里的乘号表示任何一项缺失都可能让整条场景不稳定，不表示可以计算的数值分数。

- **确定性触发**：测试明确知道自己发起了哪个动作，不依赖上一个场景、用户环境或后台偶然状态。
- **可观测完成**：等待动作产生的协议事件、状态迁移、公开查询结果或精确输出 marker，不用固定休眠猜测完成时间。
- **稳定身份**：使用 `sessionId`、实体 ID、进程 ID 或其他生命周期身份绑定后续观察，不只依赖可能复用的名称或 DOM 位置。
- **权威断言**：根据用户目标选择最接近事实来源的 oracle；可见结果由真实 UI 证明，执行次数、工作目录等运行事实由公开查询或持久副作用证明。
- **场景隔离**：每个场景拥有独立可变状态；只共享构建产物等不可变、昂贵资源。
- **必然清理**：无论断言、诊断或关闭动作是否失败，进程、PTY、监听器和临时目录最终都进入清理路径。
- **失败证据**：首次失败就留下能区分触发、迁移、渲染、断言和清理阶段的证据。

## 先填写场景卡

编写或修复 E2E 前，先回答以下问题。答不出来时，不应先增加 timeout 或 retry。

| 项目        | 要回答的问题                                                  |
| ----------- | ------------------------------------------------------------- |
| 用户目标    | 这条 E2E 只证明哪个不可由低层测试替代的用户结果？             |
| 触发动作    | 哪个点击、输入、协议请求或进程启动开始了场景？                |
| 状态迁移    | 系统从什么状态迁移到什么状态？                                |
| 完成条件    | 哪个可观测事实能证明迁移已经完成？                            |
| 稳定身份    | 迁移前后对象身份是否会变化？后续观察绑定哪个 ID？             |
| 断言 oracle | UI、公开查询、事件、退出码或持久副作用，哪个最直接证明目标？  |
| 隔离资源    | 哪些目录、进程、端口、时钟或环境变量必须每场景独立？          |
| 清理责任    | 谁关闭进程、等待退出、释放监听和删除临时数据？                |
| 失败证据    | 失败后需要哪些截图、trace、日志、身份和状态快照才能定位阶段？ |

## 把时间等待改成状态等待

不稳定写法通常把“时间过去了”当作“系统完成了”：

```ts
await triggerAction()
await page.waitForTimeout(1_000)
await expectResult()
```

改造后的概念模板是：

```ts
const previousIdentity = await readCurrentIdentity()

await triggerAction()

const currentIdentity = await waitForIdentityChange(previousIdentity)
await waitForReadySignal(currentIdentity)
await expectAuthoritativeResult(currentIdentity)
```

同步信号按场景选择，不机械追求某一种 API：

1. 进程退出、协议事件、应用状态迁移等明确生命周期信号。
2. 应用公开查询返回的权威状态或确定性持久副作用。
3. 用户目标本身是可见行为时，等待真实 UI 状态和几何结果。
4. 只有“经过一段时间”本身就是被测行为，或负向断言需要有界观察窗口时，才使用固定时间，并在测试中说明其业务含义。

`waitForFunction`、locator 自动等待和 `expect.poll` 只是实现手段。稳定性的来源是条件表达了真实完成语义，而不是换了一个等待 API。

## 用稳定身份跟随生命周期

名称通常是展示语义，不一定是运行身份。终端快速启动、窗口重建、Agent 恢复或后台任务替换时，展示名称可以不变，底层 session 或进程已经变化。

正确顺序是：

```txt
记录旧身份
  -> 触发替换
  -> 等待新身份出现且不同于旧身份
  -> 后续输出、查询和清理全部绑定新身份
```

如果一个 selector 只能找到“Terminal 1”，测试还必须确认它当前对应哪个 `sessionId`。只按名称等待输出可能读取旧会话、迁移中的 DOM 或已经退出进程的尾部内容。

## 为每个断言选择正确 oracle

同一场景可以使用多个 oracle，但每个 oracle 只证明自己擅长的事实。

| 要证明的事实           | 优先 oracle                              |
| ---------------------- | ---------------------------------------- |
| 用户能看到目标输出     | 当前身份对应的真实 UI                    |
| 命令是否只执行一次     | 可控 fixture 写入的报告文件或调用记录    |
| PTY 当前工作目录       | Run 上下文公开查询                       |
| 命令是否成功           | 真实进程退出码或运行状态                 |
| 浏览器几何、字体、选区 | 真实 Electron 页面几何和精确选择结果     |
| 业务规则分支           | 优先下沉到 unit、integration 或 contract |

不要让一个脆弱的 UI 文本同时承担运行身份、执行次数和业务状态三种证明责任。DOM 文本完整也不一定证明像素没有裁剪；终端画面只出现一次也不一定证明进程只执行一次。

## 用确定性 fixture 控制外部环境

当测试目标不是 Shell、网络或真实第三方本身时，使用最小本地程序控制输入、输出、退出码和副作用。

一个合格 fixture 应满足：

- 输入、输出顺序和结束条件固定。
- 不读取用户全局配置、真实凭据或不可控网络。
- 能报告真实执行次数、收到的参数或协议事件。
- 只实现当前场景需要的外部行为，不复制生产业务规则。
- 文件位于 `tests/fixtures/<owner>/`，名称表达它模拟的角色。
- 通用 fixture 必须同时提供 POSIX executable 与 Windows `.cmd` 入口，或通过平台 shell 中立的 Node 命令生成器启动；只有被测目标本身是特定 shell 时才允许 shell 方言。

终端选区测试可以让 fixture 直接输出固定行；快速启动测试可以同时输出可见 marker 并向报告文件追加一次记录。前者证明渲染，后者证明执行次数，两种证据互不冒充。

## 共享不可变成本，隔离可变状态

单次本地 E2E 调用可以在 global setup 中共享一次构建产物，因为构建产物在场景间不可变且创建昂贵。CI 在每个操作系统分别构建；同一系统的分片可以共享对应 build job 上传的不可变 `out` artifact，但 Electron/node-pty 产物不能跨系统复用。只有显式预构建模式且 main、preload、renderer 三个入口校验通过时才能跳过构建。以下资源默认不能跨场景共享：

- Electron 应用进程和 PTY。
- 项目目录、应用状态目录、Electron `userData` profile 和持久化 fixture。
- 会话 ID、端口、事件订阅和运行中任务。
- 会被测试写入的报告文件。

判断原则是：共享失败是否会让一个场景改变另一个场景的前置状态。答案为“会”时必须隔离。

E2E 启动器必须把每个场景的 Electron `userData` 指向该场景独立的临时目录，不能复用开发实例的默认 profile。否则 Electron 单实例锁会把测试进程路由到已运行的应用，导致新进程在页面创建前正常退出；测试会统一表现为 `Target page, context or browser has been closed`，也无法证明任何产品行为。

启动器还必须从继承环境中移除 `ELECTRON_RUN_AS_NODE`，不能让承载测试命令的 CleanCode 或其他 Electron 宿主把自己的 Node 模式标记传给被测 Electron。测试场景需要的其他环境变量继续由场景级覆盖显式提供。

## 后台与可见运行模式

默认 `pnpm test:e2e:smoke` 和完整 `pnpm test:e2e` 都启动屏幕外非激活的真实 Electron 窗口。启动支撑向应用传入精确的测试标记，应用以远离所有显示器的坐标创建 `BrowserWindow`，允许测试窗口超出屏幕边界，并在 renderer 就绪后再次校正坐标、调用 `showInactive()`。E2E 启动后必须从主进程读取窗口可见性、焦点和边界，验证窗口已经显示、没有获得焦点且不与任何显示器相交；不得只根据创建参数推断窗口管理器接受了屏幕外坐标。

屏幕外模式不是浏览器 headless：窗口对操作系统保持可见，renderer 仍实际加载和绘制，GPU、IPC、PTY、DOM 几何、截图与 Playwright trace 均保持正常。E2E 必须关闭 renderer 后台节流；Linux 仍需要可用的显示服务器。Playwright 的 `page.mouse` 和 `page.keyboard` 向页面派发输入，不移动操作系统鼠标指针，也不要求窗口位于前台。macOS 保持正常应用激活策略和 Dock 图标行为，不通过切换 accessory activation policy 隐藏测试应用。

需要肉眼诊断时，使用 `pnpm test:e2e:visible` 运行同一套测试。只有系统焦点、原生对话框、原生菜单或操作系统级输入本身就是断言对象时，才用该入口定向运行个别用例，例如：

```sh
pnpm test:e2e:visible tests/e2e/example.e2e.spec.ts -t "target behavior"
```

系统剪贴板 API 可以在屏幕外窗口下使用，不属于必须前台运行的交互；但它修改的是用户机器的全局状态。剪贴板场景必须先保存原值，并在 `finally` 中恢复。同一 runner 内的 E2E 必须保持串行；CI 只有在 runner、profile、临时目录和进程完全隔离时才能按文件分片。

## 让清理必然发生

推荐的 teardown 结构是：

```ts
afterEach(async ({ task }) => {
  try {
    if (task.result?.state === 'fail') {
      await captureFailureDiagnostics()
    }
  } finally {
    try {
      await closeApplicationAndWaitForExit()
    } finally {
      await cleanupTemporaryState()
    }
  }
})
```

关闭动作不能只发送 `close` 后立即返回，还要等待真实子进程退出。存在跨应用存活 Provider 时，Electron 退出不再代表全部终端资源退出；测试支撑必须读取该场景隔离状态目录中的 metadata，通过 token、协议和 instance 完成 health 认证后再请求/发送 Provider shutdown，PID 只能用于认证成功后的等待与强制兜底。超时后的强制结束是清理兜底，不是正常同步机制。诊断采集放在关闭前，资源释放放在 `finally` 中；即使截图或 trace 失败，也不能跳过进程和临时目录清理。

## 首次失败必须可诊断

E2E 失败诊断至少要回答：

- 动作是否真正触发？
- 当前对象身份是什么，是否发生了预期迁移？
- Electron 和 renderer 是否报告错误？
- 当前 UI、终端输出尾部和活动元素是什么？
- 进程是否仍存活，退出码和信号是什么？
- 测试使用了哪些临时目录和应用状态？

推荐保留页面截图、Playwright trace、Electron stdout/stderr、renderer console/page error、当前稳定身份和关键状态快照；涉及独立 Provider 时同时保留不含 token/终端内容的有界 Provider 日志尾部。诊断产物属于本地失败证据，必须写入 Git 忽略目录。

## 重复运行不是重试

修复 flaky 后，应在关闭 retry 的前提下重复运行目标场景，再重复运行完整套件。

- **压力复跑**：每次首次失败都会立即暴露，用于估计改造后的稳定性。
- **自动重试**：第一次失败后隐藏失败并再次执行，不能证明竞态已经消失。

压力复跑通过后仍要执行统一门禁。若完整套件失败而单测稳定，应优先检查重复构建、资源残留、共享状态和运行顺序，不应直接扩大 timeout。

日常本地反馈使用 `pnpm test`，其 Electron 部分只执行标记为 `smoke` 的关键跨上下文路径；完整回归使用 `pnpm test:full`。每个 Pull Request 和 `main` 分支必须由 CI 在 macOS、Linux 和 Windows 的独立 runners 上分片运行完整 `pnpm test:e2e`，每个 shard 内仍关闭文件并行和自动重试。不能用增加 smoke 数量替代低层测试，也不能因为完整套件进入 CI 就降低首次失败的诊断要求。

## 何时提取测试支撑代码

优先使用 Playwright 和 Vitest 已有能力。只有同时满足以下条件时，才把逻辑提取到 `tests/support/`：

- 至少两个场景需要相同的稳定语义。
- helper 名称能够表达具体职责，例如“等待终端会话迁移”，而不是笼统的 `waitUntilReady`。
- helper 接收稳定身份或明确输入，不依赖隐藏的全局状态。
- helper 不吞掉错误、静默重试或把固定 sleep 包装成“稳定等待”。
- helper 只负责测试运行支撑，不复制业务规则或绕过公开边界修改生产状态。

只有一个场景使用、语义尚未稳定时，逻辑应留在场景附近。不要为了得到一份“通用公式”创建没有边界的 `utils` 或万能 polling helper。

## 改造前后对照

| 不稳定做法                | 稳定做法                                   |
| ------------------------- | ------------------------------------------ |
| 点击后固定等待一秒        | 等待明确状态迁移或精确 marker              |
| 按展示名称持续读取对象    | 等待稳定身份迁移，后续观察绑定新 ID        |
| 输入 `pwd` 后解析终端 DOM | 查询 Run 上下文公开的工作目录              |
| 统计终端画面判断执行次数  | 用确定性 fixture 的持久副作用计数          |
| 每个测试文件重复构建      | global setup 共享一次不可变构建产物        |
| 调用 `close` 后立即删目录 | 等待进程退出，强制结束兜底，`finally` 清理 |
| 失败只看到 timeout        | 截图、trace、日志、身份和状态快照          |
| 用 retry 获得绿色结果     | 关闭 retry 压力复跑，修复首次失败根因      |

## 本项目参考实现

- [`e2eTerminal.ts`](../../tests/support/e2eTerminal.ts)：按 `sessionId` 等待终端输出、Shell marker、会话迁移和公开工作目录查询。
- [`e2eWorkbench.ts`](../../tests/support/e2eWorkbench.ts)：场景隔离、Electron 生命周期、失败诊断和清理兜底。
- [`e2eGlobalSetup.ts`](../../tests/support/e2eGlobalSetup.ts)：本地单次构建，以及 CI 预构建入口的 fail-closed 校验。
- [`fakeTerminalPrograms.ts`](../../tests/fixtures/contexts/run/fakeTerminalPrograms.ts)：可控终端程序和持久副作用 oracle。
- [`vitest.e2e.config.ts`](../../vitest.e2e.config.ts)：Electron E2E 的独立编排入口。
- [`vitest.e2e.visible.config.ts`](../../vitest.e2e.visible.config.ts)：复用相同套件的显式可见诊断入口。
- [`e2e.yml`](../../.github/workflows/e2e.yml)：完整套件的单次构建、隔离分片和失败产物上传。

## 提交前检查清单

- [ ] 已写清这条 E2E 唯一证明的用户目标，以及低层测试不能覆盖的原因。
- [ ] 每次异步动作都有真实完成条件，没有用固定时间代替就绪。
- [ ] 对象会被替换时，测试等待并绑定新的稳定身份。
- [ ] 每个断言使用最接近目标事实的 oracle。
- [ ] 非被测外部环境已替换成最小确定性 fixture。
- [ ] 只共享不可变构建成本，可变进程、目录和状态按场景隔离。
- [ ] 诊断在清理前采集，进程和临时状态在嵌套 `finally` 中释放。
- [ ] retry 关闭，目标场景和完整套件均完成压力复跑。
- [ ] 失败产物位于 Git 忽略目录，没有污染业务目录或 fixture。
- [ ] 已按[测试规范](testing.md)和[开发协作规范](../engineering/development.md)运行目标验证与统一门禁。
