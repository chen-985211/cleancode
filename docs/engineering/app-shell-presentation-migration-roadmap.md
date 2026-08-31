# App Shell Presentation 归属迁移路线图

## 文档地位

本文规划根级 `src/presentation/app-shell` 向各限界上下文 Presentation 的行为不变迁移。

本文不是当前产品功能或 UI 契约，不定义新的业务事实、交互结果、视觉规则或跨上下文协议。目录职责、依赖方向和上下文边界仍以[架构文档](architecture.md)为唯一事实来源；组件、状态、动效和可访问性仍以 [UI Style Guide](../product/ui-style-guide.md) 为准；测试组织和门禁仍以[测试规范](../testing/testing.md)为准。

## 背景

根级 `src/presentation/app-shell` 当前同时承担应用外壳、跨上下文协调、共享 UI 基础能力和大量上下文专属界面。各上下文的 `presentation` 目录除 Project 外基本为空，导致后端边界已经按限界上下文表达，而 Renderer 代码的 owner 仍主要依靠文件名和开发者记忆判断。

2026-08-31 基线：

- `src/presentation/app-shell` 有 340 个实际文件。
- 其中 296 个是 TypeScript/TSX，44 个是 CSS 或资源文件。
- 90 个代码文件直接只引用一个限界上下文：Agent 28、BlockGraph 41、CanvasArrangement 3、Run 18。
- 27 个代码文件直接引用两个或更多上下文。
- 179 个代码文件没有直接引用上下文路径；其中既有真正共享的表现层能力，也有通过 App Shell 本地类型间接耦合上下文的模块，不能据此自动判定归属。

这些数量只用于确定迁移规模，不是自动搬迁规则。文件名、直接 import 和当前目录都不能替代事实 owner 分析。

## 目标

1. 上下文专属组件、ViewModel、临时状态和表现策略归入对应 `src/contexts/<context>/presentation`。
2. 根级 App Shell 只保留应用启动后的 UI 组合、跨上下文投影、工作台布局、全局导航和协调器。
3. 至少被两个上下文 Presentation 使用、且不理解业务内部状态的稳定 UI 能力归入根级共享 Presentation。
4. 迁移期间保持现有 UI、焦点、动效、可访问性、IPC 和持久化结果不变。
5. 测试随事实 owner 迁移：上下文专属 Unit 测试进入 `tests/unit/contexts/<context>`，真正跨上下文的 App Shell 测试继续留在 `tests/unit/presentation`。

## 非目标

- 不借目录迁移重做界面、文案、动效或状态语义。
- 不改变 Domain、Application、Infrastructure、IPC 或持久化契约。
- 不把所有带 `Terminal`、`Agent` 或 `Canvas` 前缀的文件机械搬入同名上下文。
- 不创建 `utils`、`helpers` 或 `common` 目录承载无法说明 owner 的代码。
- 不在迁移中顺手修复与目标文件无关的 E2E 波动或产品缺陷。

## 必须保持的不变量

1. 同一用户输入在迁移前后产生相同的可观察 UI 状态、焦点结果、持久化调用和错误反馈。
2. 上下文 Presentation 可以依赖自己的 Application/Domain 契约和根级共享 Presentation，但不得依赖 App Shell 内部状态或其他上下文内部模型。
3. App Shell 可以组合多个上下文的公开 DTO、ViewModel 和组件，但不得重新拥有它们的业务事实。
4. 文件移动不得形成 `context presentation -> app-shell -> context presentation` 循环。

## 目标目录

```txt
src/
  contexts/
    project/presentation/
      components/
      view-models/
      motion/
      styles/
      assets/
    block-graph/presentation/
      components/
      view-models/
      styles/
    canvas-arrangement/presentation/
      components/
      view-models/
      styles/
    run/presentation/
      components/
      view-models/
      terminal-surface/
      styles/
    agent/presentation/
      components/
      view-models/
      styles/
  presentation/
    app-shell/
      coordinators/
      projections/
    shared/
      components/
      hooks/
      motion/
      styles/
    i18n/
    layouts/
    routes/
```

`presentation/shared` 只容纳被多个上下文 Presentation 或 App Shell 共同消费的稳定表现层能力。它不是 Shared Kernel，也不得包含业务规则、上下文 DTO 聚合或跨上下文状态 owner。

## 归属判断顺序

每个文件按以下顺序判断：

