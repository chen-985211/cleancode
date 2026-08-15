import type { TerminalSnapshot } from '../../../src/contexts/run/application/dto/TerminalModelSnapshot'
import { createTerminalXtermSurface } from '../../../src/presentation/app-shell/terminalXtermSurface'

const xtermState = vi.hoisted(() => ({
  terminals: [] as Array<{
    readonly loadAddon: ReturnType<typeof vi.fn>
    readonly write: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class FakeTerminal {
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
    readonly onData = vi.fn(() => ({ dispose: vi.fn() }))
    readonly open = vi.fn((element: HTMLElement) => {
      const terminalElement = document.createElement('div')
      element.append(terminalElement)
      this.element = terminalElement
    })
    readonly options: Record<string, unknown>
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
    fit = vi.fn()
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
