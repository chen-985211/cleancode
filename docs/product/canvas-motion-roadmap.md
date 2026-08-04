# 画布动效演进路线图

## 文档地位

本文记录 cleancode 画布相机与空间对象动效的已确认方向、阶段顺序和阶段验收边界。

本文是实施路线，不是当前能力清单。尚未完成的条目不得被表现层、测试或其他文档当作已经存在的产品行为。阶段完成后，已经稳定交付的用户行为迁入 [UI 契约](ui-contract.md)，共享动效规则和节奏迁入 [UI Style Guide](ui-style-guide.md)。

本文不重新定义当前事实：

- 画布对象、viewport、布局和持久化事实以[积木图模型](../contexts/block-graph/block-graph.md)为准。
- 用户当前能够依赖的画布定位、选择和输入激活结果以 [UI 契约](ui-contract.md)为准。
- 直接操控、空间连续、可打断、速度连续、物理克制、性能和减弱动态效果以 [UI Style Guide](ui-style-guide.md)为准。
- 开发阶段、TDD 和质量门禁以[开发协作规范](../engineering/development.md)为准。

路线图不设置精确交付日期。状态只表达阶段是否尚未开始、实施中或已经完成。

## 背景

路线启动时，cleancode 已经具备画布平移、缩放、小地图、方向快捷键、快捷执行定位、新节点显露和布局完成后的适应视图。起点问题不是缺少动画，而是相同空间意图分散在多个调用方：各入口分别调用 React Flow 的 `setCenter`、`setViewport`、`fitView`、`fitBounds` 或 zoom helper，并各自决定时长与插值选项。

分散策略会产生三类风险：

1. 相同定位意图在不同入口形成接近但不一致的节奏。
2. 后续加入平滑路径、打断或速度继承时需要在多个消费者中重复实现。
3. 动画完成后的输入激活可能与旧过渡竞争，难以建立统一取消语义。

本路线参考原生 macOS 空间画布的连续运动方法，但不复制特定产品的外观或私有实现。cleancode 的实现必须适配 Electron、React、React Flow、终端持续输出和现有画布契约。

## 目标体验

路线完成后，用户应当形成以下稳定预期：

1. 拖动、触控板平移和缩放始终直接跟随输入，不被装饰动画拖慢。
2. 小地图、快捷键、快捷执行和系统显露目标时使用一致、克制的空间运动语言。
3. 新输入可以立即接管正在进行的程序化相机运动，不需要等待旧动画结束。
4. 程序化相机运动从当前屏幕值继续，不闪跳、不先停顿再重新启动。
5. 远距离定位可以保留必要上下文，但不会缩成难以阅读的全景或产生夸张回弹。
6. 减弱动态效果下保留选择、显露和输入激活结果，同时移除大范围位移和缩放。
7. 动效不会阻塞终端输入、PTY 输出投影、画布拖动或工作流状态更新。

## 全程不变量

所有阶段都必须保持以下不变量：

1. BlockGraph 继续拥有持久化 viewport、节点位置、尺寸、组合和连接事实；Presentation 动效不是新的业务事实来源。
2. 相机运动只改变表现过程，不改变 UI 契约定义的最终选择、可见范围、缩放上限、安全视口或输入激活结果。
3. 恢复已保存 viewport 使用即时定位，不把恢复伪装成用户发起的空间导航。
4. 用户直接操控期间不播放脱离输入的补间动画。
5. 减弱动态效果由统一 JavaScript 策略处理，不能只依赖 CSS。
6. 动画时长、阻尼、插值函数和逐帧路径是实现参数，不成为持久化事实或领域契约。
7. 程序化相机入口必须保留 React Flow 的异步完成信号，为后续取消身份和焦点协调提供稳定接入点。
8. 不为动效引入跨上下文协作、IPC、仓储或运行时协议。

## 统一语言与职责

- **Viewport**：React Flow 使用的 `x + y + zoom` 表现层相机状态。
- **直接操控**：由鼠标、触控板或键盘连续输入直接驱动的画布运动。
- **程序化相机运动**：由定位、显露、适应视图或 zoom command 发起的 viewport 过渡。
- **Motion intent**：描述过渡原因和节奏层级的表现层输入，不是领域命令。
- **Presentation value**：用户当前屏幕上真实可见的 viewport 值，而不是尚未完成的逻辑目标。
- **接管**：新输入取消或重新定向未完成的程序化相机运动。

根级 Presentation 是统一画布动效策略 owner。BlockGraph、Run、Agent 和 Project 只提供调用方已经合法持有的节点、布局或状态投影，不拥有动画曲线、时长或打断规则。