1. 它表达哪个上下文的统一语言和状态？如果只有一个，进入该上下文 Presentation。
2. 它是否同时把两个以上上下文的公开投影组合成一个工作台结果？如果是，留在 App Shell。
3. 它是否完全不理解上下文业务，只实现通用组件、输入、动效或可访问性能力？如果是，进入根级共享 Presentation。
4. 它是否混合了多个答案？如果是，先拆成 owner 明确的子组件、ViewModel 或纯投影，再移动；不得整文件强行归类。

直接 import 单个上下文只是候选证据。例如 `TerminalSettingsPane` 同时展示 Run 的滚屏偏好和跨工作台的流程搭建偏好，即使当前只直接 import Run DTO，也不能整文件直接归入 Run。

## 已完成迁移

### Run 终端滚屏偏好

- `src/presentation/app-shell/terminalRuntimePreference.ts`
  → `src/contexts/run/presentation/view-models/terminalRuntimePreference.ts`
- `tests/unit/presentation/terminal-runtime-preference.spec.ts`
  → `tests/unit/contexts/run/run.terminal-runtime-preference.spec.ts`
- App Shell 继续消费 Run Presentation 暴露的偏好读写能力。
- 完成提交：`b9e321aa refactor(run): move terminal preference into context`。

### 根级共享 Presentation 基础

- `i18n/**` 已从 App Shell 提升到 `src/presentation/i18n`。
- Tooltip、Surface、outside-pointer、reduced-motion、selection motion 和 surface motion 已迁入 `src/presentation/shared`，并按 `components`、`hooks`、`motion`、`styles` 划分。
- 中断感知的 overlay 焦点恢复、工具栏 utility button 动效及其样式已提升到 shared；上下文触发器统一使用语义中立的 `toolbar-utility-button`，不再依赖 App Shell 私有 Hook 或 class。
- 用户可见错误解析和通知契约已迁入根级共享 Presentation；通知 Store、Provider 和 Center 仍由 App Shell 拥有。
- `SurfaceMotion` 不再理解 Project Sidebar 或 Workbench DOM；`AppShellSurfaceMotion` 适配器显式提供 App Shell 的 isolation target。
- 混合的 `selection-motion.css` 已迁移通用 indicator；Project 专属选择器已在 Project 批次下沉，Settings、Terminal 和 Shortcut 专属选择器继续留给后续 owner 批次。
- dependency-cruiser 已禁止 `src/contexts/*/presentation` 反向依赖 `src/presentation/app-shell`。

### Project Presentation

- Project Sidebar、分支选择、分支工作区表单、归档确认、项目移除和工作区行菜单已迁入 `src/contexts/project/presentation/components`。
- Project 排序动效和分支表单动效已迁入 `motion`，组件状态 Hook 与窄化工作台视图模型已迁入 `view-models`。
- `ProjectSidebar` 通过泛型视图模型只依赖 Project Snapshot 与 Git 分支导航 DTO；App Shell 可以继续传递完整工作台对象，但 Project Presentation 不再知道 Agent、Run、BlockGraph 或 CanvasArrangement 字段。
- Project 组件和交互样式已迁入 Project；`project-sidebar-layout.css`、标题栏、侧边栏开合及画布/状态栏联动仍由 App Shell 拥有。
- 需要 DOM 的上下文表现层 Unit 使用 `tests/unit/contexts/**/*.presentation.spec.ts(x)` 命名并由 jsdom project 执行；Project 自有测试已按该约定迁移。
- `ProjectSidebarToggle`、`projectSidebarMotion`、`useProjectSidebarMotion`、`useProjectSidebarVisibility` 以及 Project/Run/BlockGraph 跨上下文动作协调器保留在 App Shell。

### Agent Provider 与 Activity Presentation

- Provider catalog、可创建 Provider、应用级 Provider 偏好、创建选择、运行时对账和反馈投影已迁入 `src/contexts/agent/presentation/view-models`。
- `AgentProviderIcon`、Provider 状态面板、MCP capability 开关、Agent 设置页和 Provider Store Provider 已迁入 `src/contexts/agent/presentation/components`。
- Agent activity Store、快照 Hook、Activity Observer 与导航目标契约已迁入 Agent Presentation；通知控制器和 Run 终端输出完成屏障由 App Shell 显式注入。
- `ApplicationSettingsSwitch` 已提升到根级共享 Presentation，Agent 与 Canvas 设置共同复用，不再由 App Shell 私有拥有。
- Agent Provider、设置和 Activity 专属样式与 Unit 已跟随 owner 迁移；NotificationProvider、画布导航和终端屏障的组合测试继续留在根级 Presentation。
- `AgentConsole`、Agent terminal surface、Agent 节点、创建入口、工具审批卡片与审批连线继续保留在 App Shell，因为它们分别组合 Agent 与 Run、Project、BlockGraph/React Flow 或全局工作台动作，不是可由 Agent 单一上下文完整解释的叶子组件。

