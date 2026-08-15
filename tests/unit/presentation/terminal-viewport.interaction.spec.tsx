import { act, fireEvent, render, waitFor } from '@testing-library/react'

import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { canonicalTerminalPalettes } from '../../../src/contexts/run/application/dto/TerminalPalette.generated'
import { TerminalViewport } from '../../../src/presentation/app-shell/TerminalViewport'
import { TerminalSurfaceRegistryProvider } from '../../../src/presentation/app-shell/TerminalSurfaceRegistryProvider'
import { effectiveThemeChangeEventName } from '../../../src/presentation/app-shell/themePreference'
import { TerminalSurfaceRegistry } from '../../../src/presentation/app-shell/terminalSurfaceRegistry'

interface FakeTerminalInstance {
  buffer: {
    active: {
      getLine(index: number): FakeBufferLine | undefined
    }
  }
  cols: number
  rows: number
  options: { macOptionClickForcesSelection?: boolean; theme?: Record<string, string> }
  modes: { bracketedPasteMode: boolean }
  unicode: { activeVersion: string }
  selection: string
  readonly attachCustomKeyEventHandler: ReturnType<typeof vi.fn>
  readonly focus: ReturnType<typeof vi.fn>
  readonly getSelection: ReturnType<typeof vi.fn>
  readonly hasSelection: ReturnType<typeof vi.fn>
  readonly write: ReturnType<typeof vi.fn>
  readonly loadAddon: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
  readonly onData: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
  readonly refresh: ReturnType<typeof vi.fn>
  readonly registerLinkProvider: ReturnType<typeof vi.fn>
  readonly reset: ReturnType<typeof vi.fn>
  readonly resize: ReturnType<typeof vi.fn>
  element: HTMLElement | undefined
  textarea: HTMLTextAreaElement | null
  customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null
  linkProvider: { provideLinks(line: number, callback: (links: unknown[]) => void): void } | null
}

interface FakeBufferLine {
  readonly length: number
  getCell(index: number): { getChars(): string; getWidth(): number } | undefined
  translateToString(trimRight?: boolean): string
}

interface FakeFitAddonInstance {
  terminal?: FakeTerminalInstance
  readonly fit: ReturnType<typeof vi.fn>
}

interface FakeSearchAddonInstance {
  readonly clearDecorations: ReturnType<typeof vi.fn>
  readonly findNext: ReturnType<typeof vi.fn>
  readonly findPrevious: ReturnType<typeof vi.fn>
  emitResults(resultIndex: number, resultCount: number): void
}

type FakeWebLinksAddonInstance = { activate(event: MouseEvent, target: string): void }

type TerminalSize = { readonly columns: number; readonly rows: number }