## 目标结构

```mermaid
flowchart LR
  C["画布入口<br/>小地图 / 快捷键 / 快捷执行 / 创建 / 布局"] --> M["Presentation motion owner<br/>意图、节奏、reduced motion、取消"]
  M --> R["React Flow imperative viewport<br/>逐帧 setViewport"]
  R --> V["当前 viewport"]
  U["鼠标 / 触控板 / 键盘新输入"] --> M
  B["BlockGraph viewport 与节点投影"] --> C
```

统一 owner 只协调表现过程。目标几何仍由现有安全视口、节点尺寸、布局边界和 UI 契约策略计算。

## 阶段总览

| 阶段 | 名称                   | 核心结果                                           | 状态   |
| ---- | ---------------------- | -------------------------------------------------- | ------ |
| 1    | 统一相机运动入口       | 所有程序化 viewport helper 经单一 Presentation API | 已完成 |
| 2    | 连续空间路径与统一节奏 | 聚焦、适应视图和 zoom 使用一致的路径与收敛曲线     | 已完成 |
| 3    | 可打断与速度连续       | 新输入从实时值接管，目标改变时保留连续速度         | 已完成 |
| 4    | 空间对象反馈与缩放分级 | 对象抬升、展开收起和细节层级与相机语言一致         | 已完成 |

阶段按顺序建立稳定边界。第一阶段不主动改变手感参数；第二阶段的曲线调整必须建立在统一入口上；第三阶段不得绕过 React Flow 的直接操控另建并行 viewport；第四阶段不得让对象装饰影响终端正文或节点几何事实。

## 第一阶段：统一相机运动入口

### 阶段目标

建立根级 Presentation 的单一程序化 viewport API，把分散的 `setCenter`、`setViewport`、`fitView`、`fitBounds`、`zoomIn` 和 `zoomOut` 调用收敛到同一模块。调用方只提供目标几何、节点集合与 motion intent，不再拥有裸时长常量或 React Flow 插值细节。

### 计划能力

1. 定义 `instant`、`quick`、`spatial` 和距离自适应 focus 等表现层 motion intent。
2. 统一处理 `prefers-reduced-motion`；`instant` 和减弱动态效果都使用零时长。
3. 为 center、viewport、fit view、fit bounds 和 zoom command 提供一个命令式入口。
4. 保留当前阶段已有节奏和最终 viewport 结果，不在重构中提前引入 spring 或新依赖。
5. 让 React Flow 动画 Promise 原样返回，为需要完成协调的消费者保留接入点；现有输入激活重试与取消语义不在本阶段改写。
6. 直接操控和小地图 viewport 拖动预览保留即时更新，但也通过统一入口声明其 `instant` 例外。

### 已知消费者

- 方向快捷键空间导航。
- 小地图节点定位、组合定位与 viewport 拖动。
- 快捷执行栏对象定位。
- 画布放大、缩小和适应视图控件。
- 新终端和 Agent 控制台显露。
- 模板实例、新工作流布局和审批目标适应视图。
- 工作区 viewport 恢复。

### 第一阶段非目标

- 不改变节点创建、自动布局、选择或输入激活的最终契约。
- 不加入自定义 spring、惯性投影、rubber band 或对象回弹。
- 不改变用户直接平移、触控板惯性或滚轮缩放。
- 不增加 motion 依赖。
- 不修改 BlockGraph schema、IPC 或 viewport 持久化格式。

### 第一阶段验收

1. `src/presentation/app-shell/**` 不再直接调用 React Flow 程序化 viewport helper；统一 owner 自身除外。
2. 所有已知消费者通过 motion intent 获得当前阶段对应节奏。
3. reduced motion 对所有非即时程序化相机入口统一返回零时长。
4. 恢复和直接预览继续即时生效，且最终 viewport 与改造前一致。
5. 方向导航、小地图、快捷执行、新节点显露和布局聚焦的已有选择与输入激活测试继续通过。

### 第一阶段验证

- Unit：motion intent 到 React Flow 命令选项的映射、距离上下界、reduced motion 和每类 viewport command 的转发。
- Unit：现有方向导航、小地图、快捷执行、创建显露和布局聚焦消费者回归。
- 静态检查：搜索 Presentation 中绕过统一 owner 的 React Flow viewport helper 调用。
- 统一门禁：`pnpm pre-commit`。

### 第一阶段退出条件

- 所有生产调用方完成收敛，没有并行时长与插值 owner。
- 目标 unit 和统一门禁通过。
- 阶段完成证据写回本文；稳定共享规则如有新增，同步迁入 UI Style Guide。

