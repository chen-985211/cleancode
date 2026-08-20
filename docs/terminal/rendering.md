# xterm、PTY 与 CJK 终端渲染排障指南

## 文档地位

本文沉淀 cleancode 中 xterm、PTY 行列同步、终端滚动条和 CJK 字符裁剪问题的工程经验。它用于帮助开发者定位和验证终端渲染缺陷，不重新定义产品语义、架构边界或测试规则。

本文记录的具体选择属于当前技术栈下的实现与排障方式；Electron、xterm.js 和 node-pty 的当前采用情况由 [技术栈说明](../engineering/tech-stack.md) 维护。若依赖版本或渲染器变化，必须重新测量，不得把本文中的一次观测值当成永久常量。

## 适用范围

遇到以下现象时，应阅读本文：

- 终端最右侧的中文、全角标点或 emoji 显示一半、消失或提前换行。
- xterm 可见列数与 CLI 实际换行位置不一致。
- 调整 Agent 节点大小、画布缩放或切换工作区后，输出布局异常。
- 切换应用主题并离开再返回工作区后，Agent 的终端背景或 Codex composer 与当前主题不一致。
- 非 100% 画布缩放下，鼠标选区、链接命中或 TUI 鼠标点击偏离指针位置。
- 滚动条没有贴住终端最右边，增加“安全区域”后反而更突兀。
- 终端底部出现不属于内容的黑边或实色条。
- DOM 中能找到完整文本，但截图里仍有字符被裁掉。

本文以 Codex Agent 控制台的实际缺陷为案例。普通终端积木也使用 xterm 和 node-pty，排查模型可以复用，但不得因此假定两种终端已经共享同一套组件或样式。

## 先建立正确模型

终端不是一个普通的可换行文本框。它同时存在两条需要保持一致的链路：

```txt
容器像素尺寸
  -> FitAddon 计算 xterm 的 columns / rows
  -> attach / resize 应用层入口
  -> node-pty 的 cols / rows
  -> 子进程按照 PTY 网格决定换行

xterm 缓冲区中的 cell
  -> DOM renderer 生成行和 span
  -> Chromium 字体与 CSS Text 排版
  -> React Flow 缩放和像素取整
  -> 屏幕上的最终字形

屏幕上的鼠标坐标
  -> 逆变换 React Flow 的缩放
  -> xterm 本地像素坐标
  -> xterm cell 和选区位置
```

第一条链路决定“程序认为一行有多少列”，第二条链路决定“这些 cell 最终画在哪里”。任意一条出错都可能表现成右侧缺字，但修复方式完全不同。

排查时至少要把问题拆成五层：

1. **PTY 网格**：子进程启动和后续 resize 收到的 `columns`、`rows` 是否正确。
2. **xterm 生命周期**：是否在可见容器完成首次有效测量前就 attach，异步 attach 期间的 resize 是否丢失。
3. **浏览器字形度量**：隐藏测量节点与可见行对同一字符的宽度理解是否一致。
4. **外层布局**：终端内容、滚动条、边框和 padding 的几何关系是否正确。
5. **输入坐标**：浏览器 `clientX`、`clientY` 是否先从缩放后的屏幕坐标还原为 xterm 本地坐标，再换算成 cell。

不要用其中一层的修复去掩盖另一层的问题。

## 常见缺陷的多个根因

### 1. PTY 在首次有效测量前启动

Agent 控制台旧的 PTY attach fallback 是 `88 x 24`。旧实现会直接拿这个默认值 attach PTY，之后才由 `FitAddon` 根据节点真实尺寸计算行列。这个 fallback 目前仍用于测试环境；真实 Electron surface 则必须优先等待实测尺寸。

这会制造竞态：Codex CLI 可能先按 88 列输出和重排，而屏幕实际可以容纳的列数已经不同。只在之后调用一次 resize 不能保证启动阶段已经产生的输出布局与可见网格完全一致。

成熟做法是 measurement-first：

- 先 `open` xterm，再 `fit`。
- 只接受大于零的首次有效 `columns`、`rows`。
- 使用这组实测尺寸 attach PTY。
- 订阅 xterm 的 `onResize`，而不是只依赖外层 `ResizeObserver` 的回调时机。
- 对重复尺寸去重，避免重复 IPC 和重复 attach。
- 如果 attach Promise 尚未完成时尺寸再次变化，在 session 返回后补发最新 resize。
- 测量结果和 session 都必须带当前 workspace key，旧工作区迟到的 Promise 不得绑定到新工作区。

当前 Agent 视图实现位于 [AgentConsole.tsx](../../src/presentation/app-shell/AgentConsole.tsx) 和 [useAgentTerminalView.ts](../../src/presentation/app-shell/useAgentTerminalView.ts)，并与普通终端共享 [terminalXtermSurface.ts](../../src/presentation/app-shell/terminalXtermSurface.ts)。表现层拥有“当前可见网格多大”这个事实；Agent 应用层和 Run 的 node-pty 适配器只消费 attach/resize 命令，不反向猜测 UI 尺寸。

### 2. 右侧 padding 把滚动条整体推向左边

旧样式把 `9px 10px` padding 直接放在承载 xterm 的元素上。xterm 的 viewport 和滚动条即使在自身容器内完全靠右，相对 Agent 终端外框仍然会保留 10px 右侧空隙。

给右边继续增加“安全区域”只会：

- 让滚动条离外框更远。
- 减少可用于 cell 的宽度，改变列数和换行点。
- 掩盖真正的字宽或 PTY 尺寸问题。

当前做法把文字留白、源主题投影和滚动条几何分开。普通终端和 Agent terminal 都把阅读留白交给共享投影边界，而不是各自在外壳或 xterm mount 上声明：

```css
.terminal-theme-projection {
  box-sizing: border-box;
  background: var(--cc-terminal-projection-background);
  padding: 9px 0 9px 10px;
}

.terminal-viewport,
.agent-terminal-viewport {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

:root[data-theme='dark']
  .terminal-theme-projection[data-terminal-source-theme='light']
  > :is(.terminal-viewport, .agent-terminal-viewport),
:root[data-theme='light']
  .terminal-theme-projection[data-terminal-source-theme='dark']
  > :is(.terminal-viewport, .agent-terminal-viewport) {
  filter: var(--cc-terminal-theme-mismatch-filter);
}
```