### Run Terminal Surface Presentation

- terminal surface registry、context、Provider、Hook、view attachment 与 attachment identity 已迁入 `src/contexts/run/presentation`。
- xterm surface、renderer controller、paste/file-link/selection 策略、workload scheduler、raster target/observer 与 zoom raster 协调已迁入 Run 的 `terminal-surface`。
- terminal source theme 投影、canonical palette 选择和专属样式已迁入 Run；Agent 与普通终端继续消费同一个 Run Presentation 实现。
- 普通终端的 `TerminalRuntimeViewport` 主体已迁入 Run，只接收 Run ViewModel、`blockName` 和窄运行回调；App Shell `TerminalViewport` 只负责把 BlockGraph snapshot 收窄为显示名并恢复 block-scoped 输入/粘贴回调。
- `TerminalDimensions` 已成为 Run Presentation 的窄视图类型，Run surface 不再为了行列尺寸依赖 App Shell 的聚合类型文件。
- Run 自有 Unit 已迁入 `tests/unit/contexts/run`；需要 DOM 的用例按 `*.presentation.spec.*` 进入 jsdom，跨上下文 viewport、Agent terminal 和 workload 协调测试继续留在根级 Presentation。
- `TerminalViewport` adapter、`AgentTerminalSurface`、`useAgentTerminalView` 和 `terminalRenderingWorkloadCoordinator` 继续留在 App Shell：它们分别组合 BlockGraph/Agent/全局画布与 Run surface，不是 Run 单一上下文叶子。

### Run Terminal State 与 Runtime Presentation

- `TerminalViewState`、`TerminalStateStore`、idle state factory 与 terminal dimensions 的定义统一归入 Run `TerminalPresentationTypes`；App Shell `types.ts` 只在复合节点契约中消费 Run state，不再导出它的 state/store 入口。
- output tail、startup output buffer、session runtime/reconciliation、state key/selectors/retention、workspace migration 与 state update/store 已迁入 Run `presentation/view-models`。
- service endpoint/conflict 与 workflow terminal event 的 renderer 派生投影已迁入 Run；端点与 workflow 状态仍分别来自 Run Application 的精确运行事件，不在 Presentation 产生第二事实来源。
- runtime availability、scrollback preference、recovery、session event subscription 与 stale view identity reconciliation Hook 已迁入 Run，并继续通过注入的通知控制器或 App Shell 参数完成组合。
- 以上 Run 自有 Unit 已迁入 `tests/unit/contexts/run`；React store 和 availability Hook 使用 `*.presentation.spec.*` 进入 jsdom，Workbench node projection 等跨上下文测试继续留在根级 Presentation。
- `useTerminalSessionRetention`、terminal minimap 和 workflow notifications 继续留在 App Shell，分别组合 Project 工作区、Agent/BlockGraph 节点或全局通知导航。

### Run Service Runtime UI Presentation

- `TerminalServiceRuntimeBar` 及其专属样式已迁入 Run `presentation/components` 与 `styles`，直接消费 Run Application 的精确运行 identity、实际端点和端口冲突 DTO。
- 服务状态条自有复制、外部打开、定位、编辑、关闭和警告的语义图标，继续使用相同 Phosphor glyph、weight、Tooltip、可访问名称和 `data-icon-*` 标记，不再依赖 App Shell `WorkbenchIcon`。
- `TerminalNode` 继续作为组合 wrapper，负责注入剪贴板、外部打开、画布定位、元数据编辑和冲突消除动作；Run 组件不理解 React Flow、BlockGraph 节点或 App Shell 导航状态。
- 组件 Unit 与 owner 一同迁入 `tests/unit/contexts/run`，端点可打开条件、fallback、租约清理状态、managed/external/unknown 冲突和安全动作保持不变。

### Run Terminal Node Runtime Header Presentation

