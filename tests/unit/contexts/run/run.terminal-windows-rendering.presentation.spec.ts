import type { TerminalSnapshot } from '../../../../src/contexts/run/application/dto/TerminalModelSnapshot'
import { createTerminalXtermSurface } from '../../../../src/contexts/run/presentation/terminal-surface/terminalXtermSurface'
import type { TerminalSurface } from '../../../../src/contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'

const state = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  loseContext: null as (() => void) | null,
  rejectWebgl: false,
  activations: 0,
  writes: vi.fn(),
  resets: vi.fn(),
  align: vi.fn()
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    element: HTMLElement | undefined
    readonly buffer = { active: { baseY: 0, viewportY: 0 } }
    readonly parser = { registerOscHandler: vi.fn() }
    readonly unicode = { activeVersion: '6' }
    readonly onData = () => ({ dispose() {} })
    readonly onRender = () => ({ dispose() {} })
    readonly onDidChangeResults = () => ({ dispose() {} })
    readonly registerLinkProvider = () => ({ dispose() {} })
    readonly attachCustomKeyEventHandler = vi.fn()
    readonly reset = state.resets
    readonly blur = vi.fn()
    readonly refresh = vi.fn()
    readonly dispose = vi.fn()
    readonly scrollToBottom = vi.fn()
    readonly write = (data: string, callback?: () => void) => {
      state.writes(data)
      callback?.()
    }

    constructor(readonly options: Record<string, unknown>) {
      state.options.push(options)
    }

    loadAddon(addon: { onContextLoss?: unknown }): void {
      if (addon.onContextLoss) state.activations += 1
      if (addon.onContextLoss && state.rejectWebgl) throw new Error('WebGL unavailable')
    }

    open(host: HTMLElement): void {
      this.element = document.createElement('div')
      host.append(this.element)
    }

    resize(cols: number, rows: number): void {
      this.cols = cols
      this.rows = rows
    }
  }
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  }
}))
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {
    clearDecorations() {}
    onDidChangeResults = () => ({ dispose() {} })
  }
}))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss(listener: () => void) {
      state.loseContext = listener
      return { dispose() {} }
    }
    dispose() {}
    setRasterScale() {}
    refreshRasterAlignment = state.align
  }
}))

beforeEach(() => {
  state.options = []
  state.loseContext = null
  state.rejectWebgl = false
  state.activations = 0
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it.each([
  ['Win32', 530],
  ['MacIntel', 530],
  ['Linux x86_64', 530]
])('uses the intended regular weight on %s without changing the font stack', (platform, weight) => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(String(platform))
  const surface = createTerminalXtermSurface('dark')
  expect(state.options[0]).toMatchObject({
    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
    fontSize: 13,
    fontWeight: weight,
    lineHeight: 1.32
  })
  surface.dispose()
})

it.each(['Win32', 'MacIntel', 'Linux x86_64'])(
  'keeps the stream on %s and only schedules Windows WebGL recovery when reattached',
  async (platform) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    const surface = createTerminalXtermSurface('dark')
    const attach = () => mountSurface(surface)
    try {
      attach()
      await surface.restore(snapshot())
      const rendererGeometryChanged = vi.fn()
      surface.rasterTarget!.onRasterCostChange!(rendererGeometryChanged)
      await surface.workloadTarget!.runInitialization!()
      expect(surface.getDiagnostics().rendererState).toBe('webgl')
      expect(rendererGeometryChanged).toHaveBeenCalledTimes(platform === 'Win32' ? 1 : 0)
      const previousElement = attach().firstElementChild
      expect(state.align).toHaveBeenCalledTimes(platform === 'Win32' ? 1 : 0)
      await surface.restore(snapshot())
      expect(surface.retain!({ onInput: vi.fn(), onRestoreRequired: vi.fn() })).toBe(true)
      state.loseContext!()
      expect(surface.getDiagnostics().rendererState).toBe('dom')
      expect(surface.workloadTarget!.hasPendingInitialization!()).toBe(false)

      const host = attach()
      expect(host.firstElementChild).toBe(previousElement)
      expect(surface.workloadTarget!.hasPendingInitialization!()).toBe(platform === 'Win32')
      await surface.workloadTarget!.runInitialization!()
      expect(surface.getDiagnostics().rendererState).toBe(platform === 'Win32' ? 'webgl' : 'dom')
      expect(state.writes).toHaveBeenCalledOnce()
      expect(state.resets).toHaveBeenCalledOnce()
      expect(state.options).toHaveLength(1)
    } finally {
      surface.dispose()
    }
  }
)

it.each(['unsupported', 'failed-recovery', 'disposed'])(
  'bounds Windows recovery and keeps cleanup safe for %s',
  async (scenario) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32')
    const surface = createTerminalXtermSurface('dark')
    const attach = () => mountSurface(surface)
    try {
      state.rejectWebgl = scenario === 'unsupported'
      attach()
      await surface.workloadTarget!.runInitialization!()
      if (scenario !== 'unsupported') state.loseContext!()
      attach()
      if (scenario === 'disposed') surface.dispose()
      state.rejectWebgl = true
      const work = surface.workloadTarget!
      await Promise.all([work.runInitialization!(), work.runInitialization!()])
      expect(work.hasPendingInitialization!()).toBe(false)
      expect(surface.getDiagnostics().rendererState).toBe('dom')
      expect(state.activations).toBe(scenario === 'failed-recovery' ? 2 : 1)
      if (scenario !== 'disposed') {
        attach()
        expect(work.hasPendingInitialization!()).toBe(false)
      }
    } finally {
      surface.dispose()
    }
  }
)

it.each(['Win32', 'MacIntel', 'Linux x86_64'])(
  'only requests display-matched sampling on Windows (%s)',
  (platform) => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
    const surface = createTerminalXtermSurface('dark')
    try {
      const host = mountSurface(surface)
      const screen = document.createElement('div')
      screen.className = 'xterm-screen'
      screen.style.width = '800px'
      const bounds = vi.spyOn(screen, 'getBoundingClientRect')
      host.append(screen)
      for (const zoom of [0.77, 1, 1.2, 1.6]) {
        bounds.mockReturnValue({ width: 800 * zoom + 0.00001 } as DOMRect)
        expect(surface.rasterTarget!.getPreferredRasterScale!()).toBe(
          platform === 'Win32' ? zoom : undefined
        )
      }
      screen.remove()
      expect(surface.rasterTarget!.getPreferredRasterScale!()).toBeUndefined()
    } finally {
      surface.dispose()
    }
  }
)

function mountSurface(surface: TerminalSurface): HTMLDivElement {
  const element = document.createElement('div')
  document.body.append(element)
  surface.attach({
    element,
    resume: true,
    isResizeSuspended: false,
    onDimensionsChange: vi.fn(),
    onInput: vi.fn(),
    onOpenLink: vi.fn(),
    onOpenSearch: vi.fn(),
    onRestoreRequired: vi.fn(),
    onSearchResultsChange: vi.fn()
  })
  return element
}

function snapshot(): TerminalSnapshot {
  return {
    sequence: 0,
    content: 'retained screen',
    dimensions: { columns: 80, rows: 24 },
    scrollbackRows: 1000,
    terminalSourceTheme: 'dark'
  } as TerminalSnapshot
}
