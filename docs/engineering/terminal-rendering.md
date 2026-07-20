# xterm、PTY 与 CJK 终端渲染排障指南

## 文档地位

本文沉淀 cleancode 中 xterm、PTY 行列同步、终端滚动条和 CJK 字符裁剪问题的工程经验。它用于帮助开发者定位和验证终端渲染缺陷，不重新定义产品语义、架构边界或测试规则。

本文记录的具体选择属于当前技术栈下的实现与排障方式；Electron、xterm.js 和 node-pty 的当前采用情况由 [技术栈说明](tech-stack.md) 维护。若依赖版本或渲染器变化，必须重新测量，不得把本文中的一次观测值当成永久常量。

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

## 本次缺陷的三个根因

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

当前实现位于 [AgentConsole.tsx](../../src/presentation/app-shell/AgentConsole.tsx) 和 [agentTerminalXterm.ts](../../src/presentation/app-shell/agentTerminalXterm.ts)。表现层拥有“当前可见网格多大”这个事实；Agent 应用层和 node-pty 只消费 attach/resize 命令，不反向猜测 UI 尺寸。

### 2. 右侧 padding 把滚动条整体推向左边

旧样式把 `9px 10px` padding 直接放在承载 xterm 的元素上。xterm 的 viewport 和滚动条即使在自身容器内完全靠右，相对 Agent 终端外框仍然会保留 10px 右侧空隙。

给右边继续增加“安全区域”只会：

- 让滚动条离外框更远。
- 减少可用于 cell 的宽度，改变列数和换行点。
- 掩盖真正的字宽或 PTY 尺寸问题。

当前做法把文字留白和滚动条几何分开：