- `TerminalRuntimeActions` 与 `TerminalWorkflowStatusBadge` 已从混合的 `TerminalNode` 提取到 Run `presentation/components`，只消费 Run 状态、已投影的启动可用性、显示名和窄回调。
- 流程运行/停止、启动、停止当前命令、退出保留和重开的专属状态样式已迁入 Run；动作轨基础布局、编辑、删除与组合候选样式继续由 App Shell/BlockGraph 组合层拥有。
- Run 组件自有 Phosphor glyph、weight、Tooltip、可访问名称和 `data-icon-*` 标记，不再依赖 App Shell `WorkbenchIcon`。
- `TerminalNode` 继续负责 React Flow、BlockGraph 定义、组合候选、编辑/删除以及 Run viewport、service bar 和 runtime header 的最终排列与回调绑定。
- owner-level Unit 证明 workflow badge、五个 Run 动作、active run 停止态和 workflow 保留限制；根级组合测试继续证明七动作整体顺序与 block-scoped 回调。

### Run Terminal Settings Presentation

- `TerminalScrollbackSettingsSection` 已从混合的 `TerminalSettingsPane` 提取到 Run `presentation/components`，只消费 Run 的滚屏预算类型、preset 与变更回调。
- 滚屏 section 自有选项投影、当前选择和 selection motion Hook；`TerminalSettingsPane` 继续作为 App Shell 组合壳，拥有终端设置页标题并组合流程搭建偏好。
- `application-settings.css` 中的 settings group/options 布局继续归 App Shell，因为同一结构同时服务 Run 滚屏 section 与尚未确认 owner 的 workflow build section；本批不复制或倒置 CSS owner。
- 独立 Run Presentation Unit 证明三个受限预算、当前 motion target 和变更发布；Application Settings 组合测试继续证明导航、页面布局和 workflow 选项未受影响。

### BlockGraph Terminal Definition Presentation

- `TerminalMetadataForm`、执行配置 draft、专属样式与 Unit 已迁入 BlockGraph Presentation，直接消费 BlockGraph snapshot 和领域更新输入。
- 名称、描述、启动命令、任务/服务模式、就绪配置及端口意图继续作为一个终端定义提交；迁移不改变校验、焦点、文案或保存行为。
- BlockGraph Presentation 不读取 Run session、端口租约或实际端点；App Shell `TerminalNode` 只组合定义表单与 Run runtime 子组件。
- `TerminalDefinitionInput` 与元数据输入不再由 App Shell 重复声明，而是收窄到 BlockGraph 领域更新契约。
- `terminalDefinitionRuntime.ts` 同时适配 BlockGraph 定义更新与 Run 实际端点打开，留待先拆端口职责后再判断归属。

### BlockGraph Template Library Presentation

- 模板库、保存对话框、专属样式和 owner-level Unit 已迁入 BlockGraph Presentation。
- 上下文组件通过 `BlockTemplatePresentationActions` 消费 list/save/update/move/delete，不直接访问 preload 全局或 Platform。
- `BlockTemplateSurfaces` 留在 App Shell，负责运行时适配，以及把模板选择交给画布放置与可选 Run 执行协调器。
- 模板库继续复用根级共享 Surface、Tooltip、selection motion、焦点恢复和 utility button motion；搜索、作用域切换、维护动作、受控退出与可访问性结果保持不变。
- `BlockTemplatePlacementPreview`、放置坐标策略和画布交互仍组合 React Flow/Workbench viewport，后续先拆出 BlockGraph 纯投影再判断归属。

## 剩余清单

以下是迁移候选清单，不表示整组文件必须原样移动。每批实施前仍需检查入站依赖、共享 UI 依赖、测试 owner 和跨上下文组合职责。

### 根级共享 Presentation 候选

基础组件与输入：

- `Tooltip.tsx`
- `SurfaceMotion.tsx`
- `useOutsidePointerDismiss.ts`
- `usePrefersReducedMotion.ts`

共享状态、动效与可访问性：

- `motionPreference.ts`
- `motionSpring.ts`
- `selectionMotion.ts`
- `springProgressMotion.ts`
- `surfaceIsolation.ts`
- `surfacePresence.ts`
- `surfaceSpringMotion.ts`
- `useSelectionMotion.ts`
- `useSurfaceMotionPresence.ts`
- `useSurfaceSpringMotion.ts`

全局 Presentation 能力：