### 第一阶段完成证据

第一阶段于 2026-08-04 完成：

- `workbenchViewportMotion.ts` 成为根级 Presentation 程序化 viewport motion owner，集中维护 `instant`、`quick`、`spatial` 和 `adaptive-focus` intent、当前节奏、距离上限、插值路径与 reduced-motion。
- center、set viewport、fit view、fit bounds、zoom in 和 zoom out 统一通过 `transitionWorkbenchViewport` 转发；Presentation 其余模块不再直接调用 React Flow viewport helper。
- 第一阶段完成时，方向快捷键和小地图定位继续使用按屏幕距离限制在 `180–260ms`、`180–300ms` 的自适应过渡；创建显露、快捷执行、审批与布局适应视图保持当时的最终 viewport 和节奏。
- 工作区 viewport 恢复与小地图 viewport 拖动继续声明为 `instant`，不会把持久化恢复或直接操控伪装成程序动画。
- JavaScript 驱动的画布控制、空间显露和自适应定位统一尊重 `prefers-reduced-motion`；选择、最终定位和输入激活结果不被删除。
- Unit 参数矩阵覆盖 intent、命令类型、距离上下界、reduced-motion 和全部 React Flow viewport command 转发；既有方向导航、小地图、创建聚焦、快捷执行、审批和布局聚焦回归继续通过。

## 第二阶段：连续空间路径与统一节奏

### 阶段目标

在统一入口上调整程序化相机的路径和收敛曲线，使远近目标都保持空间上下文、快速启动并柔和停止。

### 计划能力

- 对平移并缩放的定位使用经过验证的连续空间插值。
- 统一 quick、spatial 和 adaptive focus 的 motion token，消除无产品理由的近似时长。
- 按屏幕空间距离与缩放变化限制过渡范围，不让极远目标无限延长。
- 对 Spatial 参考交互进行逐帧对比，但以 cleancode 的终端密度和可读性为验收依据。

### 验收边界

- 相同 motion intent 在不同入口具有一致节奏。
- 远距离定位保留局部上下文，不产生突兀跳变或过度缩远。
- reduced motion、最终 viewport、选择与焦点契约保持不变。

### 第二阶段完成证据

第二阶段于 2026-08-04 完成：

- 统一 owner 建立程序化画布 motion token：`quick` 为 `180ms`，`spatial` 为 `220ms`，`adaptive-focus` 根据运动幅度限制在 `220–300ms`；小地图与方向快捷键不再维护无产品理由的不同时间范围。
- 所有非即时程序化相机运动使用同一条快速启动、柔和停止的 cubic ease；常规路径显式使用 React Flow 基于 `d3-interpolateZoom` 的 `smooth` 空间插值。
- `adaptive-focus` 同时使用目标 viewport 的屏幕位移和 `log2` zoom 级差计算节奏；时长在极端距离下保持有界，不随画布坐标无限增长。
- 当目标超过 `1.5` 个当前画布对角线时，路径回退为 `linear`，避免 `smooth` 在极远移动中产生不受控的中途缩远；最终 viewport、zoom 安全策略和目标几何不变。
- 创建显露不再由消费者指定独立的 `direct` 路径；路径、曲线和时长差异全部由统一 owner 决定。
- `instant` 与 reduced motion 继续使用零时长且不附带空间插值；选择、焦点和输入激活结果保持原有契约。
- 参数矩阵覆盖 quick、spatial、adaptive-focus、缩放级差、平滑路径阈值、极远上限、未测量画布回退和全部 React Flow command 转发；目标消费者回归继续通过。

## 第三阶段：可打断与速度连续

### 阶段目标

让程序化相机从当前 presentation value 开始，新输入可以立即接管，重新定向时不产生速度断点。

### 计划能力

- 建立单一在途相机运动身份和取消语义。
- 用户 `onMoveStart`、新定位意图和工作区切换取消旧运动。
- 评估 requestAnimationFrame 驱动的低弹性 spring；只有 React Flow 内建过渡无法满足接管时才实现。
- 分别维护 X、Y 和 zoom 的状态与速度，不让二维距离掩盖单轴反转。
- 防止被取消过渡的迟到完成回调激活旧目标输入。

### 验收边界

- 动画中拖动画布时同一帧或下一帧获得控制权。
- 快速连续定位多个对象时只完成最后一个有效意图。
- 终端持续输出期间相机运动不造成明显输入延迟或掉帧。

### 第三阶段完成证据

第三阶段于 2026-08-04 完成：

