# 画布视觉整理

## 文档地位

本文维护 CanvasArrangement 上下文当前已经实现的跨类型画布视觉整理规则。终端、流程与组合定义仍以[画布语义契约](../../product/canvas-semantic-contract.md)为准；用户入口与稳定交互结果以 [UI 契约](../../product/ui-contract.md)为准；各对象自身的位置和结构事实继续由 BlockGraph 与 Agent 拥有。

## 上下文职责

CanvasArrangement 只拥有一个物理工作区内的视觉堆叠关系：堆叠身份、当前锚点和有序成员引用。堆叠是否存在是对象是否吸附的唯一事实，不存在“松散但仍吸附”的呈现状态。它不改变终端依赖、组合成员、Agent 身份、运行状态或对象尺寸，也不把视觉堆叠解释为可执行工作流或终端组合。

`CanvasArrangement` 是本上下文聚合根，以稳定 `projectId + workspaceId` 隔离。一个堆叠可以引用以下完整画布对象：

- 独立终端。
- 一条完整依赖流程，以稳定终端 ID 集合引用。
- 一个完整终端组合，以组合 ID 引用。
- 一个 Agent 控制台，以 Agent ID 引用。

同一对象不能同时属于多个堆叠；堆叠至少包含两个不同对象。已有堆叠与新对象再次堆叠时，必须完整包含每个被命中堆叠的全部成员，再以一个新堆叠替换旧关系，不能从已有堆叠中静默拆出部分成员。

## 布局与动作

视觉整理以完整对象为排版单元。组合连同成员、流程连同全部终端一起移动，但不会改变内部相对布局、依赖连接、组合边界语义或 Agent 尺寸。

- **吸附**：按当前从上到下、从左到右的稳定视觉顺序排列，以选择范围中心为锚点；不同尺寸对象共用左上基准，每层在 x/y 方向各偏移 `10` 画布单位，形成不随尺寸横向漂移的单一对角层次，有序成员同时决定遮挡层级。合并已有堆叠时形成一个新的吸附关系。
- **解除吸附**：只作用于一个完整堆叠。对象从当前锚点和同一左上基准沿统一的右下对角轨迹逐层递增错开，最上层先启动，其余层以短间隔依次揭开；纵向先按重力加速下落，接触终点后只做一次克制回弹，横向保持稳定收敛。位置提交成功后删除堆叠关系，散开后的坐标成为各对象的独立位置，不再整体拖动。解除使用短促、连续、可打断的空间动效，不读取或恢复吸附前的历史坐标，也不能退化成向四周放射、横向单排或互不相交的网格。
- **网格**：完整流程先复用 BlockGraph 的依赖层级规则收紧内部间距，保留依赖方向、成员身份和节点尺寸，再以收紧后的完整外框参与跨类型排列；其他对象保持自身尺寸。对象按真实占地从大到小形成稳定阅读层级，占地相同时保留原有从上到下、从左到右的视觉顺序；随后枚举确定性的紧凑行架方案，以外接占地和接近方形程度共同选择结果。每行只使用自身对象的真实宽高与 `48` 画布单位间距，较矮对象对齐所在行的底部基线，不继承其他行的大对象列宽或行高；完整网格仍以操作前的选择范围中心为锚点，并移除选择中涉及的全部完整堆叠关系。全部对象同帧开始重排，不使用逐个延迟或弹跳；即使选择不涉及已有堆叠，动效编排也必须至少保留到提交后节点投影完成，不能在同一次异步提交结尾被清空。x/y 轴分别使用无过冲的临界阻尼，移动距离越长响应越舒展，使远距离对象不会被迫以异常首帧速度硬拉入格位。
- **整体拖动**：拖动堆叠中的任一可见节点时，以同一位移实时预览并提交全部成员及堆叠锚点。

BlockGraph 继续提交终端、流程和组合位置，Agent 继续提交 Agent 布局；CanvasArrangement 只在这些位置提交成功后提交堆叠关系。跨 owner 操作失败时必须补偿已完成的位置或关系写入，并向 Presentation 返回失败；成功不产生通知。

## 选择、恢复与持久化

macOS 使用 `Command`、Windows/Linux 使用 `Ctrl` 在画布空白处拖出临时选择框。顶层对象的视觉外接矩形只要与框选区域相交就进入选择；命中流程或组合的任意部分时仍以完整流程或完整组合为选择单元，不能拆出内部成员。拖拽过程中实时投影命中对象，松开后移除临时选择框并保留对象选择态。命中某个有效堆叠中的任一对象时，选择扩展为该堆叠的全部有效成员；吸附状态只由最上层完整对象承担可见选择轮廓，避免重叠轮廓制造无意义的视觉噪声。解除成功后选择继续保留，全部对象恢复独立选择轮廓。

堆叠按项目目录哈希与稳定工作区 ID 写入独立、版本化的 `canvas-arrangement.json`，使用严格解析、同路径串行事务和原子替换。版本三只保存仍然有效的吸附关系；读取版本一时保留全部关系，读取版本二时保留 `stacked` 记录并把旧 `spread` 记录解释为已经解除。工作区恢复时，Platform 用当前 BlockGraph 与 Agent DTO 投影仍然有效的规范对象键，再由 CanvasArrangement 原子移除失效成员；剩余不足两个成员的堆叠自动解散。持久化损坏、版本不支持或作用域不匹配必须显式失败，不能静默覆盖原文件。

## 实现与验证

| 层级           | 当前入口                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | [`CanvasArrangement.ts`](../../../src/contexts/canvas-arrangement/domain/aggregates/CanvasArrangement.ts)、[`CanvasArrangementLayoutPolicy.ts`](../../../src/contexts/canvas-arrangement/domain/services/CanvasArrangementLayoutPolicy.ts)                                                                       |
| Application    | [`application/use-cases`](../../../src/contexts/canvas-arrangement/application/use-cases)                                                                                                                                                                                                                        |
| Infrastructure | [`FileSystemCanvasArrangementRepository.ts`](../../../src/contexts/canvas-arrangement/infrastructure/persistence/FileSystemCanvasArrangementRepository.ts)                                                                                                                                                       |
| Platform       | [`canvasArrangementIpcHandlers.ts`](../../../src/platform/electron-main/canvasArrangementIpcHandlers.ts)、[`canvasArrangementReconciliationAdapter.ts`](../../../src/platform/electron-main/canvasArrangementReconciliationAdapter.ts)                                                                           |
| Presentation   | [`canvasArrangementSelection.ts`](../../../src/presentation/app-shell/canvasArrangementSelection.ts)、[`useCanvasArrangementActions.ts`](../../../src/presentation/app-shell/useCanvasArrangementActions.ts)、[`CanvasArrangementToolbar.tsx`](../../../src/presentation/app-shell/CanvasArrangementToolbar.tsx) |
| Tests          | [`tests/unit/contexts/canvas-arrangement`](../../../tests/unit/contexts/canvas-arrangement)、[`tests/integration/contexts/canvas-arrangement`](../../../tests/integration/contexts/canvas-arrangement)、[`tests/contract/contexts/canvas-arrangement`](../../../tests/contract/contexts/canvas-arrangement)      |

## 维护规则

- 新增视觉整理对象类型前，必须先确认其稳定身份、位置 owner、完整对象边界和失败补偿规则。
- CanvasArrangement 不得吸收 BlockGraph、Agent、Run 或 Project 的结构与生命周期事实。
- 堆叠不得被复用为终端组合、执行作用域、收藏模板或权限边界。
- 修改堆叠不变量、布局结果、恢复清理、吸附关系或持久化格式时，必须同步本文与对应领域、持久化和交互测试。