- `i18n/**`
- `appErrorMessages.ts`
- `appMessageStore.ts`
- `appNotifications.ts`
- `NotificationCenter.tsx`
- `NotificationProvider.tsx`
- `applicationShortcuts.ts`
- `applicationShortcutNavigation.ts`
- `applicationShortcutPreference.ts`
- `applicationShortcutTooltips.ts`
- `themePreference.ts`
- `LanguageSettingsRoot.tsx`
- `ThemeSettingsRoot.tsx`

这些模块先于上下文组件迁移，否则上下文 Presentation 会反向 import `app-shell`。

### Project App Shell 保留项

- `ProjectSidebarToggle.tsx`
- `findCurrentWorkspace.ts`
- `projectSidebarMotion.ts`
- `useBranchWorkspaceActions.ts`
- `useProjectActions.ts`
- `useProjectGitStateSynchronization.ts`
- `useProjectSidebarMotion.ts`
- `useProjectSidebarVisibility.ts`
- `workspaceDirectoryMatching.ts`
- `styles/project-sidebar-layout.css`
- `styles/project-sidebar-titlebar.css`

这些模块负责全局快捷键入口、侧边栏与画布布局，或同时协调 Project、Run、BlockGraph 和工作台状态，不属于 Project Presentation。除非后续先拆出单一上下文事实，否则不应仅凭 Project 命名继续下沉。

### Agent App Shell 保留项

- `AgentConsole.tsx`、`AgentTerminalSurface.tsx`、`useAgentTerminalView.ts`、`useAgentSessionAttachment.ts`：组合 Agent 会话事实与 Run terminal view/surface 生命周期。
- `AgentNode.tsx`、`agentConsoleFlowNode.ts`：组合工作台节点、Agent 布局与运行 surface。
- `AgentConsoleActions.tsx`、`AgentCreateSplitButton.tsx`、`useWorkspaceAgentActions.ts`：组合 Agent 动作与 App Shell 菜单、Project 工作区和全局创建入口。
- `AgentToolApprovalCard.tsx`、`AgentApprovalIntentEdge.tsx`、`agentApprovalConnectionProjection.ts`、`agentApprovalPresentation.ts`、`useAgentToolApprovals.ts`：审批事实属于 Agent，但卡片定位、连线几何和 React Flow 投影属于 App Shell/BlockGraph 组合层。
- `focusAgentConsoleInCanvas.ts`、`useAgentLayoutCoordination.ts`、`useAgentActivityNotificationNavigation.ts`、`agentActivityNavigation.ts`：Agent 提供目标事实，App Shell 拥有跨对象相机、工作台导航与 request id 协调。
- `AppShellProviders.tsx`：继续作为 Agent Provider Store、Agent Activity、通知系统与 Run terminal surface registry 的应用级装配入口。

这些文件不是待原样下沉清单。只有后续能先拆出不理解 Run、Project、BlockGraph、React Flow 或 App Shell 全局状态的 Agent 子组件时，子组件才进入 Agent Presentation。

### Run Presentation 候选

组件与 Hook：

- `useTerminalMinimapAppearance.ts`
- `useTerminalSessionRetention.ts`
- `useTerminalWorkflowNotifications.ts`

保留或先拆的混合模块：

- `TerminalViewport.tsx`：已拆为 Run-owned `TerminalRuntimeViewport` 与 App Shell adapter；后者仅收窄 BlockGraph 显示名并重绑 block-scoped 回调，不再拥有 xterm 生命周期。
- `TerminalNode.tsx`、`terminalFlowNodes.ts`：Run viewport、service runtime bar、workflow badge 和 runtime actions 已拆出；剩余模块组合 BlockGraph 节点/定义、React Flow、自动启动与 Run 子组件，继续留在 App Shell，后续只下沉可由 BlockGraph 独立解释的叶子。
- `terminalRenderingWorkloadCoordinator.ts`：把全局画布、侧边栏和交互抑制状态投影到 Run workload/raster owner，继续由 App Shell 组合。
- `useTerminalSessions.ts`、`useTerminalStarter.ts`、`useTerminalWorkspaceSynchronization.ts`：同时协调 BlockGraph 与 Run，留在 App Shell coordinator，或只把 Run 侧状态机下沉。
- `terminalWorkflowEdges.ts`、`terminalWorkflowBuildEdgePresentation.ts`：工作流定义来自 BlockGraph，运行/搭建状态来自 Run 或 Agent，React Flow 投影属于 App Shell。
- `TerminalSettingsPane.tsx`：Run 滚屏设置 section 已拆出；App Shell wrapper 继续组合设置页标题与流程搭建偏好，后者需另行确认 owner。

