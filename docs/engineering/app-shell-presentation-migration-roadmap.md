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
- 用户可见错误解析和通知契约已迁入根级共享 Presentation；通知 Store、Provider 和 Center 仍由 App Shell 拥有。
- `SurfaceMotion` 不再理解 Project Sidebar 或 Workbench DOM；`AppShellSurfaceMotion` 适配器显式提供 App Shell 的 isolation target。
- 混合的 `selection-motion.css` 只迁移通用 indicator，Settings、Project、Terminal 和 Shortcut 专属选择器继续留给后续 owner 批次。
- dependency-cruiser 已禁止 `src/contexts/*/presentation` 反向依赖 `src/presentation/app-shell`。

## 剩余清单

以下是迁移候选清单，不表示整组文件必须原样移动。每批实施前仍需检查入站依赖、共享 UI 依赖、测试 owner 和跨上下文组合职责。

### 根级共享 Presentation 候选

基础组件与输入：

- `Tooltip.tsx`
- `SurfaceMotion.tsx`
- `ApplicationSettingsSwitch.tsx`
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

### Project Presentation 候选

- `ArchiveWorkspaceDialog.tsx`
- `ProjectSidebar.tsx`
- `ProjectSidebarBranchSelector.tsx`
- `ProjectSidebarBranchWorkspaceForm.tsx`
- `ProjectSidebarConfirmationDialog.tsx`
- `ProjectSidebarProjectRemovalPopover.tsx`
- `ProjectSidebarToggle.tsx`
- `WorkspaceRowMenu.tsx`
- `findCurrentWorkspace.ts`
- `projectReorderMotion.ts`
- `projectSidebarMotion.ts`
- `useBranchWorkspaceActions.ts`
- `useBranchWorkspaceFormSpring.ts`
- `useProjectActions.ts`
- `useProjectGitStateSynchronization.ts`
- `useProjectSidebarBranchWorkspaceForm.ts`
- `useProjectSidebarMotion.ts`
- `useProjectSidebarReorder.ts`
- `useProjectSidebarVisibility.ts`
- `workspaceDirectoryMatching.ts`
- `styles/project-sidebar*.css`
- `styles/project-reorder*.css`

需要先拆的边界：`ProjectSidebar` 当前消费根级 `WorkbenchSnapshot` 和全局快捷键 Tooltip；Project 专属列表、分支表单和归档交互应下沉，工作台选择协调与全局快捷键注入留在 App Shell wrapper。

### Agent Presentation 候选

组件：

- `AgentActivityObserver.tsx`
- `AgentConsole.tsx`
- `AgentConsoleActions.tsx`
- `AgentCreateSplitButton.tsx`
- `AgentMcpCapabilityToggle.tsx`
- `AgentProviderIcon.tsx`
- `AgentProviderStatusView.tsx`
- `AgentSettingsPane.tsx`
- `AgentToolApprovalCard.tsx`

ViewModel、状态和表现策略：

- `agentActivityStore.ts`
- `agentConsoleModel.ts`
- `agentProviderFeedback.ts`
- `agentProviderPreference.ts`
- `agentRuntimeReconciliation.ts`
- `agentToolApprovalTypes.ts`
- `useAgentActivitySnapshots.ts`
- `useAgentCreationProviders.ts`
- `useAgentProviderCatalog.ts`
- `useAgentProviderNotifications.ts`
- `useAgentProviderPreferences.ts`
- `useAgentProviderState.ts`
- `useAgentSessionAttachment.ts`
- `useCreatableAgentProviders.ts`
- `useWorkspaceAgentActions.ts`

保留或先拆的混合模块：

- `AgentNode.tsx`：同时承担工作台节点外壳、Agent 布局和运行 surface 组合。
- `AgentTerminalSurface.tsx`、`useAgentTerminalView.ts`：Agent 状态属于 Agent，终端 view identity 和 surface 生命周期属于 Run；需要通过组件 props/ViewModel 边界拆分。
- `AgentApprovalIntentEdge.tsx`、`agentApprovalConnectionProjection.ts`、`agentApprovalPresentation.ts`：工具审批属于 Agent，但连线几何和 React Flow 投影属于 App Shell/BlockGraph 组合层。
- `focusAgentConsoleInCanvas.ts`、`useAgentLayoutCoordination.ts`：Agent 提供目标事实，App Shell 拥有跨对象相机与布局协调。
- `AppShellProviders.tsx`、`AgentProviderStateProvider.tsx`：Provider 状态实现可下沉，应用级 Provider 装配入口留在 App Shell。

### Run Presentation 候选

终端 surface 与模型投影：

