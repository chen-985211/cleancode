import type { TerminalSnapshot } from '../../../src/contexts/run/application/dto/TerminalModelSnapshot'
import { createTerminalXtermSurface } from '../../../src/presentation/app-shell/terminalXtermSurface'

const xtermState = vi.hoisted(() => ({
  fitDimensions: [] as Array<{ readonly columns: number; readonly rows: number }>,
  terminals: [] as Array<{
    readonly loadAddon: ReturnType<typeof vi.fn>
    readonly processOsc: (code: number, data: string) => boolean
    readonly write: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class FakeTerminal {
    private readonly oscHandlers = new Map<number, (data: string) => boolean>()
    private dataListener: ((data: string) => void) | null = null
    readonly attachCustomKeyEventHandler = vi.fn()
    readonly buffer = { active: { getLine: vi.fn() } }
    readonly dispose = vi.fn()
    readonly focus = vi.fn()
    readonly getSelection = vi.fn(() => '')
    readonly hasSelection = vi.fn(() => false)
    readonly loadAddon = vi.fn((addon: { activate?(terminal: FakeTerminal): void }) =>
      addon.activate?.(this)
    )
    readonly modes = { bracketedPasteMode: false }
    readonly onData = vi.fn((listener: (data: string) => void) => {
      this.dataListener = listener
      return { dispose: vi.fn() }
    })
    readonly open = vi.fn((element: HTMLElement) => {
      const terminalElement = document.createElement('div')
      element.append(terminalElement)
      this.element = terminalElement
    })
    readonly options: Record<string, unknown>
    readonly parser = {
      registerOscHandler: vi.fn((code: number, handler: (data: string) => boolean) => {
        this.oscHandlers.set(code, handler)
        return { dispose: vi.fn() }
      })
    }
    readonly processOsc = (code: number, data: string): boolean => {
      const handled = this.oscHandlers.get(code)?.(data) ?? false
      if (!handled && data === '?') {
        this.dataListener?.(`\u001b]${code};rgb:ffff/ffff/ffff\u001b\\`)
      }
      return handled
    }
    readonly refresh = vi.fn()
    readonly registerLinkProvider = vi.fn(() => ({ dispose: vi.fn() }))
    readonly reset = vi.fn()
    readonly resize = vi.fn((columns: number, rows: number) => {
      this.cols = columns
      this.rows = rows
    })
    readonly unicode = { activeVersion: '6' }
    readonly write = vi.fn((_output: string, callback?: () => void) => callback?.())
    cols = 80
    element: HTMLElement | undefined
    rows = 24

    constructor(options: Record<string, unknown>) {
      this.options = options
      xtermState.terminals.push(this)
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FakeFitAddon {
    private terminal: { resize(columns: number, rows: number): void } | null = null

    activate(terminal: { resize(columns: number, rows: number): void }): void {
      this.terminal = terminal
    }

    fit = vi.fn(() => {
      const dimensions = xtermState.fitDimensions.shift()
      if (dimensions) this.terminal?.resize(dimensions.columns, dimensions.rows)
    })
  }
}))
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class FakeSearchAddon {
    readonly clearDecorations = vi.fn()
    readonly findNext = vi.fn()
    readonly findPrevious = vi.fn()
    readonly onDidChangeResults = vi.fn(() => ({ dispose: vi.fn() }))
  }
}))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class FakeUnicodeAddon {} }))
vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class FakeWebLinksAddon {}
}))
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class FakeWebglAddon {
    readonly dispose = vi.fn()
    readonly onContextLoss = vi.fn(() => ({ dispose: vi.fn() }))
    readonly setRasterScale = vi.fn()
  }
}))