左、上、下仍保留阅读留白，xterm viewport 则在右侧 full-bleed。wrapper 留白使用当前应用主题背景并保持未过滤，只有直接子 viewport 在源主题与当前主题不一致时应用滤镜。滚动条 track 和 viewport 使用透明背景，避免它们自身形成实色底边。共享边界实现位于 [TerminalThemeProjection.tsx](../../src/presentation/app-shell/TerminalThemeProjection.tsx) 和 [terminal-theme-projection.css](../../src/presentation/app-shell/styles/terminal-theme-projection.css)，Agent 与普通终端的局部几何分别位于 [agent-console.css](../../src/presentation/app-shell/styles/agent-console.css) 和 [terminal-node.css](../../src/presentation/app-shell/styles/terminal-node.css)。

### 3. Chromium 对连续全角标点进行上下文压缩

最隐蔽的根因不在 PTY，也不在右侧 padding，而在浏览器文本排版。

在本次 Electron/Chromium 与 xterm DOM renderer 的组合中，默认的 `text-spacing-trim: normal` 会根据上下文调整全角标点间距。终端网格要求一个双宽字符始终占两个 cell，但浏览器对“单个 `，`”和“一串连续 `，，，，`”给出了不同的平均宽度。xterm 的隐藏字宽测量与可见行渲染因此不再处于同一个度量模型中，修正用的间距会在多个 span 上累积，最终字形超过行右边界；而 xterm 行本身会裁剪溢出内容，于是用户看到半个中文字符。

这类情况中，字符可能完整存在于 xterm buffer 和 DOM `textContent` 中，丢失的只是像素。仅断言文本连续性会误判为“已经修好”。

当前终端网格显式关闭上下文相关的东亚文本间距：

```css
.agent-terminal-viewport .xterm {
  text-autospace: no-autospace;
  text-spacing-trim: space-all;
}
```