- React Flow 内建的 D3 transition 只能接受目标、固定时长和插值选项，不能暴露 presentation velocity 或可靠的重新定向身份；统一 owner 因此改用无新增依赖、由 `requestAnimationFrame` 驱动的解析式临界阻尼 spring。
- `quick`、`spatial` 与 `adaptive-focus` 分别使用 `0.30s`、`0.34s` 和 `0.34–0.42s` response，阻尼比固定为 `1`；自适应 response 继续同时读取屏幕位移和 `log2` zoom 级差，但不再把固定 duration 当成运动完成条件。
- X、Y 和 zoom 分别保存 presentation value 与 velocity。新目标从当前呈现帧重新定向并继承各轴速度，不回到旧起点，也不因二维距离抵消而掩盖单轴反转。
- 控制器全局只保留一个在途相机身份和至多一个待执行动画帧。每帧通过 React Flow 的 imperative `setViewport` 写入；`WorkbenchCanvas` 会识别 React Flow 没有源输入事件的程序化 `onMove` / `onMoveEnd`，中间帧不再回流到画布 React 状态或 viewport 持久化。运动从调度器当前时间开始，并使用 RAF 的完整真实间隔推进解析 spring；60Hz、120Hz 和偶发延迟帧因此共享同一物理时间线，同时保留 `1.2s` 的异常运行上限。
- 远距离 `adaptive-focus` 在独立的临界阻尼进度上叠加有界空间飞行包络：先围绕当前视图中心最多拉远 `0.75` 个 zoom stop，再柔和落到目标；短距离移动不触发额外缩放，路径也不会越过画布最小 zoom。重新定向时先把当前屏幕 presentation value 与速度写回各轴，因此切换路径不闪跳或归零。
- 统一 owner 会在每个成功应用的 presentation frame 后发布轻量实时信号；小地图 viewport 框作为独立叶子订阅者逐帧跟随，不让中间帧回流到 `WorkbenchCanvas` 或触发画布节点重渲染。owner 仍只为最新且成功落位的请求发布一次完成事件，画布在非即时运动完成时提交一次最终 viewport；被取消、被替代和写入失败的请求不发布完成结果。`instant` 恢复与小地图直接预览继续由显式调用方同步和决定是否提交，不会被完成订阅重复保存。
- 新定位、即时工作区 viewport 恢复和用户 `onMoveStart` 会取消旧运动；取消停留在当前呈现值，不补写旧终点。工作区切换还同步撤销布局聚焦和待处理输入聚焦。
- 每次过渡返回带身份校验的完成结果。已取消、被替代或晚于新请求完成的 Promise 返回 `false`；终端、Agent 和方向导航只有在最后一个有效运动完成后才能重新激活目标输入。
- `prefers-reduced-motion` 与 `instant` 继续直接设置最终 viewport，但同样经过完成身份校验，不会让迟到的即时请求覆盖更新目标。
- Unit 覆盖临界阻尼无过冲、反向重定向速度连续、60Hz/120Hz 同时刻等价、延迟帧与常规帧时间等价、远距离有界拉远、近距离不呼吸、单 RAF 上限、当前帧取消、工作区恢复接管、异步迟到完成、用户拖动取消和输入激活失效；另以副作用次数为 oracle，验证程序化中间帧不更新 React 投影或持久化、成功应用的 presentation frame 会同步小地图框、最新完成只提交一次、直接操控保持实时投影、`instant` 继续由显式调用方负责。Presentation 消费侧除小地图实时 viewport 框外只回归最终 viewport 与节点集合，不固化一般中间像素帧。

## 第四阶段：空间对象反馈与缩放分级

### 阶段目标

把同一克制的物理语言扩展到节点按下、拖动、组合展开收起和缩放细节层级。

### 计划能力

- pointer down 立即反馈，拖动时只使用轻微抬升和阴影变化。
- 松手快速收敛，无持续弹跳。
- 组合成员从原空间关系展开并沿对称路径返回。
- 按 zoom 隐藏次要控件和信息，保持终端与 Agent 主体可辨识。
- reduced motion 下用静态层级、边框或短淡化保留反馈。

### 验收边界

- 视觉反馈不改变节点布局、尺寸、组合边界或持久化事实。
- 终端正文颜色、文本选择、输入和 resize 不被覆盖层干扰。
- 低缩放层级减少噪声，但不隐藏导航所需的对象身份与关键状态。

### 第四阶段完成证据

第四阶段于 2026-08-04 完成：