describe('terminal xterm workload target', () => {
  beforeEach(() => {
    xtermState.fitDimensions = []
    xtermState.terminals = []
    globalThis.ResizeObserver = class FakeResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  })

  it('coalesces ordered output and leaves WebGL activation to non-critical scheduling', async () => {
    const surface = createTerminalXtermSurface('dark')
    const element = document.createElement('div')
    document.body.append(element)
    surface.attach({
      element,
      isResizeSuspended: false,
      onDimensionsChange: vi.fn(),
      onInput: vi.fn(),
      onOpenLink: vi.fn(),
      onOpenSearch: vi.fn(),
      onRestoreRequired: vi.fn(),
      onSearchResultsChange: vi.fn()
    })
    await surface.restore(createSnapshot())
    const terminal = xtermState.terminals[0]!

    expect(surface.workloadTarget?.hasPendingInitialization?.()).toBe(true)
    expect(element).toHaveAttribute('data-terminal-renderer-ready', 'false')

    surface.write({ sequence: 1, data: '\u001b[32m' })
    surface.write({ sequence: 2, data: '你好\u001b[0m' })
    await surface.workloadTarget?.drainOutput(Number.POSITIVE_INFINITY)

    expect(terminal.write.mock.calls.at(-1)?.[0]).toBe('\u001b[32m你好\u001b[0m')
    expect(surface.workloadTarget?.hasPendingOutput()).toBe(false)

    await surface.workloadTarget?.runInitialization?.()

    expect(element).toHaveAttribute('data-terminal-renderer-ready', 'true')
    surface.dispose()
  })

  it('notifies the scheduler only when drainable output availability changes', async () => {
    const surface = createTerminalXtermSurface('dark')
    await surface.restore(createSnapshot())
    const onPendingOutputChange = vi.fn()
    const unsubscribe = surface.workloadTarget?.onOutputPendingChange(onPendingOutputChange)

    surface.write({ sequence: 1, data: 'first' })
    surface.write({ sequence: 2, data: 'second' })

    expect(onPendingOutputChange).toHaveBeenCalledTimes(1)

    unsubscribe?.()
    surface.dispose()
  })

  it('reports output as settled only after xterm consumes the final queued write', async () => {
    const surface = createTerminalXtermSurface('dark')
    await surface.restore(createSnapshot())
    const terminal = xtermState.terminals[0]!
    const onOutputSettled = vi.fn()
    const unsubscribe = surface.onOutputSettled(onOutputSettled)
    let completeWrite: (() => void) | undefined
    terminal.write.mockImplementationOnce((_output: string, callback?: () => void) => {
      completeWrite = callback
    })

    surface.write({ sequence: 1, data: 'tail' })
    expect(surface.isOutputSettled()).toBe(false)
    const drain = surface.workloadTarget?.drainOutput(Number.POSITIVE_INFINITY)
    expect(surface.isOutputSettled()).toBe(false)

    completeWrite?.()
    await drain
    expect(surface.isOutputSettled()).toBe(true)
    expect(onOutputSettled).toHaveBeenCalledOnce()

    unsubscribe()
    surface.dispose()
  })

  it('consumes renderer OSC color queries without forwarding a second terminal response', () => {
    const onInput = vi.fn()
    const surface = createTerminalXtermSurface('light')
    const element = document.createElement('div')
    document.body.append(element)
    surface.attach({
      element,
      isResizeSuspended: false,
      onDimensionsChange: vi.fn(),
      onInput,
      onOpenLink: vi.fn(),
      onOpenSearch: vi.fn(),
      onRestoreRequired: vi.fn(),
      onSearchResultsChange: vi.fn()
    })
    const terminal = xtermState.terminals[0]!

    expect(terminal.processOsc(10, '?')).toBe(true)
    expect(terminal.processOsc(11, '?')).toBe(true)
    expect(onInput).not.toHaveBeenCalled()
    expect(terminal.processOsc(10, 'rgb:ffff/ffff/ffff')).toBe(false)

    surface.dispose()
  })

  it('refits after deferred renderer initialization without waiting for a host resize', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    xtermState.fitDimensions.push({ columns: 80, rows: 24 }, { columns: 100, rows: 30 })
    const onDimensionsChange = vi.fn()
    const surface = createTerminalXtermSurface('dark')
    const element = document.createElement('div')
    document.body.append(element)

    surface.attach({
      element,
      isResizeSuspended: false,
      onDimensionsChange,
      onInput: vi.fn(),
      onOpenLink: vi.fn(),
      onOpenSearch: vi.fn(),
      onRestoreRequired: vi.fn(),
      onSearchResultsChange: vi.fn()
    })
    expect(onDimensionsChange).toHaveBeenLastCalledWith({ columns: 80, rows: 24 })
    onDimensionsChange.mockClear()

    await surface.workloadTarget?.runInitialization?.()
    for (const callback of animationFrames.splice(0)) callback(performance.now())

    expect(onDimensionsChange).toHaveBeenCalledTimes(1)
    expect(onDimensionsChange).toHaveBeenLastCalledWith({ columns: 100, rows: 30 })
    surface.dispose()
  })

  it('does not schedule a deferred renderer refit after the surface detaches', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    const onDimensionsChange = vi.fn()
    const surface = createTerminalXtermSurface('dark')
    const element = document.createElement('div')
    document.body.append(element)
    surface.attach({
      element,
      isResizeSuspended: false,
      onDimensionsChange,
      onInput: vi.fn(),
      onOpenLink: vi.fn(),
      onOpenSearch: vi.fn(),
      onRestoreRequired: vi.fn(),
      onSearchResultsChange: vi.fn()
    })
    onDimensionsChange.mockClear()

    const initialization = surface.workloadTarget?.runInitialization?.()
    surface.detach(element)
    await initialization

    expect(animationFrames).toHaveLength(0)
    expect(onDimensionsChange).not.toHaveBeenCalled()
    surface.dispose()
  })
})

function createSnapshot(): TerminalSnapshot {
  return {
    content: '',
    dimensions: { columns: 80, rows: 24 },
    identity: {
      blockId: 'terminal-1',
      generation: 1,
      gitBranch: 'main',
      projectDirectory: '/tmp/project',
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      workspaceDirectory: '/tmp/project',
      workspaceId: 'main'
    },
    modes: {
      applicationCursorKeysMode: false,
      applicationKeypadMode: false,
      bracketedPasteMode: false,
      insertMode: false,
      mouseTrackingMode: 'none',
      originMode: false,
      reverseWraparoundMode: false,
      sendFocusMode: false,
      synchronizedOutputMode: false,
      wraparoundMode: true
    },
    restoreMarker: { sequence: 0, viewId: 'view-1' },
    scrollbackRows: 1000,
    sequence: 0,
    terminalSourceTheme: 'dark',
    title: '',
    transcript: '',
    unicodeVersion: '11',
    workingDirectory: '/tmp/project'
  }
}