`space-all` 的目的不是美化普通段落，而是让全角标点在测量和显示时都保持全宽，维护 terminal cell 的确定性。W3C 的 `text-spacing` shorthand 也把 `space-all` 与 `no-autospace` 的组合定义为关闭全部自动文本间距。该行为定义可参阅 [CSS Text Module Level 4](https://www.w3.org/TR/css-text-4/#text-spacing-trim-property)。本次 E2E 直接证明的是组合后的字宽结果，没有分别证明两个 longhand 各自都是必要条件。

### 4. 当前主题留白与源主题内容分层协调

运行中的 terminal generation 会保留创建时的源 palette；应用主题变化时，renderer 只转换仍按该 palette 绘制的 viewport 内容。`TerminalThemeProjection` wrapper 保持无滤镜，使用当前应用主题背景绘制 `9px 0 9px 10px` 阅读留白；直接子 viewport 则继承 `data-terminal-source-theme` 对应的 terminal token，并且只在源主题与当前主题不一致时应用 mismatch filter。

canonical 浅色和深色背景必须在该滤镜下精确映射到 wrapper 的目标背景，使内容边缘与上、左、下阅读留白形成连续像素平面。最右侧没有 padding，viewport 和滚动条继续贴住内容外框。节点边框、标题、搜索、粘贴确认、链接错误和进度等第一方界面位于被过滤子树之外，不能随外部 CLI 内容一起反色。修复时不得通过在三侧补伪元素或近似色掩盖背景映射不一致。

## Agent 会话源主题与重挂载

Codex 等 TUI 可以通过终端协议查询背景色，并据此输出真彩色背景、composer 和状态区域。因此，“当前应用想显示的主题”和“仍在运行的 PTY 已经采用的源 palette”是两个不同事实。主题切换只改变前者，不得假定子进程会同步改变后者。

排查不同 Agent CLI 的外观时，还要把三层事实分开：Run 提供 PTY 与终端能力环境，xterm/headless model 共同解释 canonical source palette，Provider CLI 再根据终端查询、自己的配置和版本输出 ANSI 或真彩色 TUI。前两层属于 cleancode 宿主契约，最后一层属于外部 CLI；宿主 palette 一致只能保证相同的默认颜色语义和可读基础，不能保证 Codex、Claude Code、OpenCode 的 composer、品牌强调色或布局相同。不得为了消除这类差异在 Presentation 添加 Provider ID 分支或修改用户全局 CLI 配置。

Run 为普通 terminal 和 Agent foreground launch 都固定 `TERM=xterm-256color`、`COLORTERM=truecolor`、`TERM_PROGRAM=cleancode`，并根据 `terminalSourceTheme` 设置 `COLORFGBG`；Provider launch 环境中的同名键会被宿主值替换，`NO_COLOR` 则原样保留。出现同一个 CLI 在 shell 启动与应用启动时颜色能力不同的问题时，先记录这组最终子进程环境，再检查 CLI 自己的主题配置，不要只比较宿主进程继承到的环境。

完整 canonical terminal palette 的手写来源只有 [`theme.css`](../../src/presentation/app-shell/styles/theme.css)。`node scripts/check-theme.mjs --write-terminal-palette` 生成 [`TerminalPalette.generated.ts`](../../src/contexts/run/application/dto/TerminalPalette.generated.ts)，renderer xterm 和隐藏 headless model 都消费这一产物。Windows Agent foreground transport 与普通终端 Codex 的单次 probe bridge 只为 Win32 screen buffer 选择 ConsoleColor 索引；这些 setter 产生的 SGR 不得进入 xterm，不能把 ConsoleColor index 0/15 当成 canonical default RGB。`pnpm check:theme` 在生成文件缺失、手改或落后于 CSS 时失败。

部分 Windows TUI 可以通过 Console handle 发出 OSC 10/11；旧版系统 ConPTY 会在 `node-pty.onData` 之前消费查询和鼠标模式。Run 固定使用 node-pty 随包的 ConPTY DLL，使完整 VT 序列进入既有模型/视图链路。OSC 10/11 始终由权威 headless model 回答，不依赖 renderer workload 或 attach/detach 时序；可见 renderer 消费查询但不再次响应，其他 terminal query 继续遵守既有响应权交接，SGR mouse 模式也继续到达可见 xterm。

截图对应的 Codex 0.148 Windows 路径不发 OSC 10/11，也不存在 100 ms 响应竞态；它直接调用 `GetConsoleScreenBufferInfoEx`，从 current attributes 的前景/背景索引读取 Win32 color table。直接创建的 Agent 已在 foreground `started` 前设置浅色 `Black`/`White` 或深色 `Gray`/`Black`，准备输出由既有 transport 丢弃。普通 PowerShell 中手动输入 `codex` 则只允许在 Codex launch shim 的单次调用边界做同样的设置与 `finally` 恢复：Agent spec 声明 probe，Run 传入固定源主题，Agent 生成随机 token 并返回 descriptor，NodePty 激活后由 shim 用 `OSC 633 begin/end` 分别包住 setup/restore；NodePty 在输出进入 headless model、持久化和 renderer 前删除精确 span。Provider 自身 ANSI 位于两个 span 之间，必须原样保留；Provider 返回后的可见 `SGR 0` 先恢复 xterm default rendition，随后私有 restore span 只恢复 Win32 attributes，避免 ConsoleColor 索引污染浅色 xterm。token/theme 在真实 Provider 调用期间移除。不得在常驻 PowerShell bootstrap 中设置 ConsoleColor，也不得通过修改 xterm ANSI 0/15 palette、CSS filter 或预置 OSC 响应补偿。

可见 renderer 的 source-theme token 由共享 `.terminal-theme-projection[data-terminal-source-theme]` 建立作用域；mismatch filter 则有意只匹配其直接子 `.terminal-viewport` 或 `.agent-terminal-viewport`。wrapper 的当前主题背景和阅读留白保持未过滤，第一方覆盖层也继续使用当前应用主题。

Agent terminal 由 Run 承载，并在首次附加时固定 `terminalSourceTheme`。同一 terminal 再次附加时，renderer 发送当前有效主题作为新运行时提议，Run 为已存在的 PTY 返回原有 canonical source。该值不进入 Agent 持久化 schema；重新启动 Provider 或开始新对话只替换 terminal 内的 launch，不替换 terminal，也不改变 source theme。应用重启建立新 terminal 时才可以采用新的当前主题。

Agent 与普通终端使用相同的权威模型、`viewId`、snapshot、sequence 和 attach/detach 协议。工作区导航可以销毁 renderer xterm；隐藏期间 PTY 输出继续进入 Run 的 headless 模型，返回时创建新 surface，先注册定向视图，再恢复完整 snapshot 并接续严格连续的输出事件。不得依赖 renderer 常驻，也不得把截断输出尾部重新送入 parser。

Provider launch replacement 不会重置 surface 或终端模型。只有 Agent terminal identity 真正变化时才按新 snapshot 恢复视图；旧 identity、旧 `viewId` 或 sequence 缺口都必须触发拒绝或有界重试。Agent 删除、工作区归档、项目移除、默认工作区 checkout 成功和应用退出释放 terminal、模型与视图租约；普通视图卸载只释放可丢弃 surface。

[`agent-terminal-view.spec.tsx`](../../tests/unit/presentation/agent-terminal-view.spec.tsx) 证明 Agent 使用共享 snapshot/sequence 视图协议、定向输出、输入、resize 和清理；[`terminal-surface-registry.preserves-workspace-output.spec.ts`](../../tests/unit/presentation/terminal-surface-registry.preserves-workspace-output.spec.ts) 证明共享 registry 的精确 `viewId` 路由；[`agent-terminal-theme-workspaces.e2e.spec.ts`](../../tests/e2e/agent-terminal-theme-workspaces.e2e.spec.ts) 通过真实 Electron、node-pty 和 ANSI 输出证明工作区往返、源主题固定与最终像素明暗。

### Agent attach 失败与重试

空白终端不一定是 xterm 渲染失败。Agent 首次进入工作区时先等待有效 terminal 测量，再由 [`useAgentSessionAttachment.ts`](../../src/presentation/app-shell/useAgentSessionAttachment.ts) 发起 session attach；这两个阶段分别投影为 `measuring` 和 `pending`。attach 拒绝后进入 `failed` 并显示通用重试，不能把错误吞掉后留下一个看似正常的空 surface。

同一工作区的重试是 single-flight。重新启动或新对话 attach 失败时，hook 保留原 terminal binding，输入仍指向原 session；切换作用域会使旧请求失效，迟到结果不能覆盖新工作区。排障时分别记录测量 key、attach operation、session binding 和 workspace generation，避免把 Provider launch 失败、Agent session attach 失败与后续 `AttachView` snapshot 恢复失败混为同一问题。[`agent-console.attach-lifecycle.spec.tsx`](../../tests/unit/presentation/agent-console.attach-lifecycle.spec.tsx) 覆盖失败可见、重复重试、既有 binding 保留和迟到作用域隔离。

## 普通终端的 worktree 重挂载

普通终端的 PTY 和权威屏幕模型由 Run 上下文按完整运行身份持有，React 画布只负责当前工作区的可见投影。工作区切换可以卸载 `TerminalViewport` 并最终销毁 renderer xterm；隐藏期间的 ANSI 解析、滚动历史、终端模式和输出序号继续由主进程模型维护。

普通终端内手动启动的 TUI 可以查询默认颜色并缓存主题判断，但普通终端还存在 renderer 未挂载的隐藏阶段。每个 terminal generation 因此固定创建时的 `terminalSourceTheme`：各平台都由 headless 模型在隐藏时按 canonical palette 回答 terminal query，可见 xterm 接管后使用同一 palette，attach/detach 交接保证两者不会同时响应。Windows 随包 ConPTY DLL 负责把查询交给这条链路；不发查询而直接读取 Win32 attributes 的 Codex 0.148 只在稳定 command shim 内获得 invocation-scoped ConsoleColor bridge，直接 Agent 则使用 foreground `started` 前的既有准备。应用主题变化只通过 source dataset 的统一视觉转换投影，不修改运行中 CLI 已识别的 palette。新 generation 可以采用新的当前主题，恢复的同一 generation 必须沿用 checkpoint record 中的原主题。

普通终端必须保持以下恢复顺序：

1. 每次可见挂载创建新的 xterm 和唯一 `viewId`，并在请求 snapshot 前注册 surface，使较早到达的 live output 可以进入临时队列。
2. 主进程 attach 先暂停 PTY 输出、排空模型写入并生成带 `RestoreMarker` 的 snapshot，再把 terminal query 响应权交给当前视图并恢复 PTY 输出。
3. renderer 先按 snapshot 原始行列 reset 和 replay，再丢弃不大于 snapshot sequence 的事件，只接续严格连续的后续输出，最后按当前可见容器重新 fit。
4. 恢复队列上限为 1 MiB；sequence 缺口或溢出触发新的 attach，恢复重试有界，不能继续无界累计。
5. worktree 切走时先从 DOM detach，但在主进程确认响应权已经交回隐藏模型前暂不 dispose xterm；确认后释放 surface。该动作不终止 PTY，也不撤销自然退出模型的进程内恢复资格。
6. session replacement、显式终止、终端删除、工作区归档、项目移除、默认工作区 checkout 成功和应用退出必须释放对应 PTY、模型、视图租约和缓冲。

隐藏普通终端不再持续接收逐字节 IPC 输出。PTY 输出通过当前运行身份检查后只进入主进程模型一次；可见视图取得定向租约后才接收带 sequence 的低延迟事件。各平台隐藏时由模型响应 terminal query、可见时由 renderer xterm 响应，attach/detach 使用 PTY pause、模型 flush 和确认后销毁，保证同一查询不会由两端重复响应；Windows 随包 ConPTY DLL 保留这类查询。Agent foreground 与普通 Codex shim 的 ConsoleColor bridge 只改变同一 Console 的短期 Win32 probe 事实，私有输出 gate 在这条唯一输出流进入模型前消费 host 控制 span，不建立第二套响应权。

8192 字符尾部仍用于无障碍文本、诊断和非 xterm 回退，不是屏幕恢复来源。新 snapshot 额外提供由模型 buffer 导出的有界 transcript，表现层可以用它更新无障碍投影；不得把裁剪后的文本重新送入 xterm parser。

重挂载完成后的 `fit` 可能立即产生 resize。Presentation 必须保留完整运行身份；主进程对已退出 session 的 resize 幂等返回该快照，renderer 随即收敛为 `exited`。退出事件先于启动响应时也必须先建立终态投影，避免迟到的启动 Promise 把旧 PTY 重新标成运行中。

xterm 6 的用户滚动由 `.xterm-scrollable-element` 和内部 scroll model 承担；`.xterm-viewport` 不再是可用 `scrollTop` 判断历史是否存在的原生滚动容器。自动化验证优先使用 xterm 支持的 `Shift+PageUp` 用户交互和可见行结果，不得用旧 DOM 元素的 `scrollHeight` 作为 buffer oracle。

[`terminal-surface-registry.preserves-workspace-output.spec.ts`](../../tests/unit/presentation/terminal-surface-registry.preserves-workspace-output.spec.ts) 证明精确 `viewId` 路由和每次挂载创建新 surface；[`terminal-viewport.interaction.spec.tsx`](../../tests/unit/presentation/terminal-viewport.interaction.spec.tsx) 证明 snapshot 优先、sequence 缺口恢复、1 MiB 队列上限和 detach 确认后销毁；[`run.headless-terminal-model.spec.ts`](../../tests/integration/contexts/run/run.headless-terminal-model.spec.ts) 证明 ANSI、alternate buffer、模式、query 所有权和模型背压；[`run.foreground-job-shell-control.spec.ts`](../../tests/unit/contexts/run/run.foreground-job-shell-control.spec.ts) 证明 Windows Agent launch script 在 started 前选择正确 ConsoleColor；[`run.terminal-private-output-control.spec.ts`](../../tests/unit/contexts/run/run.terminal-private-output-control.spec.ts) 与 [`run.node-pty-private-output-control.spec.ts`](../../tests/unit/contexts/run/run.node-pty-private-output-control.spec.ts) 证明普通终端 private span 跨 chunk 过滤、错误 token 透传、私有环境原子激活和 Provider ANSI 保留；[`agent.terminal-activity-windows-command-shim.spec.ts`](../../tests/integration/contexts/agent/agent.terminal-activity-windows-command-shim.spec.ts) 在原生 Windows 中证明 light/dark Codex probe、非零退出、`Ctrl+C`、ConsoleColor 恢复和 shell 可写；[`run.windows-agent-pty.spec.ts`](../../tests/integration/contexts/run/run.windows-agent-pty.spec.ts) 继续证明随包 ConPTY 保留 mouse mode 与直接 Agent fallback；[`git-branch-workspaces.e2e.spec.ts`](../../tests/e2e/git-branch-workspaces.e2e.spec.ts) 使用真实 Electron、node-pty、IPC、xterm 和超过 8192 字符的确定性输出，证明 worktree 往返后创建新 surface、保持同一 session、恢复隐藏输出与早期 scrollback，并且可见和隐藏查询都只收到一次响应。

## 普通终端的 Unicode 与 renderer 降级

普通终端的主进程 headless 模型和 renderer xterm 都加载 Unicode 11 addon，并把 active version 固定为 `11`。xterm 的 Unicode API 属于 proposed API，因此两端构造终端时都必须显式启用 `allowProposedApi`；只在一端加载 addon 会让隐藏解析、snapshot 恢复和可见字宽采用不同规则。

可见 surface 在 `open` 之后异步尝试加载 WebGL addon，内置 DOM renderer 始终是可用基线：

1. addon 加载失败时直接保持 DOM renderer，不中断 attach、输入或恢复。
2. WebGL context loss 时立即 dispose addon、把 renderer 状态切回 `dom`，并 refresh 当前行区间。
3. 降级不得 reset xterm、重新 attach view、替换 session、重放 snapshot 或清空搜索和粘贴状态。
4. surface 使用 `data-terminal-renderer` 暴露当前 `dom` / `webgl` 状态，并在异步 addon 激活完成后把 `data-terminal-renderer-ready` 置为 `true`；registry 诊断同时统计两类 surface，便于测试和故障定位。

React Flow 放大节点时，不能长期把原始 WebGL backing store 交给 compositor 插值，也不能在每个缩放手势帧里重新分配 canvas。当前 surface 使用两阶段策略：手势期间只更新外层 transform；视口停稳后，根据画布 zoom 选择 `1`、`1.25`、`1.5`、`1.75` 的离散 raster scale，再在浏览器 idle slice 中逐个重建可见终端。焦点终端优先，未聚焦但可见的终端随后处理；离开 viewport 或被 parked 样式隐藏的终端回到 `1x`。调度器按 backing pixels 使用窗口级硬预算，并对同优先级终端逐级公平分配倍率，避免多个大终端同时抢占 GPU 内存。

额外 raster scale 只能影响 device backing geometry 和 glyph atlas，CSS canvas、CSS cell、FitAddon 与 PTY 行列仍由真实 browser DPR 决定。倍率切换会清空 WebGL canvas 和 render model，因此 resize 后必须无条件请求完整 viewport redraw，不能等待下一段 PTY 输出、光标闪烁或 ResizeObserver 偶然触发恢复。倍率提交是事务式的：重建失败时恢复上一倍率并允许有界重试；连续失败后回到 `1x`，不能让失败倍率成为同值重试的 no-op。

这项能力通过 `pnpm-workspace.yaml` 中的精确版本 `patchedDependencies` 修补 `@xterm/addon-webgl`。包的 CommonJS main、ESM module 和类型声明必须同时暴露相同契约；入口契约测试负责防止构建器切换入口后静默退回未修补实现。升级 addon 时应先确认上游能力和实际 bundle 入口，再重建或删除本地补丁。

idle 调度同样属于正确性边界。`setRasterScale` 不在缩放事件或 animation frame 回调内执行；每个可用 idle slice 最多处理一个 surface，并为焦点任务设置较短 timeout、普通可见任务设置较长 timeout。这样 resize 清空发生在已经完成的 paint 之后，其请求的完整 redraw 可以在下一次 paint 前运行，既避免交互卡顿，也避免把空 backing store 呈现成一帧白屏。

终端搜索是 xterm buffer 上的局部投影。snapshot restore 会 reset 可见终端，因此 restore 完成后必须用当前查询重新建立匹配；关闭搜索则清除 decorations 并恢复终端焦点。粘贴进度、确认和链接反馈是 React 局部覆盖层，不得改变 xterm 网格或拦截无关终端输入。

验证 renderer 改动时至少覆盖中文、emoji、组合字符、搜索命中、context loss 后的可见输出，以及降级后的 PTY 粘贴。真实 GPU/context 和 xterm 输入链路由 [`terminal-daily-interactions.e2e.spec.ts`](../../tests/e2e/terminal-daily-interactions.e2e.spec.ts) 证明；[`agent-codex-session.e2e.spec.ts`](../../tests/e2e/agent-codex-session.e2e.spec.ts) 进一步证明共享修复经过 Agent attach 生命周期后仍保持可见；渲染选择与释放分支由 [`terminal-renderer-controller.spec.ts`](../../tests/unit/presentation/terminal-renderer-controller.spec.ts) 覆盖。

## 画布缩放下的鼠标坐标

xterm 6.0.0 的鼠标坐标换算使用 `getBoundingClientRect()` 取得元素左上角，再直接用未缩放的 cell 宽高换算列和行。React Flow 在祖先元素上应用 `translate(...) scale(zoom)` 后，`clientX - rect.left` 与 `clientY - rect.top` 已经是缩放后的屏幕距离，而 cell 尺寸仍是布局坐标。两套单位混用会让选区、链接命中、自动滚动和开启鼠标协议的 TUI 一起偏移；缩放越偏离 100%，误差越明显。

当前项目通过 `pnpm-workspace.yaml` 中的精确版本 `patchedDependencies` 修补 `@xterm/xterm@6.0.0`。公共换算入口先恢复本地坐标：

```txt
scaleX = rect.width / element.offsetWidth
scaleY = rect.height / element.offsetHeight

localX = (clientX - rect.left) / scaleX - leftPadding
localY = (clientY - rect.top) / scaleY - topPadding
```

这里必须先逆缩放，再减去以布局像素表示的 xterm padding。补丁修改可读源码和当前 Vite renderer 实际加载的 ESM 产物；项目没有加载 CommonJS 产物，因此不复制一份巨大的单行 bundle 补丁。依赖入口或打包方式改变时，必须重新核对这个假设。

该换算支持当前 React Flow 使用的正向、轴对齐 `translate + scale`，并在 100% 缩放下保持等价；它不承诺支持旋转、倾斜或负缩放。补丁只修复指针坐标，不改变 FitAddon、PTY 行列、文本 reflow 或 session 生命周期。上游跟踪见 [xterm.js #6023](https://github.com/xtermjs/xterm.js/issues/6023)；升级 xterm 时应先检查上游是否已修复，再删除本地补丁并运行完整缩放回归。

## 关键证据

下面的数据来自本次 macOS、Electron、xterm DOM renderer 环境，用于说明证据链，不是跨平台阈值：

| 检查项                          |                 修复前 |                 修复后/验收值 | 说明                                     |
| ------------------------------- | ---------------------: | ----------------------------: | ---------------------------------------- |
| PTY 首次 attach                 | 可能使用默认 `88 x 24` | 使用当前 xterm 首次有效实测值 | 避免启动阶段网格不一致                   |
| viewport 相对终端外框右侧 inset |                 `10px` |    `0px`，自动化容差 `<= 1px` | 证明滚动条真正贴边，而非只在内层容器贴边 |
| 连续 32 个 `，` 的平均宽度      |             `6.1875px` |       与单字符差值 `<= 0.1px` | 修复前被上下文压缩                       |
| 单个 `，` 的宽度                |                 `12px` |            与连续样本保持一致 | 终端双宽 cell 的测量必须稳定             |
| 最后字形相对行右边界            | 曾正向溢出约 `11.69px` |                      `-7.8px` | 负数表示字形安全落在行内                 |
| 水平溢出                        |               可见裁剪 |                         `0px` | 最终 Electron 几何检查                   |

最有价值的转折点是：DOM 行文本完整，但最后一个 span 的 `right` 大于所在 `.xterm-rows > div` 的 `right`。这直接证明问题是可见裁剪，而不是终端输出丢失。

## 推荐实现不变量

Agent 控制台与普通终端共享 Run 视图不变量；Agent 额外维护首次预测量、固定 Provider 和 launch 不替换 terminal 的语义。

1. PTY 首次 attach 使用当前可见 xterm 的首次有效行列，不使用占位尺寸抢跑。
2. 当前 xterm 的最新有效行列最终会到达对应 session 的 `resize`；允许 RAF 合并不需要落地的中间值。
3. 相同行列不会重复 attach 或重复 resize。
4. attach 期间发生的最新 resize 不会丢失。
5. 切换项目、工作区、Git 分支或 Agent 后，旧异步结果不会污染新 surface。
6. 字符宽度不受相邻全角标点的上下文影响。
7. 文字内边距与滚动条轨道分层，滚动条相对终端内容外框贴右。
8. 行内最后一个可见字形不超过行右边界，终端没有水平溢出。
9. 主题切换、节点 resize 和画布非 100% 缩放不会重建 session，也不会重新引入裁剪。
10. 画布缩小、100% 和放大时，指针命中的选区字符与 TUI cell 都保持一致，交互不会拖动画布或节点。
11. 同一 Agent terminal 的终端源主题在运行期间保持不变；工作区往返可以创建新 surface，但必须从同一 Run 模型恢复 canonical palette、snapshot 和连续 sequence。
12. 未过滤 wrapper 承载当前主题背景和上/左/下阅读留白，mismatch filter 只作用于源主题 direct viewport；两者最终颜色连续，第一方覆盖层位于被过滤子树之外。

## 排障流程

### 第一步：用足够内容稳定复现

空终端只能验证 viewport 和 scrollbar track 的容器几何，不能视觉验证可见 thumb；短英文也无法验证 CJK cell。完整复现样本至少应包含：

- 足以产生垂直 scrollback 的多行输出。
- 会在右边界附近换行的中文。
- 连续的全角逗号、句号、括号等标点。
- ASCII、CJK 和 ANSI 颜色混排。
- 浅色、深色主题，以及至少一个非 100% 的 React Flow 缩放比例。

记录 Agent 节点的像素大小、画布缩放、系统字体和 Electron 版本。无法复现时不要先改 padding。

### 第二步：区分数据丢失和像素裁剪

在 Electron DevTools 中检查目标行：

```js
const row = [...document.querySelectorAll('.xterm-rows > div')].find((element) =>
  element.textContent?.includes('要检查的末尾文本')
)
const lastSpan = row?.lastElementChild

console.table({
  text: row?.textContent,
  rowRight: row?.getBoundingClientRect().right,
  glyphRight: lastSpan?.getBoundingClientRect().right,
  overflow:
    row && lastSpan
      ? lastSpan.getBoundingClientRect().right - row.getBoundingClientRect().right
      : null
})
```

判断方式：

- `textContent` 本身缺失：优先检查 PTY 输出、ANSI 解析、buffer 和行列同步。
- `textContent` 完整且 `overflow > 0`：优先检查 DOM 字宽、letter-spacing、缩放和裁剪。
- 几何不溢出但截图仍异常：继续检查字体 fallback、合字、GPU/DOM renderer 差异和设备像素比。

### 第三步：测量外层几何，不只看 xterm 内部

```js
const viewport = document.querySelector('.agent-terminal-viewport')
const shell = viewport?.closest('.agent-console__terminal-shell')
const scrollbar = viewport?.querySelector('.xterm-viewport')

console.table({
  terminalRightInset:
    shell && viewport
      ? shell.getBoundingClientRect().right - viewport.getBoundingClientRect().right
      : null,
  scrollbarRightInset:
    shell && scrollbar
      ? shell.getBoundingClientRect().right - scrollbar.getBoundingClientRect().right
      : null
})
```

如果只比较 `.xterm` 和 `.xterm-viewport`，两者可能都是“0 inset”，但它们共同的父元素仍然有 10px padding。验收必须选择用户视觉上认为的外框作为坐标基准。

### 第四步：比较单字符和重复字符的宽度

使用与 `.xterm-rows` 相同的字体属性，把测量节点放进 xterm helper 容器：

```js
const terminal = document.querySelector('.agent-terminal-viewport')
const helper = terminal?.querySelector('.xterm-helpers')
const rows = terminal?.querySelector('.xterm-rows')
const style = rows && getComputedStyle(rows)

function measure(text) {
  const sample = document.createElement('span')
  sample.textContent = text
  sample.style.cssText = `
    display: inline-block;
    position: absolute;
    visibility: hidden;
    white-space: pre;
    font-family: ${style.fontFamily};
    font-size: ${style.fontSize};
    font-weight: ${style.fontWeight};
    font-kerning: none;
  `
  helper.append(sample)
  const width = sample.offsetWidth
  sample.remove()
  return width
}

console.table({
  single: measure('，'),
  repeatedAverage: measure('，'.repeat(32)) / 32
})
```

两者出现明显差异时，问题已经超出“给右边留点空间”的范畴。继续检查 `text-spacing-trim`、`text-autospace`、字体 fallback、font-feature-settings 和 renderer。

### 第五步：核对 PTY 生命周期

至少观察以下事件序列：

```txt
xterm open
  -> first fit
  -> first valid onResize / dimensions report
  -> attachAgentSession(columns, rows)
  -> optional later resizeAgentSession(columns, rows)
```

异常序列包括：

- `attachAgentSession(88, 24)` 发生在首次有效 fit 前。
- 一次容器 resize 触发新的 attach，而不是复用 session 并 resize。
- attach Promise pending 时发生 resize，Promise 完成后没有补发最新行列。
- 工作区已经切换，旧 session 返回后仍成为 `sessionRef.current`。

### 第六步：分别验证屏幕坐标和 cell 坐标

不要只在 100% 缩放下拖选一段大致文本。准备带有前后保护字符的 ASCII 行，在小于 100%、100% 和大于 100% 三种缩放下按可见字形边界拖选，并断言复制结果完全相等。保护字符能暴露一列左右的偏移，节点位置与 React Flow viewport transform 则应在拖选前后保持不变。

终端应用若开启 SGR mouse 等鼠标协议，还要运行一个确定性的 TUI fixture，记录 PTY 实际收到的按下、移动和抬起 cell。选区与鼠标协议共用 xterm 坐标入口，但二者都通过真实 Electron 才能证明浏览器 transform、DOM 几何和 xterm 换算已经对齐。

## 无效或不完整的修复

### 只增加右侧安全区域

它可以暂时隐藏一个特定宽度下的最后字符，却会移动滚动条、减少列数并改变换行点。字宽模型仍然错误，换一个节点尺寸或缩放比例就会复发。

### 只修改滚动条宽度和圆角

这能改善视觉，但不能改变 PTY 行列，也不能修复 glyph overflow。滚动条应在几何根因明确后单独处理。

### 只断言终端文本连续

xterm buffer 和 DOM 中存在字符，不代表字形没有被 `.xterm-rows > div` 裁掉。必须同时测量最后 span 与行边界，或检查真实截图。

### 只比较 xterm 内层元素

内层 viewport 贴住 xterm，不代表它贴住用户看到的终端外框。外层 padding 是这次滚动条 inset 被遗漏的直接原因。

### 只阻止 React Flow 拖拽

`nodrag`、`nopan`、`nowheel` 可以阻止终端手势被画布接管，是选区交互的必要边界，但不会修正 xterm 内部的坐标单位。若缩放后仍用屏幕距离除以未缩放 cell 尺寸，节点不再移动，选中的字符和 TUI 收到的 cell 仍然会偏移。

### 在空终端上截图

没有 scrollback 时滚动条 thumb 不可见，无法证明它是否贴边；没有边界处 CJK 文本时也无法证明字符裁剪已经消失。

### 先尝试 renderer 开关

xterm 提供过针对重叠字形和不同 renderer 的能力，但不能代替证据。若单字符与重复全角标点的浏览器测量已经不一致，应先修复当前 DOM renderer 的 CSS 度量模型，再评估更换 renderer 的收益和兼容性。xterm 的相关测量演进可参考 [#4366](https://github.com/xtermjs/xterm.js/pull/4366)、[#4929](https://github.com/xtermjs/xterm.js/pull/4929) 和 [#4997](https://github.com/xtermjs/xterm.js/pull/4997)。

## 测试分层

这类缺陷不能只靠一种测试证明。

### Unit：证明异步生命周期

[agent-terminal-view.spec.tsx](../../tests/unit/presentation/agent-terminal-view.spec.tsx) 覆盖共享视图的尺寸、输入和恢复协议；[agent-console.terminal-sizing.spec.tsx](../../tests/unit/presentation/agent-console.terminal-sizing.spec.tsx) 覆盖首次 attach 期间的尺寸生命周期，[agent-console.attach-lifecycle.spec.tsx](../../tests/unit/presentation/agent-console.attach-lifecycle.spec.tsx) 覆盖失败与重试：

- 首次有效测量前不 attach。
- attach pending 期间的新尺寸会在 session 返回后同步。
- 重复 fit 不会重复 attach 或重复 resize。
- 旧工作区迟到的 attach 结果不会绑定到当前 surface。
- attach 失败保持可见，重复重试 single-flight，替代 attach 失败保留原 binding。

这些行为可以用 fake xterm、受控 `ResizeObserver` 和 deferred Promise 稳定证明，不应下放到高成本 E2E。

### 其余 Unit、Integration 和 Contract：证明边界传递

- [agent.session-service.spec.ts](../../tests/unit/contexts/agent/agent.session-service.spec.ts) 证明应用服务会把 session resize 转发给已经绑定的 PTY。
- [run.terminal-capability-environment.spec.ts](../../tests/unit/contexts/run/run.terminal-capability-environment.spec.ts) 证明保留环境键、source-theme `COLORFGBG` 和 `NO_COLOR` 透传策略；[run.pty-terminal.spec.ts](../../tests/integration/contexts/run/run.pty-terminal.spec.ts) 再以真实 POSIX PTY 证明普通启动与 foreground launch 都收到同一 profile。
- [run.terminal-provider-private-output-control.spec.ts](../../tests/integration/contexts/run/run.terminal-provider-private-output-control.spec.ts) 与 [run.terminal-private-output-control.spec.ts](../../tests/contract/contexts/run/run.terminal-private-output-control.spec.ts) 证明 private descriptor 独立于公开 process environment 跨本地 Provider 协议透传；旧 adapter 忽略 descriptor 时不会把私有环境注入 shell。
- [run.terminal-source-palette.spec.ts](../../tests/unit/contexts/run/run.terminal-source-palette.spec.ts)、[terminal-theme.palette.spec.ts](../../tests/unit/presentation/terminal-theme.palette.spec.ts) 和 [check-theme.spec.ts](../../tests/unit/support/check-theme.spec.ts) 分别证明隐藏 OSC、renderer xterm 与生成门禁共用 canonical palette。
- [terminal-theme-projection.spec.tsx](../../tests/unit/presentation/terminal-theme-projection.spec.tsx) 证明 Agent 与普通终端共享由 wrapper 留白和 direct viewport 组成的主题协调边界；[terminal-viewport.interaction.spec.tsx](../../tests/unit/presentation/terminal-viewport.interaction.spec.tsx) 证明普通终端的搜索覆盖层位于投影之外。
- [agent.run-terminal-provider.spec.ts](../../tests/integration/contexts/agent/agent.run-terminal-provider.spec.ts) 使用真实 Run terminal 和本地 fake Provider，证明 Agent CLI 启动、输入输出、`Ctrl+C` 与退出回到 shell。
- [agent.ipc.spec.ts](../../tests/contract/contexts/agent/agent.ipc.spec.ts) 证明 resize 的 `sessionId`、`columns`、`rows` 能正确跨 Electron IPC 边界。
- [RunAgentTerminalRuntimeAdapter.ts](../../src/contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter.ts) 把 Agent 的 attach/resize 端口转交给 Run；[NodePtyTerminalProcessAdapter.ts](../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter.ts) 最终把行列传给 `node-pty.spawn` 和 PTY `resize`。

### Electron E2E：证明真实浏览器几何与终端视觉组合

[workspace-agents.e2e.spec.ts](../../tests/e2e/workspace-agents.e2e.spec.ts) 保留两个低层环境无法可靠证明的回归：

- xterm viewport 和 scrollbar 相对终端外框的右侧 inset 不超过 1px。
- 单个全角标点与重复全角标点的平均宽度差不超过 0.1px。
- 放大画布下 Agent 按可见字形拖选，复制结果精确匹配目标文本，节点和 viewport 不移动。

[run-terminal-sessions.e2e.spec.ts](../../tests/e2e/run-terminal-sessions.e2e.spec.ts) 还覆盖普通终端在默认与缩小画布下的精确选区，以及缩小画布下 SGR mouse 的按下、移动、抬起 cell。这样组合覆盖小于 100%、100% 和大于 100% 三个坐标区间，同时证明普通终端与 Agent 两个 surface。

[agent-terminal-theme-workspaces.e2e.spec.ts](../../tests/e2e/agent-terminal-theme-workspaces.e2e.spec.ts) 使用不同源主题的真实常驻 Agent PTY，在浅色与深色应用主题间往返 main/worktree。它断言每个工作区继续使用原 session 和进程、surface 恢复对应源主题、共享 wrapper 保持无滤镜并且只有 source/target 不一致的 direct viewport 应用滤镜，再以截图中心像素验证用户最终看到的明暗。它还在 Agent 和普通终端切换主题后分别采样内容中心与上、左、下阅读留白，要求每个颜色通道的最大差值不超过 2，直接防止三侧色缝回归。

这里使用 E2E 的理由不是“改动发生在 UI”，而是 jsdom 不执行 Chromium 的真实 CSS Text 排版，也不能可信测量 WebKit scrollbar pseudo-element。

滚动条 E2E 证明的是容器和伪元素几何，不要求测试现场已经出现可见 thumb。足量 scrollback 下的完整观感仍由下一节的真实截图验证。

### 真实截图：证明用户看到的最终结果

自动化断言通过后，仍应运行真实 Electron 并截图。推荐使用临时、确定性的 fake `codex` 可执行文件：

1. 临时脚本输出足量的 CJK、全角标点和 ANSI 内容。
2. 通过本次进程的 `PATH` 让真实 node-pty 启动它，不修改用户全局 Codex 配置。
3. 打开真实 Agent、产生 scrollback、设置目标节点尺寸和画布缩放。
4. 分别截取浅色和深色主题。
5. 实际打开截图，检查最后字形、换行、滚动条和底边；不能只确认“截图命令成功”。
6. 用 DevTools 几何数据复核截图判断，然后清理临时脚本。

截图是最终视觉证据，但不是唯一证据。它必须与可重复的几何断言和生命周期测试组合使用。

## 修改后的最小验证清单

每次改动终端尺寸或渲染逻辑后，至少检查：

- [ ] 首次 attach 的 `columns`、`rows` 等于当前 xterm 实测值。
- [ ] resize 不创建第二个 PTY，重复尺寸不重复发送。
- [ ] attach pending 和快速切换工作区都不会产生旧 session 污染。
- [ ] attach 失败可见且可重试；替代 attach 失败不丢失原 terminal binding。
- [ ] 子进程收到 Run 保留的 `TERM`、`COLORTERM`、`TERM_PROGRAM` 和 source-theme `COLORFGBG`，并保留明确的 `NO_COLOR`。
- [ ] 修改终端色板后重新生成 palette，隐藏 OSC 与可见 xterm 使用同一份生成值，`pnpm check:theme` 通过。
- [ ] 当前主题背景和阅读留白由未过滤 wrapper 承载，mismatch filter 只作用于 direct viewport；两者最终颜色连续，第一方覆盖层位于被过滤子树之外。
- [ ] 主题切换后内容中心与上、左、下留白处于同一视觉平面，没有三侧异色带。
- [ ] 足量 scrollback 下滚动条贴住用户看到的右侧外框。
- [ ] 单个与重复 `，。！？（）【】` 的宽度保持稳定。
- [ ] DOM 行尾文本完整，最后字形 `right <= row.right`。
- [ ] 没有水平 overflow，也没有底部黑边。
- [ ] 浅色、深色和非 100% 画布缩放均检查。
- [ ] 小于 100%、100% 和大于 100% 下，精确拖选不会多选或漏选保护字符。
- [ ] 开启鼠标协议后，PTY 收到的按下、移动和抬起 cell 与可见指针位置一致。
- [ ] 终端选区前后节点位置和画布 transform 不变。
- [ ] 截图已经由人实际打开查看。
- [ ] 按 [开发协作规范](../engineering/development.md) 和 [测试规范](../testing/testing.md) 运行对应目标测试与最终门禁。

## 外部参考

- [xterm.js Addons 使用指南](https://xtermjs.org/docs/guides/using-addons/)：`FitAddon` 等 addon 的标准装载方式。
- [xterm.js Terminal API](https://xtermjs.org/docs/api/terminal/classes/terminal/)：`onResize`、`open`、`rows`、`cols` 等终端生命周期接口。
- [node-pty](https://github.com/microsoft/node-pty)：PTY 启动与 resize 的基础设施能力。
- [CSS Text Module Level 4：`text-spacing-trim`](https://www.w3.org/TR/css-text-4/#text-spacing-trim-property)：全角标点上下文间距的规范来源。
- [xterm.js #6023](https://github.com/xtermjs/xterm.js/issues/6023)：祖先 CSS transform 导致鼠标坐标偏移的上游跟踪。
- [pnpm：Patch dependencies](https://pnpm.io/cli/patch)：生成和维护精确依赖补丁的官方流程。