- `workbenchObjectMotion.ts` 成为根级 Presentation 的空间对象 motion owner，统一投影新对象创建、组合展开收起、画布细节层级和创建后聚焦节奏；Terminal、Agent 和组合节点只消费同一种短生命周期 motion 描述，不各自维护曲线。
- 新 Terminal、Agent 和组合以最终几何直接进入 React Flow，只在对象外壳使用 `clip-path`、opacity 和短暂边框光晕从中心向外显露；不缩放节点宽高、xterm 网格或终端正文。Terminal 和 Agent 创建后的相机聚焦会等待对象至少呈现一帧，并可在工作区切换或更新创建意图时取消。
- 组合展开时，成员的视觉表面从折叠组合中心沿有界 translate 路径回到既有布局；React Flow handle 和 resize 命中区固定在最终锚点，相关流程线在成员落位后再显露，避免临时 transform 污染端点测量。折叠时立即采用新的 BlockGraph 事实，同时把离场成员保留为不接收指针事件的 Presentation 副本并沿反向路径收束，动画完成后移除。展开和收起不改写成员位置、组合边界或持久化 schema。
- 节点标题 pointer down 立即产生 `1px` 下沉；React Flow 拖动期间只用既有阴影提高视觉层级，节点根元素不设置常驻 transform，避免改变 xterm 与 resize 的坐标几何。松手快速回到静止层级，不追加惯性或弹跳。
- 画布按统一阈值投影 `full`、`compact` 和 `overview` 三种细节层级。较低缩放让描述、次要动作和地址等噪声默认透明，节点悬停、键盘聚焦或选中时立即显露；resize 与连接 handle 沿用原有命中和可见性规则，可访问路径不被移除，对象外框、名称、类型和关键状态继续可辨。应用设置提供默认开启、跨重启恢复的“减少视觉噪声”偏好；关闭时统一 owner 在所有 zoom 投影 `full`，不另建阈值或改变画布对象挂载。阈值是实现细节，不构成产品契约。
- reduced motion 下对象创建与组合变化直接落到最终投影，CSS 同时关闭位移、裁剪和过渡；选择、对象身份、关键状态和最终相机结果保留。
- Unit 覆盖缩放层级矩阵、创建最终几何、初始恢复不重播、组合双向路径、快速属性刷新、动画完成清理、reduced motion 和创建聚焦调度；AppShell 消费侧验证新 Terminal 的创建 motion，以及真实组合状态切换后的展开成员和表现层离场副本。

## 测试策略

最低有效层级是 unit：纯 motion 策略使用参数化测试覆盖 intent、距离、缩放和 reduced-motion；消费者测试证明各入口接入统一策略并保持最终行为。

本路线默认不为曲线数值新增 E2E。只有真实 Electron、触控板事件、React Flow 过渡取消和终端持续输出的组合风险无法由 unit 证明时，才为第三阶段增加最小代表性 E2E 或性能场景。视觉舒适度通过真实应用对比、性能 trace 和逐帧检查验证，不把像素级中间帧固化为长期契约。

## 风险与回退

- React Flow 基于 D3 transition 的 Promise 在被新过渡打断时可能无法按旧调用方预期完成；第一阶段只统一入口，第三阶段再引入显式取消身份。
- 在 macOS 触控板已有惯性事件上叠加自定义惯性会产生双重滑动；路线不为直接操控追加惯性。
- 自定义 spring 已把程序化中间帧与 `WorkbenchCanvas` React 状态、viewport IPC 持久化隔离；React Flow 自身仍会在每帧同步内部 transform store，后续真实终端高输出场景继续用性能 trace 检查该剩余预算，不引入对其私有 pan/zoom API 的依赖。
- 远距离空间飞行如果不设界会把稠密终端画布缩成不可读全景；第三阶段把拉远限制为当前 zoom、目标 zoom 和画布最小 zoom 共同允许的最多 `0.75` 个 zoom stop，后续真实使用反馈如需调参仍只修改统一 owner。
- 任一阶段都可以回退到前一阶段的统一入口与当前节奏，不回滚 BlockGraph 数据或用户布局。

## 维护规则

- 每完成一个阶段，更新阶段状态、完成证据和仍未覆盖的风险。
- 已稳定交付的用户契约迁入 UI 契约；共享动效规则迁入 UI Style Guide；路线图只保留阶段脉络和未完成方向。
- 不在消费者中新增裸时长、插值曲线或独立取消策略。确有产品差异时，必须先在统一 owner 中命名 intent、理由和测试矩阵。
- 如果阶段需要新增依赖、跨层边界或性能敏感的自定义逐帧控制，必须重新完成可行性检查和对应规则路由。