const xtermMockState = vi.hoisted(() => ({
  fitAddons: [] as FakeFitAddonInstance[],
  fitSizes: [] as TerminalSize[],
  searchAddons: [] as FakeSearchAddonInstance[],
  terminals: [] as FakeTerminalInstance[],
  webLinksAddons: [] as FakeWebLinksAddonInstance[]
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class FakeTerminal implements FakeTerminalInstance {
    cols = 80
    rows = 24
    options: { macOptionClickForcesSelection?: boolean; theme?: Record<string, string> }
    modes = { bracketedPasteMode: false }
    unicode = { activeVersion: '6' }
    buffer = { active: { getLine: vi.fn<(_: number) => FakeBufferLine | undefined>() } }
    selection = ''
    element: HTMLElement | undefined
    textarea: HTMLTextAreaElement | null = null

    readonly attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      this.customKeyEventHandler = handler
    })
    readonly focus = vi.fn(() => {
      this.textarea?.focus()
    })
    readonly getSelection = vi.fn(() => this.selection)
    readonly hasSelection = vi.fn(() => this.selection.length > 0)
    readonly write = vi.fn((_output: string, callback?: () => void) => {
      callback?.()
    })

    readonly loadAddon = vi.fn(
      (addon: FakeFitAddonInstance & { activate?(terminal: FakeTerminalInstance): void }) => {
        addon.terminal = this
        addon.activate?.(this)
      }
    )

    readonly open = vi.fn((element: HTMLElement) => {
      const terminalElement = document.createElement('div')
      const textarea = document.createElement('textarea')

      textarea.className = 'xterm-helper-textarea'
      textarea.focus = vi.fn()
      terminalElement.append(textarea)
      element.append(terminalElement)
      this.element = terminalElement
      this.textarea = textarea
    })

    readonly onData = vi.fn(() => ({ dispose: vi.fn() }))
    readonly parser = { registerOscHandler: vi.fn(() => ({ dispose: vi.fn() })) }
    readonly dispose = vi.fn()
    readonly refresh = vi.fn()
    readonly registerLinkProvider = vi.fn(
      (provider: { provideLinks(line: number, callback: (links: unknown[]) => void): void }) => {
        this.linkProvider = provider
        return { dispose: vi.fn() }
      }
    )
    readonly reset = vi.fn()
    readonly resize = vi.fn((columns: number, rows: number) => {
      this.cols = columns
      this.rows = rows
    })

    customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null = null
    linkProvider: {
      provideLinks(line: number, callback: (links: unknown[]) => void): void
    } | null = null

    constructor(options: {
      macOptionClickForcesSelection?: boolean
      theme?: Record<string, string>
    }) {
      this.options = options
      xtermMockState.terminals.push(this)
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FakeFitAddon implements FakeFitAddonInstance {
    terminal?: FakeTerminalInstance

    readonly fit = vi.fn(() => {
      const nextSize = xtermMockState.fitSizes.at(-1)

      xtermMockState.fitSizes = []

      if (!this.terminal || !nextSize) {
        return
      }

      this.terminal.cols = nextSize.columns
      this.terminal.rows = nextSize.rows
    })

    constructor() {
      xtermMockState.fitAddons.push(this)
    }
  }
}))

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class FakeSearchAddon implements FakeSearchAddonInstance {
    private listener: (result: { resultIndex: number; resultCount: number }) => void = () =>
      undefined

    readonly clearDecorations = vi.fn()
    readonly findNext = vi.fn()
    readonly findPrevious = vi.fn()
    readonly onDidChangeResults = vi.fn(
      (listener: (result: { resultIndex: number; resultCount: number }) => void) => {
        this.listener = listener
        return { dispose: vi.fn() }
      }
    )

    constructor() {
      xtermMockState.searchAddons.push(this)
    }

    emitResults(resultIndex: number, resultCount: number): void {
      this.listener({ resultIndex, resultCount })
    }
  }
}))

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class FakeUnicode11Addon {}
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class FakeWebLinksAddon implements FakeWebLinksAddonInstance {
    constructor(private readonly handler: (event: MouseEvent, target: string) => void) {
      xtermMockState.webLinksAddons.push(this)
    }

    activate(event: MouseEvent, target: string): void {
      this.handler(event, target)
    }
  }
}))

let terminalSurfaceRegistry: TerminalSurfaceRegistry
let attachTerminalView: ReturnType<typeof vi.fn>
let detachTerminalView: ReturnType<typeof vi.fn>
let openTerminalLink: ReturnType<typeof vi.fn>