### BlockGraph Presentation 候选

组件：

- `BlockTemplatePlacementPreview.tsx`
- `QuickExecutionBar.tsx`
- `TerminalGroupNode.tsx`

ViewModel、策略和交互：

- `blockTemplatePlacement.ts`
- `quickExecutionDrag.ts`
- `quickExecutionDragPresentation.tsx`
- `quickExecutionFocus.ts`
- `resizeTerminalBlockInWorkbench.ts`
- `terminalConnectionScope.ts`
- `terminalDefinitionRuntime.ts`
- `terminalGroupDropSpring.ts`
- `terminalGroupDropTarget.ts`
- `updateGraphViewportInWorkbench.ts`
- `useBlockTemplateActions.ts`
- `useTerminalBlockResizeAction.ts`
- `useTerminalGroupActions.ts`
- `useTerminalGroupDragActions.ts`
- `useTerminalGroupDropSpring.ts`
- `useTerminalGroupSelectionMode.ts`
- `useWorkbenchGraphIndex.ts`
- `visibleTerminalCanvasTarget.ts`

保留或先拆的混合模块：

- `WorkbenchCanvas.tsx`、`WorkbenchCanvasBottomControls.tsx`：App Shell 拥有组合布局，BlockGraph 组件作为消费者嵌入。
- `BlockTemplateSurfaces.tsx`：模板组件已经下沉；该文件保留 preload 动作适配、当前 Workbench 选择和放置/运行协调，属于 App Shell composition adapter。
- `CanvasObjectContextMenu.tsx`、`CanvasNodeMenu.tsx`：菜单表面和互斥输入属于共享/App Shell，各对象动作与文案投影属于对应上下文。
- `QuickExecutionBar.tsx`：绑定事实由 BlockGraph 拥有，实际启动由 Run；需要拆分展示/编辑与执行协调。
- `useCanvasSelectionViewport.ts`、`workbenchViewportMotion.ts`：选择事实来自对象 owner，统一相机结果属于 App Shell，不迁入 BlockGraph。

### CanvasArrangement Presentation 候选

- `CanvasArrangementOverlay.tsx`
- `CanvasArrangementToolbar.tsx`
- `canvasArrangementGridPlanning.ts`
- `canvasArrangementSelection.ts`
- `canvasArrangementStackingProjection.ts`
- `useCanvasStackDragging.ts`
- `styles/canvas-arrangement.css`

保留或先拆的混合模块：

- `useCanvasArrangementActions.ts`、`useAppShellCanvasArrangement.ts`：分别协调 Agent、BlockGraph 位置提交与 CanvasArrangement 关系提交，属于跨上下文 App Shell coordinator。
- `CanvasArrangementOverlay.tsx`：选择框的视觉组件可以下沉；跨对象选择来源与提交顺序留在 App Shell。
- `canvasArrangementGridPlanning.ts`：如果只做消费方 UI 投影可留 Presentation；若重复领域布局规则，必须改为消费 CanvasArrangement 应用 DTO，而不能在 UI 形成第二套 owner。

### 明确保留在 App Shell 的职责

- `AppShell.tsx`
- `AppShellRoot.tsx`
- `AppShellProviders.tsx` 的应用级装配部分
- `ApplicationSettingsRoot.tsx`
- `WorkbenchCanvas.tsx`
- `types.ts` 拆分后的跨上下文 `WorkbenchSnapshot`
- `appShellDerived.ts`
- `appShellTypes.ts`
- `useInitialWorkbenchLoad.ts`
- `useCurrentGraphState.ts`
- `useWorkbenchFlowNodes.ts`
- `workbenchNodeProjectionReconciler.ts`
- `workbenchCanvasProps.ts`
- `WorkbenchCanvasStates.tsx`
- `resolveWorkbenchLayoutFocusRequest.ts`
- `useWorkflowNotificationNavigation.ts`
- `useApplicationSettingsNavigation.ts`
- 跨上下文 lifecycle、焦点、选择、相机、恢复和补偿协调器

这些文件仍需拆掉单一上下文内部实现，但它们的最终组合入口继续属于 App Shell。

### 样式和资源

当前 39 个 `styles/*.css` 和 4 个 `assets/*` 必须跟随其视觉 owner 迁移：