```css
.agent-terminal-frame {
  padding: 9px 0 9px 10px;
}

.agent-terminal-viewport {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

左、上、下仍保留阅读留白，xterm viewport 则在右侧 full-bleed。滚动条 track 和 viewport 使用透明背景，避免它们自身形成实色底边。对应样式位于 [agent-console.css](../../src/presentation/app-shell/styles/agent-console.css)。

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

## Agent 会话源主题与重挂载

Codex 等 TUI 可以通过终端协议查询背景色，并据此输出真彩色背景、composer 和状态区域。因此，“当前应用想显示的主题”和“仍在运行的 PTY 已经采用的源 palette”是两个不同事实。主题切换只改变前者，不得假定子进程会同步改变后者。

Agent 运行时在首次附加时固定 `terminalSourceTheme`。同一作用域再次附加时，renderer 发送当前有效主题作为新运行时提议，应用层则为已存在的 PTY 返回原有 canonical source。该值不进入 Agent 持久化 schema；应用重启或显式新对话产生的新运行时可以采用新的当前主题。

工作区导航不得重建 Agent 的 xterm surface。Presentation 使用 `projectId + workspaceName + agentId` 持有独立 surface registry：离开工作区时只 detach xterm 根 DOM，保留 terminal、parser、屏幕缓冲和 scrollback；隐藏期间到达的 PTY 输出仍按 `sessionId` 直接写入该 surface；返回时把同一 DOM 挂到新 host 并重新 fit、refresh，不 reset，也不 replay 输出尾部。

8192 字符尾部只用于无障碍文本、诊断和非 xterm 回退，不是 TUI 屏幕恢复来源。任意字符截断都可能落在 CSI、OSC 或 UTF-8 序列中，把 `2m`、`H` 等控制序列残片显示为普通文本。首次绑定尚未完成的短暂竞态必须保存完整 PTY 事件块，绑定后按原顺序写入；不得先裁剪再交给 parser。

只有真实 session replacement 才重置已有 surface，并必须遵守以下顺序：

1. 等待 xterm FIFO 中已经排队的 write 完成；连续 replacement 使用 generation，只允许最新请求提交。
2. 从集中主题 token 读取 canonical source 的完整 palette，并同时设置 surface 的 source dataset。
3. reset xterm，原子提交新 `sessionId` 绑定，再读取绑定前的完整启动输出；之后到达的 live output 直接进入新绑定。
4. Agent 删除、工作区归档、项目移除、默认工作区 checkout 成功和应用退出释放对应 surface；普通工作区导航不得释放。

这一顺序避免旧 write 跨过 reset、旧 OSC 查询响应被送往新 session，以及工作区快速往返时迟到的 replacement 覆盖当前 surface。主题差异由 source dataset 上的统一滤镜完成，不重启 PTY，也不改写原始 ANSI 输出。[`agent-terminal-surface-registry.spec.ts`](../../tests/unit/presentation/agent-terminal-surface-registry.spec.ts) 证明隐藏期间完整输出路由、绑定前完整事件块和生命周期清理；[`agent-console.terminal.spec.tsx`](../../tests/unit/presentation/agent-console.terminal.spec.tsx) 证明工作区往返复用同一 xterm 且不 reset；[`agent-console.terminal-generation.spec.tsx`](../../tests/unit/presentation/agent-console.terminal-generation.spec.tsx) 验证 FIFO 与 generation；[`agent-terminal-theme-workspaces.e2e.spec.ts`](../../tests/e2e/agent-terminal-theme-workspaces.e2e.spec.ts) 通过真实 Electron、node-pty 和超过 8192 字符的 ANSI 输出，证明工作区往返期间 surface/session/进程复用、源主题固定、无控制序列残片以及最终像素明暗。

## 普通终端的 worktree 重挂载

普通终端的 PTY 由 Run 上下文按工作区持有，React 画布只负责当前工作区的可见投影。工作区切换会卸载当前 `TerminalViewport`；如果组件卸载同时调用 `xterm.dispose()`，PTY 虽然仍然运行，xterm 的 parser 状态、滚动缓冲和 DOM surface 却会消失。返回工作区时只用表现层的 8192 字符输出尾部创建新 xterm，就会表现为较早内容“丢失”，并且无法完整恢复 ANSI 状态。

普通终端必须使用表现层 surface registry 保持以下不变量：

1. registry key 使用完整的 `projectId + workspaceName + blockId + sessionId + runId + generation`，不得只按 block 或 session 的局部身份路由。
2. 首次附加创建一个 xterm surface，配置 `scrollback: 1000`；worktree 切走时只把 xterm 根 DOM 从旧 host detach，不 dispose terminal，切回时把同一 DOM 重新挂到新 host 并重新 fit、refresh。
3. 当前与隐藏工作区的终端输出都按完整运行身份直接写入对应 surface；8192 字符尾部仍保留为启动竞态、无障碍文本和非 xterm 回退，不作为滚动历史的事实来源，也不得在重挂载时重复 replay 到已有 surface。
4. session replacement、终端删除、工作区归档、项目移除、默认工作区 checkout 成功和应用退出必须释放失效 surface。普通 worktree 导航本身不得触发清理。
5. Agent console 使用独立但同样保留 parser 状态的 surface registry，并继续遵守自己的 PTY、主题和 generation 协议，不进入普通终端 registry。

重挂载完成后的 `fit` 可能立即产生 resize。Presentation 必须先保留完整运行身份，并在重新进入工作区时批量向 Run 查询缓存 session 的权威快照；主进程对已退出 session 的 resize 幂等返回该快照，renderer 随即收敛为 `exited`。退出事件先于启动响应时也必须先建立终态投影，避免迟到的启动 Promise 把旧 PTY 重新标成运行中。

xterm 6 的用户滚动由 `.xterm-scrollable-element` 和内部 scroll model 承担；`.xterm-viewport` 不再是可用 `scrollTop` 判断历史是否存在的原生滚动容器。自动化验证优先使用 xterm 支持的 `Shift+PageUp` 用户交互和可见行结果，不得用旧 DOM 元素的 `scrollHeight` 作为 buffer oracle。

[`terminal-surface-registry.preserves-workspace-output.spec.ts`](../../tests/unit/presentation/terminal-surface-registry.preserves-workspace-output.spec.ts) 证明精确身份路由、detach/reattach 与有界清理；[`terminal-session-state-retention.cleans-surfaces.spec.ts`](../../tests/unit/presentation/terminal-session-state-retention.cleans-surfaces.spec.ts) 证明工作区和积木生命周期投影清理；[`git-branch-workspaces.e2e.spec.ts`](../../tests/e2e/git-branch-workspaces.e2e.spec.ts) 使用真实 Electron、node-pty 和超过 8192 字符的确定性输出，证明同一 surface 在 worktree 往返后保留、隐藏期间输出可见且早期 scrollback 仍可访问。

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

Agent 控制台当前应维护以下不变量。普通终端可以复用排查模型，但必须根据自己的 session identity、restart 和 group 流程建立对应不变量，不能直接套用 Agent 的 workspace-key attach 模型。

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
11. 同一 Agent PTY 的终端源主题在运行期间保持不变；工作区往返复用同一 surface，真实 session replacement 才恢复 canonical palette、reset 并重新绑定。

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

[agent-console.terminal-sizing.spec.tsx](../../tests/unit/presentation/agent-console.terminal-sizing.spec.tsx) 覆盖：

- 首次有效测量前不 attach。
- attach pending 期间的新尺寸会在 session 返回后同步。
- 重复 fit 不会重复 attach 或重复 resize。
- 旧工作区迟到的 attach 结果不会绑定到当前 surface。

这些行为可以用 fake xterm、受控 `ResizeObserver` 和 deferred Promise 稳定证明，不应下放到高成本 E2E。

### 其余 Unit、Integration 和 Contract：证明边界传递

- [agent.session-service.spec.ts](../../tests/unit/contexts/agent/agent.session-service.spec.ts) 证明应用服务会把 session resize 转发给已经绑定的 PTY。
- [agent.codex-pty-process.spec.ts](../../tests/integration/contexts/agent/agent.codex-pty-process.spec.ts) 使用真实 node-pty 和本地 fake Codex 进程，证明 Agent PTY 适配器能够启动并传递输入输出。
- [agent.ipc.spec.ts](../../tests/contract/contexts/agent/agent.ipc.spec.ts) 证明 resize 的 `sessionId`、`columns`、`rows` 能正确跨 Electron IPC 边界。
- [NodePtyCodexAgentProcessAdapter.ts](../../src/contexts/agent/infrastructure/pty/NodePtyCodexAgentProcessAdapter.ts) 最终把 attach 行列传给 `node-pty.spawn`，并把 resize 转成 PTY 的 `resize(columns, rows)`。

### Electron E2E：证明真实浏览器几何与终端视觉组合

[workspace-agents.e2e.spec.ts](../../tests/e2e/workspace-agents.e2e.spec.ts) 保留两个低层环境无法可靠证明的回归：

- xterm viewport 和 scrollbar 相对终端外框的右侧 inset 不超过 1px。
- 单个全角标点与重复全角标点的平均宽度差不超过 0.1px。
- 放大画布下 Agent 按可见字形拖选，复制结果精确匹配目标文本，节点和 viewport 不移动。

[run-terminal-sessions.e2e.spec.ts](../../tests/e2e/run-terminal-sessions.e2e.spec.ts) 还覆盖普通终端在默认与缩小画布下的精确选区，以及缩小画布下 SGR mouse 的按下、移动、抬起 cell。这样组合覆盖小于 100%、100% 和大于 100% 三个坐标区间，同时证明普通终端与 Agent 两个 surface。

[agent-terminal-theme-workspaces.e2e.spec.ts](../../tests/e2e/agent-terminal-theme-workspaces.e2e.spec.ts) 使用两个不同源主题的真实常驻 Agent PTY，在浅色与深色应用主题间往返 main/worktree。它断言每个工作区继续使用原 session 和进程、surface 恢复对应源主题、跨主题滤镜方向正确，并以截图中心像素验证用户最终看到的明暗。

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
- [ ] 足量 scrollback 下滚动条贴住用户看到的右侧外框。
- [ ] 单个与重复 `，。！？（）【】` 的宽度保持稳定。
- [ ] DOM 行尾文本完整，最后字形 `right <= row.right`。
- [ ] 没有水平 overflow，也没有底部黑边。
- [ ] 浅色、深色和非 100% 画布缩放均检查。
- [ ] 小于 100%、100% 和大于 100% 下，精确拖选不会多选或漏选保护字符。
- [ ] 开启鼠标协议后，PTY 收到的按下、移动和抬起 cell 与可见指针位置一致。
- [ ] 终端选区前后节点位置和画布 transform 不变。
- [ ] 截图已经由人实际打开查看。
- [ ] 按 [开发协作规范](development.md) 和 [测试规范](../testing/testing.md) 运行对应目标测试与最终门禁。

## 外部参考

- [xterm.js Addons 使用指南](https://xtermjs.org/docs/guides/using-addons/)：`FitAddon` 等 addon 的标准装载方式。
- [xterm.js Terminal API](https://xtermjs.org/docs/api/terminal/classes/terminal/)：`onResize`、`open`、`rows`、`cols` 等终端生命周期接口。
- [node-pty](https://github.com/microsoft/node-pty)：PTY 启动与 resize 的基础设施能力。
- [CSS Text Module Level 4：`text-spacing-trim`](https://www.w3.org/TR/css-text-4/#text-spacing-trim-property)：全角标点上下文间距的规范来源。
- [xterm.js #6023](https://github.com/xtermjs/xterm.js/issues/6023)：祖先 CSS transform 导致鼠标坐标偏移的上游跟踪。
- [pnpm：Patch dependencies](https://pnpm.io/cli/patch)：生成和维护精确依赖补丁的官方流程。