describe('terminal viewport interaction', () => {
  let animationFrameCallbacks: FrameRequestCallback[] = []
  let resizeObserverCallbacks: ResizeObserverCallback[] = []
  let originalUserAgent: string

  beforeEach(() => {
    originalUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'cleancode desktop renderer'
    })
    animationFrameCallbacks = []
    resizeObserverCallbacks = []
    terminalSurfaceRegistry = new TerminalSurfaceRegistry()
    attachTerminalView = vi.fn(async (command) => createSnapshot(command, 0, ''))
    detachTerminalView = vi.fn(async () => undefined)
    openTerminalLink = vi.fn(async () => ({ kind: 'external', target: 'https://example.com/' }))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        attachTerminalView,
        detachTerminalView,
        getPathForFile: vi.fn(() => ''),
        openTerminalLink
      }
    })
    xtermMockState.fitAddons = []
    xtermMockState.fitSizes = []
    xtermMockState.searchAddons = []
    xtermMockState.terminals = []
    xtermMockState.webLinksAddons = []
    globalThis.ResizeObserver = class ManualResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallbacks.push(callback)
      }

      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'cleancode')
  })

  it('does not refocus the terminal when background output arrives', async () => {
    xtermMockState.fitSizes.push({ columns: 80, rows: 24 })
    const onDimensionsChange = vi.fn()
    const { container } = renderTerminalViewport({ onDimensionsChange })
    const terminal = await waitForInstalledTerminal()
    const viewport = container.querySelector<HTMLElement>('.terminal-viewport')

    expect(viewport).not.toBeNull()
    await waitFor(() => expect(onDimensionsChange).toHaveBeenCalled())

    fireEvent.pointerDown(viewport!)
    const helperTextarea = terminal.textarea
    expect(helperTextarea).not.toBeNull()
    const helperTextareaFocus = vi.mocked(helperTextarea!.focus)

    terminal.focus.mockClear()
    helperTextareaFocus.mockClear()

    const viewId = await waitForAttachedViewId()
    act(() => terminalSurfaceRegistry.write(createOutputEvent(viewId, 1, 'agent output\n')))

    await waitFor(() => expect(terminal.write.mock.calls.at(-1)?.[0]).toBe('agent output\n'))
    expect(terminal.focus).not.toHaveBeenCalled()
    expect(helperTextareaFocus).not.toHaveBeenCalled()
  })

  it('copies selected terminal output while preserving Ctrl+C when there is no selection', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    renderTerminalViewport()
    const terminal = await waitForInstalledTerminal()
    const copyHandler = terminal.customKeyEventHandler

    expect(terminal.options.macOptionClickForcesSelection).toBe(true)
    expect(copyHandler).not.toBeNull()

    const interruptEvent = new KeyboardEvent('keydown', {
      cancelable: true,
      ctrlKey: true,
      key: 'c'
    })
    expect(copyHandler?.(interruptEvent)).toBe(true)
    expect(interruptEvent.defaultPrevented).toBe(false)
    expect(writeText).not.toHaveBeenCalled()

    terminal.selection = 'selected terminal output'
    const copyEvent = new KeyboardEvent('keydown', {
      cancelable: true,
      ctrlKey: true,
      key: 'c'
    })
    expect(copyHandler?.(copyEvent)).toBe(false)
    expect(copyEvent.defaultPrevented).toBe(true)
    expect(writeText).toHaveBeenCalledWith('selected terminal output')
  })

  it('pins a CLI terminal to its source theme when the application theme changes', async () => {
    const { container } = renderTerminalViewport()
    const terminal = await waitForInstalledTerminal()
    const viewport = container.querySelector<HTMLElement>('.terminal-viewport')

    expect(terminal.options.theme?.background).toBe(canonicalTerminalPalettes.dark.background)
    expect(viewport?.dataset.terminalSourceTheme).toBe('dark')

    document.documentElement.dataset.theme = 'light'
    window.dispatchEvent(new CustomEvent(effectiveThemeChangeEventName))

    expect(terminal.options.theme?.background).toBe(canonicalTerminalPalettes.dark.background)
    expect(xtermMockState.terminals).toHaveLength(1)
  })

  it('disposes the detached xterm after main acknowledges detach and creates a fresh view', async () => {
    const firstWorkspace = renderTerminalViewport()
    const terminal = await waitForInstalledTerminal()
    await waitForAttachedViewId()

    firstWorkspace.unmount()

    await waitFor(() => expect(terminal.dispose).toHaveBeenCalledTimes(1))
    expect(detachTerminalView).toHaveBeenCalledTimes(1)

    renderTerminalViewport()

    await waitFor(() => expect(xtermMockState.terminals).toHaveLength(2))
    expect(xtermMockState.terminals[1]).not.toBe(terminal)
    expect(xtermMockState.terminals[1]?.open).toHaveBeenCalledTimes(1)
  })

  it('keeps a detached xterm alive until query ownership handoff is acknowledged', async () => {
    let finishDetach: () => void = () => undefined
    detachTerminalView.mockImplementation(
      () => new Promise<void>((resolve) => (finishDetach = resolve))
    )
    const workspace = renderTerminalViewport()
    const terminal = await waitForInstalledTerminal()
    await waitForAttachedViewId()

    workspace.unmount()

    expect(terminal.dispose).not.toHaveBeenCalled()
    finishDetach()
    await waitFor(() => expect(terminal.dispose).toHaveBeenCalledTimes(1))
  })

  it('replays a snapshot before applying later sequenced output', async () => {
    attachTerminalView.mockImplementation(async (command) =>
      createSnapshot(command, 2, '\u001b[31mrestored')
    )
    renderTerminalViewport()
    const terminal = await waitForInstalledTerminal()
    const viewId = await waitForAttachedViewId()

    act(() => terminalSurfaceRegistry.write(createOutputEvent(viewId, 3, '\r\nlive')))

    await waitFor(() => {
      expect(terminal.write.mock.calls.map((call) => call[0])).toEqual([
        '\u001b[31mrestored',
        '\r\nlive'
      ])
    })
  })

  it('keeps live startup output when the screen snapshot contains only normal-buffer text', async () => {
    attachTerminalView.mockImplementation(async (command) =>
      createSnapshot(command, 1, 'normal-buffer snapshot')
    )
    const { getByLabelText } = renderTerminalViewport({
      output: '\u001b[?1049hFULLSCREEN_STARTUP_OUTPUT'
    })

    await waitForAttachedViewId()
    await waitFor(() =>
      expect(getByLabelText('Terminal 1 文本输出').textContent).toContain(
        'FULLSCREEN_STARTUP_OUTPUT'
      )
    )
    expect(getByLabelText('Terminal 1 文本输出').textContent).not.toContain(
      'normal-buffer snapshot'
    )
  })

  it('requests a fresh snapshot when live output has a sequence gap', async () => {
    attachTerminalView
      .mockImplementationOnce(async (command) => createSnapshot(command, 0, 'first'))
      .mockImplementationOnce(async (command) => createSnapshot(command, 2, 'gap-recovered'))
    renderTerminalViewport()
    const terminal = await waitForInstalledTerminal()
    const viewId = await waitForAttachedViewId()
    await waitFor(() => expect(terminal.reset).toHaveBeenCalledTimes(1))

    act(() => terminalSurfaceRegistry.write(createOutputEvent(viewId, 2, 'missing-one')))

    await waitFor(() => expect(attachTerminalView).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(terminal.write.mock.calls.map((call) => call[0])).toContain('gap-recovered')
    )
  })

  it('bounds output buffered while a snapshot is in flight and recovers from overflow', async () => {
    let resolveFirstSnapshot: (snapshot: ReturnType<typeof createSnapshot>) => void = () =>
      undefined
    attachTerminalView.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSnapshot = resolve
        })
    )
    attachTerminalView.mockImplementation(async (command) =>
      createSnapshot(command, 2, 'overflow-recovered')
    )
    renderTerminalViewport()
    const terminal = await waitForInstalledTerminal()
    const viewId = await waitForAttachedViewId()

    act(() => {
      terminalSurfaceRegistry.write(createOutputEvent(viewId, 1, 'x'.repeat(600 * 1024)))
      terminalSurfaceRegistry.write(createOutputEvent(viewId, 2, 'y'.repeat(600 * 1024)))
    })

    expect(terminalSurfaceRegistry.getDiagnostics().pendingOutputBytes).toBeLessThanOrEqual(
      1024 * 1024
    )
    const firstAttachCommand = attachTerminalView.mock.calls[0]?.[0]
    expect(firstAttachCommand).toBeDefined()
    resolveFirstSnapshot(createSnapshot(firstAttachCommand, 0, 'first-boundary'))

    await waitFor(() => expect(attachTerminalView).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(terminal.write.mock.calls.map((call) => call[0])).toContain('overflow-recovered')
    )
  })

  it('coalesces resize observer bursts before reporting terminal dimensions', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrameCallbacks.push(callback)

      return animationFrameCallbacks.length
    })
    xtermMockState.fitSizes.push({ columns: 80, rows: 24 })
    const onDimensionsChange = vi.fn()

    renderTerminalViewport({ onDimensionsChange })
    await waitForInstalledTerminal()
    await waitFor(() => expect(onDimensionsChange).toHaveBeenCalledWith({ columns: 80, rows: 24 }))
    onDimensionsChange.mockClear()
    xtermMockState.fitSizes.push(
      { columns: 81, rows: 24 },
      { columns: 82, rows: 24 },
      { columns: 83, rows: 25 }
    )

    act(() => {
      triggerObservedResize()
      triggerObservedResize()
      triggerObservedResize()
    })

    expect(onDimensionsChange).not.toHaveBeenCalled()

    flushAnimationFrames()

    expect(onDimensionsChange).toHaveBeenCalledTimes(1)
    expect(onDimensionsChange).toHaveBeenCalledWith({ columns: 83, rows: 25 })
  })

  it('defers terminal dimension reports while node resizing is active', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrameCallbacks.push(callback)

      return animationFrameCallbacks.length
    })
    xtermMockState.fitSizes.push({ columns: 80, rows: 24 })
    const onDimensionsChange = vi.fn()
    const { rerender } = renderTerminalViewport({
      isResizeSuspended: true,
      onDimensionsChange
    })

    await waitForInstalledTerminal()
    await waitFor(() => expect(onDimensionsChange).toHaveBeenCalledWith({ columns: 80, rows: 24 }))
    onDimensionsChange.mockClear()
    xtermMockState.fitSizes.push({ columns: 100, rows: 30 })

    act(() => {
      triggerObservedResize()
    })
    flushAnimationFrames()

    expect(onDimensionsChange).not.toHaveBeenCalled()

    rerenderTerminalViewport(rerender, { isResizeSuspended: false, onDimensionsChange })
    flushAnimationFrames()

    expect(onDimensionsChange).toHaveBeenCalledTimes(1)
    expect(onDimensionsChange).toHaveBeenCalledWith({ columns: 100, rows: 30 })
  })

  function triggerObservedResize(): void {
    for (const callback of resizeObserverCallbacks) {
      callback([], {} as ResizeObserver)
    }
  }

  function flushAnimationFrames(): void {
    const callbacks = animationFrameCallbacks

    animationFrameCallbacks = []
    act(() => {
      for (const callback of callbacks) {
        callback(performance.now())
      }
    })
  }
})