- `terminalOutputTail.ts`
- `terminalPaste.ts`
- `terminalRasterObserverHub.ts`
- `terminalRendererController.ts`
- `terminalRenderingWorkloadCoordinator.ts`
- `terminalSelectionCopy.ts`
- `terminalSessionOutputBuffer.ts`
- `terminalSessionRuntime.ts`
- `terminalSessionStateRetention.ts`
- `terminalSessionStateSelectors.ts`
- `terminalSessionWorkspaceMigration.ts`
- `terminalStateStore.ts`
- `terminalStateUpdates.ts`
- `terminalSurfaceAttachmentIdentity.ts`
- `terminalSurfaceRegistry.ts`
- `terminalSurfaceRegistryContext.ts`
- `terminalTheme.ts`
- `terminalViewAttachment.ts`
- `terminalWorkloadScheduler.ts`
- `terminalXtermRasterTarget.ts`
- `terminalXtermSurface.ts`
- `terminalZoomRasterCoordinator.ts`
- `terminalZoomRasterPolicy.ts`

组件与 Hook：

- `TerminalServiceRuntimeBar.tsx`
- `TerminalSurfaceRegistryProvider.tsx`
- `TerminalThemeProjection.tsx`
- `useTerminalMinimapAppearance.ts`
- `useTerminalRuntimeAvailability.ts`
- `useTerminalRuntimePreference.ts`
- `useTerminalRuntimeRecovery.ts`
- `useTerminalSessionEvents.ts`
- `useTerminalSessionRetention.ts`
- `useTerminalSurfaceRegistry.ts`
- `useTerminalViewIdentityReconciliation.ts`
- `useTerminalWorkflowNotifications.ts`

保留或先拆的混合模块：

- `TerminalViewport.tsx`：BlockGraph 提供终端定义，Run 提供 terminal model/view；目标是 Run surface 组件只接收 Run ViewModel，App Shell wrapper 负责组合 BlockGraph 元数据。
- `TerminalNode.tsx`、`terminalFlowNodes.ts`：BlockGraph 拥有节点和图，Run 提供运行状态，继续由 App Shell 组合或拆出两个上下文子组件。
- `useTerminalSessions.ts`、`useTerminalStarter.ts`、`useTerminalWorkspaceSynchronization.ts`：同时协调 BlockGraph 与 Run，留在 App Shell coordinator，或只把 Run 侧状态机下沉。
- `terminalWorkflowEdges.ts`、`terminalWorkflowBuildEdgePresentation.ts`：工作流定义来自 BlockGraph，运行/搭建状态来自 Run 或 Agent，React Flow 投影属于 App Shell。
- `TerminalSettingsPane.tsx`：拆成 Run 的滚屏设置 section 与 App Shell 的设置页组合；流程搭建偏好另行确认 owner。

### BlockGraph Presentation 候选

组件：

- `BlockTemplateLibraryRoot.tsx`
- `BlockTemplatePlacementPreview.tsx`
- `BlockTemplateSaveDialog.tsx`
- `BlockTemplateSurfaces.tsx`
- `QuickExecutionBar.tsx`
- `TerminalGroupNode.tsx`
- `TerminalMetadataForm.tsx`

ViewModel、策略和交互：

- `blockTemplatePlacement.ts`
- `quickExecutionDrag.ts`
- `quickExecutionDragPresentation.tsx`
- `quickExecutionFocus.ts`
- `resizeTerminalBlockInWorkbench.ts`
- `terminalConnectionScope.ts`
- `terminalDefinitionRuntime.ts`
- `terminalExecutionConfigDraft.ts`
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

目标：以当前已存在的 `contexts/project/presentation` 为第一个完整纵向 UI 切片。

- 下沉 Project Sidebar 的列表、分支表单、归档和移除组件。
- 下沉 Project 专属 ViewModel 与样式。
- App Shell 只保留当前 Workbench 选择、全局快捷键和跨上下文导航协调。
- 清除 Project Presentation 对 `app-shell` Tooltip、Motion、i18n 的反向依赖。

最低验证：Project Presentation Unit、Project 相关 App Shell Unit、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 3：Agent Presentation

目标：下沉 Provider、Agent 设置、控制台状态与工具审批的单上下文 UI。

- 先迁移纯 Agent ViewModel、Provider catalog 状态和设置组件。
- 再拆 AgentNode、AgentTerminalSurface 和审批连线中的 App Shell/Run 投影。
- Provider-neutral 和审批语义保持不变。

最低验证：Agent Presentation Unit、Provider boundary、Agent Unit/Contract、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 4：Run Presentation

目标：让 terminal surface、输出模型投影、主题、恢复和 runtime UI 归 Run Presentation。

- 先迁移无跨上下文依赖的纯策略、store 和 registry。
- 再迁移依赖这些能力的 Hook 和组件。
- 最后拆 TerminalViewport/TerminalNode 的 BlockGraph 定义与 Run surface 边界。
- 不改变 xterm 生命周期、attach、恢复、resize 或滚屏行为。

最低验证：Run Presentation Unit、终端相关 Integration/Contract、终端关键 E2E、typecheck、dependency-cruiser、完整 `pre-commit`。

### 阶段 5：BlockGraph Presentation

目标：下沉图编辑、终端定义、组合、模板和快捷执行的单上下文 UI。

- 先迁移模板、元数据表单和图内纯策略。
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