- 只服务单个上下文组件的样式/资源进入该上下文 `presentation/styles` 或 `presentation/assets`。
- Tooltip、Surface、Selection、Notification 等跨上下文样式进入根级共享 Presentation。
- Workbench Canvas、全局设置、应用外壳和跨上下文节点组合样式继续留在 App Shell。
- 同一 CSS 文件混合多个 owner 时先按选择器职责拆分，不通过跨目录深层 import 维持旧文件。

## 实施阶段

### 阶段 0：基线与首个叶子迁移

状态：已完成。

- 建立本路线图与基线。
- 完成 Run `terminalRuntimePreference` 迁移。
- 证明“代码、消费者 import、测试 owner 一起移动”的最小模式。

### 阶段 1：共享 Presentation 基础

状态：已完成（2026-08-31）。

目标：消除上下文 Presentation 对 `app-shell` 通用组件的反向依赖。

- 建立 `src/presentation/shared/{components,hooks,motion,styles}`。
- 迁移 Tooltip、Surface、Selection、reduced-motion 和 outside-pointer 等稳定能力。
- 把 `i18n` 提升到 `src/presentation/i18n`。
- 保持组件 API、CSS class、焦点和动效结果不变。

实施中确认 `ApplicationSettingsSwitch`、通知 UI、Theme/Language Settings Root 和快捷键仍表达应用级设置或装配语义，因此未机械迁入 shared；它们将在对应 App Shell 收口批次重新判断。Context Presentation → App Shell 的禁止规则已经提前落地，不再等到阶段 8。

最低验证：相关 Presentation Unit、样式门禁、i18n 门禁、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 2：Project Presentation

状态：已完成（2026-08-31）。

目标：以当前已存在的 `contexts/project/presentation` 为第一个完整纵向 UI 切片。

- 下沉 Project Sidebar 的列表、分支表单、归档和移除组件。
- 下沉 Project 专属 ViewModel 与样式。
- App Shell 只保留当前 Workbench 选择、全局快捷键和跨上下文导航协调。
- 清除 Project Presentation 对 `app-shell` Tooltip、Motion、i18n 的反向依赖。

最低验证：Project Presentation Unit、Project 相关 App Shell Unit、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 3：Agent Presentation

状态：已完成（2026-08-31）。

目标：下沉 Provider、Agent 设置、控制台状态与工具审批的单上下文 UI。

- 已迁移纯 Agent ViewModel、Provider catalog 状态、设置组件、Provider 状态反馈与 Agent activity 投影。
- 已把通知发布和 Run terminal 完成屏障改为 App Shell 注入，Agent Presentation 不反向依赖 App Shell。
- AgentNode、AgentTerminalSurface、AgentConsole、创建入口和审批连线经 owner 检查确认属于跨上下文组合，保留在 App Shell；阶段 7 只在存在清晰叶子边界时继续拆分，不做按文件名迁移。
- Provider-neutral、审批、终端 attach、焦点、动效和可访问性语义保持不变。

最低验证：Agent Presentation Unit、Provider boundary、Agent Unit/Contract、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 4：Run Presentation

状态：已完成（2026-09-01）。

目标：让 terminal surface、输出模型投影、主题、恢复和 runtime UI 归 Run Presentation。

- 已迁移无跨上下文依赖的 surface 策略、registry、xterm/raster/workload 能力、主题投影及其 Provider/Hook。
- 已迁移输出缓冲、session state/store、恢复、runtime availability/preference、service/workflow event 投影及 Run 自有 Hook。
- 已迁移 `TerminalServiceRuntimeBar`、专属样式和 Unit；App Shell 只保留剪贴板、外部打开、画布定位和编辑入口的动作装配。
- 已从 `TerminalSettingsPane` 提取 Run 滚屏设置 section；App Shell 保留设置页组合与 workflow build 偏好。
- 已把普通终端 viewport 主体迁入 Run，并以 App Shell adapter 隔离 BlockGraph snapshot。
- 已把 `TerminalNode` 的 workflow badge、流程/终端运行控制与退出保留 UI 迁入 Run；App Shell 只传递显示名、启动可用性和窄回调。
- minimap、Project session retention 和 workflow notification 只有先拆出单一 owner 后才能下沉。
- 不改变 xterm 生命周期、attach、恢复、resize 或滚屏行为。

最低验证：Run Presentation Unit、终端相关 Integration/Contract、终端关键 E2E、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 5：BlockGraph Presentation

状态：进行中（2026-09-01）。