function renderTerminalViewport({
  isResizeSuspended = false,
  onDimensionsChange = vi.fn(),
  onPaste = vi.fn(async () => undefined),
  output = ''
}: {
  readonly isResizeSuspended?: boolean
  readonly onDimensionsChange?: (dimensions: {
    readonly columns: number
    readonly rows: number
  }) => void
  readonly onPaste?: (block: TerminalBlockSnapshot, input: string) => Promise<void>
  readonly output?: string
} = {}) {
  return render(
    <TerminalSurfaceRegistryProvider registry={terminalSurfaceRegistry}>
      <TerminalViewport
        block={createTerminalBlock()}
        session={createRunningTerminalState(output)}
        focusRequestId={0}
        isResizeSuspended={isResizeSuspended}
        onDimensionsChange={onDimensionsChange}
        onInput={vi.fn()}
        onPaste={onPaste}
        onRestart={vi.fn()}
      />
    </TerminalSurfaceRegistryProvider>
  )
}

function rerenderTerminalViewport(
  rerender: ReturnType<typeof render>['rerender'],
  {
    isResizeSuspended = false,
    onDimensionsChange = vi.fn()
  }: {
    readonly isResizeSuspended?: boolean
    readonly onDimensionsChange?: (dimensions: {
      readonly columns: number
      readonly rows: number
    }) => void
  } = {}
) {
  rerender(
    <TerminalSurfaceRegistryProvider registry={terminalSurfaceRegistry}>
      <TerminalViewport
        block={createTerminalBlock()}
        session={createRunningTerminalState()}
        focusRequestId={0}
        isResizeSuspended={isResizeSuspended}
        onDimensionsChange={onDimensionsChange}
        onInput={vi.fn()}
        onRestart={vi.fn()}
      />
    </TerminalSurfaceRegistryProvider>
  )
}