目标：下沉图编辑、终端定义、组合、模板和快捷执行的单上下文 UI。

- 已迁移终端元数据/执行配置表单、draft、输入类型、专属样式和 owner-level Unit。
- 已迁移模板库、保存对话框、动作契约、专属样式和 owner-level Unit；App Shell 只保留 preload 与放置/运行适配。
- 接下来迁移图内纯策略，并拆分模板放置的 BlockGraph 投影与 App Shell viewport 协调。
- 再拆 TerminalNode、TerminalGroup、QuickExecution 的展示与 Run 执行协调。
- 图事实和布局规则继续来自 BlockGraph 聚合/用例，不在 UI 复制。

最低验证：BlockGraph Presentation Unit、BlockGraph Unit/Contract、相关 App Shell Unit、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 6：CanvasArrangement Presentation

目标：下沉堆叠选择、Overlay 和局部投影，同时保留跨 owner 提交协调。

- CanvasArrangement 组件只消费公开 DTO。
- App Shell 继续负责 Agent/BlockGraph 位置与 CanvasArrangement 关系的提交顺序、补偿和统一选择来源。

最低验证：CanvasArrangement Unit/Contract、相关 App Shell Unit、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 7：混合组件与 App Shell 收口

目标：处理不能按文件整体迁移的跨上下文组件。

- 拆分 `types.ts`，避免所有模块依赖一个五上下文大类型文件。
- 把 TerminalNode、AgentNode、Minimap、ContextMenu 和 Settings 变为 App Shell wrapper + 上下文子组件。
- 将跨上下文 Hook 收敛到命名明确的 `coordinators/`，纯组合投影进入 `projections/`。
- 清理旧 re-export、空目录和无 owner 的样式。

最低验证：全部 Presentation Unit、typecheck、dependency-cruiser、knip、完整 `pre-commit`。

### 阶段 8：架构门禁与文档收束

目标：让完成后的边界可自动防回归。

- 禁止 `src/contexts/*/presentation` import `src/presentation/app-shell`。
- 禁止 Context Presentation 直接 import Infrastructure。
- 为允许的根级共享 Presentation 依赖建立精确规则。
- 更新架构文档中的实际目录示例；本路线图完成后标记归档状态，不把计划文本保留为当前事实。

最低验证：架构门禁测试、文档检查、完整 `pre-commit`。

## 每批迁移模板

每一批必须按以下顺序完成：

1. 列出目标文件、事实 owner、入站消费者和现有测试。
2. 判断文件是整体移动还是先拆接口；混合 owner 文件不得直接移动。
3. 行为不变的纯移动先复用现有测试；如果拆分改变可观察组件接口或状态路径，先补失败的 Unit 测试。
4. 使用新 owner 路径更新消费者，不保留长期兼容 re-export。
5. 测试随 owner 移动；跨上下文场景测试留在根级 Presentation。
6. 运行目标 Unit、typecheck、dependency-cruiser 和本批专项门禁。
7. 运行完整 `pnpm pre-commit`，失败必须区分目标回归与已存在的测试隔离问题，不能静默忽略。
8. 每批独立提交，提交信息体现 owner，而不是只写“move files”。

## 完成标准

- 各已实现上下文的 Presentation 目录包含其专属 UI，而不是占位目录。
- `src/presentation/app-shell` 不再包含可以由单一上下文完整解释的组件和 ViewModel。
- Context Presentation 不依赖 App Shell 内部模块。
- 根级共享 Presentation 不依赖任何上下文内部实现。
- App Shell 的剩余代码都能说明至少一个跨上下文组合、应用级布局或全局导航职责。
- 全部静态门禁、Unit、Integration、Contract 和 E2E 通过。

## 风险

- 仅移动文件也可能因为 CSS 导入顺序、React Context 装配位置或测试 mock 路径改变而产生回归。
- `types.ts`、i18n、Tooltip、SurfaceMotion 和 Workbench 状态具有高 fan-in，必须独立成批，不能夹带上下文组件迁移。
- Terminal/Agent/Canvas 的焦点、attach、resize 和动效使用同一工作台生命周期；错误拆分可能形成重复 owner 或异步时序差异。
- 现有完整 E2E 在 Agent Provider 菜单发现上存在隔离运行通过、全套运行偶发缺失 Provider 的波动。该问题必须单独跟踪，不能通过延长固定等待掩盖，也不能把单次隔离通过当作完整门禁通过。