function createRunningTerminalState(output = '') {
  return {
    sessionId: 'terminal-session-1',
    status: 'running' as const,
    output,
    terminalSourceTheme: 'dark' as const,
    runIdentity: {
      projectId: 'project-alpha',
      workspaceId: 'feature/sidebar',
      blockId: 'terminal-1',
      sessionId: 'terminal-session-1',
      runId: 'run-1',
      generation: 1
    }
  }
}

function createOutputEvent(viewId: string, sequence: number, data: string) {
  return {
    viewId,
    sessionId: 'terminal-session-1',
    output: { sequence, data },
    scope: {
      projectId: 'project-alpha',
      projectDirectory: '/tmp/project-alpha',
      workspaceId: 'feature/sidebar',
      workspaceDirectory: '/tmp/project-alpha-worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar',
      blockId: 'terminal-1',
      sessionId: 'terminal-session-1',
      runId: 'run-1',
      generation: 1
    }
  }
}

async function waitForAttachedViewId(): Promise<string> {
  await waitFor(() => expect(attachTerminalView).toHaveBeenCalled())
  return attachTerminalView.mock.calls.at(-1)?.[0].viewId as string
}

function createSnapshot(
  command: ReturnType<typeof createRunningTerminalState>['runIdentity'] & {
    readonly viewId?: string
  },
  sequence: number,
  content: string
) {
  return {
    identity: {
      projectId: command.projectId,
      projectDirectory: '/tmp/project-alpha',
      workspaceId: command.workspaceId,
      workspaceDirectory: '/tmp/project-alpha-worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar',
      blockId: command.blockId,
      sessionId: command.sessionId,
      runId: command.runId,
      generation: command.generation
    },
    sequence,
    restoreMarker: { viewId: command.viewId ?? '', sequence },
    content,
    transcript: content,
    dimensions: { columns: 80, rows: 24 },
    title: '',
    workingDirectory: '/tmp/project-alpha-worktrees/feature-sidebar',
    modes: {
      applicationCursorKeysMode: false,
      applicationKeypadMode: false,
      bracketedPasteMode: false,
      insertMode: false,
      mouseTrackingMode: 'none' as const,
      originMode: false,
      reverseWraparoundMode: false,
      sendFocusMode: false,
      synchronizedOutputMode: false,
      wraparoundMode: true
    }
  }
}

async function waitForInstalledTerminal(): Promise<FakeTerminalInstance> {
  await waitFor(() => expect(xtermMockState.terminals).toHaveLength(1))

  return xtermMockState.terminals[0]
}

function createTerminalBlock(): TerminalBlockSnapshot {
  return {
    id: 'terminal-1',
    type: 'terminal',
    name: 'Terminal 1',
    description: '本地终端',
    launchCommand: '',
    position: { x: 120, y: 80 },
    size: { width: 640, height: 360 }
  }
}
