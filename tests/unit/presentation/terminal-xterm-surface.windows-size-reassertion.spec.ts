import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const surfaceTestState = vi.hoisted(() => ({
  fitDimensions: { cols: 112, rows: 34 },
  resizeObserverCallback: null as ResizeObserverCallback | null
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 9
    readonly buffer = { active: { getLine: vi.fn() } }
    element: HTMLElement | undefined
    readonly modes = { bracketedPasteMode: false }
    readonly options: Record<string, unknown>
    readonly unicode = { activeVersion: '6' }

    constructor(options: Record<string, unknown>) {
      this.options = options
    }

    attachCustomKeyEventHandler(): void {}
    dispose(): void {}
    focus(): void {}
    getSelection(): string {
      return ''
    }
    hasSelection(): boolean {
      return false
    }
    loadAddon(addon: { activate?(terminal: { cols: number; rows: number }): void }): void {
      addon.activate?.(this)
    }
    onData() {
      return { dispose: vi.fn() }
    }
    open(element: HTMLElement): void {
      this.element = document.createElement('div')
      element.append(this.element)
    }
    refresh(): void {}
    registerLinkProvider() {
      return { dispose: vi.fn() }
    }
    reset(): void {}
    resize(columns: number, rows: number): void {
      this.cols = columns
      this.rows = rows
    }
    write(_output: string, callback?: () => void): void {
      callback?.()
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    private terminal: { cols: number; rows: number } | null = null

    activate(terminal: { cols: number; rows: number }): void {
      this.terminal = terminal
    }
    fit(): void {
      if (!this.terminal) return
      this.terminal.cols = surfaceTestState.fitDimensions.cols
      this.terminal.rows = surfaceTestState.fitDimensions.rows
    }
    proposeDimensions() {
      return surfaceTestState.fitDimensions
    }
  }
}))
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class {
    clearDecorations(): void {}
    findNext(): void {}
    findPrevious(): void {}
    onDidChangeResults() {
      return { dispose: vi.fn() }
    }
  }
}))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    dispose(): void {}
    onContextLoss() {
      return { dispose: vi.fn() }
    }
  }
}))

import { createTerminalXtermSurface } from '../../../src/presentation/app-shell/terminalXtermSurface'

describe('terminal xterm surface Windows size reassertion', () => {
  let animationFrames: Map<number, FrameRequestCallback>
  let nextAnimationFrameId: number
  let originalPlatform: string

  beforeEach(() => {
    animationFrames = new Map()
    nextAnimationFrameId = 0
    originalPlatform = navigator.platform
    surfaceTestState.resizeObserverCallback = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          surfaceTestState.resizeObserverCallback = callback
        }
        disconnect(): void {}
        observe(): void {}
        unobserve(): void {}
      }
    )
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const frameId = ++nextAnimationFrameId
        animationFrames.set(frameId, callback)
        return frameId
      })
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((frameId: number) => {
        animationFrames.delete(frameId)
      })
    )
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: originalPlatform
    })
    vi.unstubAllGlobals()
  })

  it.each([
    ['Win32', 2],
    ['MacIntel', 1]
  ])(
    'reports the stable unchanged grid on %s with %i reports',
    async (platform, expectedReportCount) => {
      Object.defineProperty(navigator, 'platform', {
        configurable: true,
        value: platform
      })
      const onDimensionsChange = vi.fn()
      const element = document.createElement('div')
      const surface = createTerminalXtermSurface()

      surface.attach({
        element,
        isResizeSuspended: false,
        onDimensionsChange,
        onInput: () => undefined,
        onOpenLink: () => undefined,
        onOpenSearch: () => undefined,
        onRestoreRequired: () => undefined,
        onSearchResultsChange: () => undefined
      })
      await vi.dynamicImportSettled()
      surfaceTestState.resizeObserverCallback?.([], {} as ResizeObserver)
      drainAnimationFrames(animationFrames)

      expect(onDimensionsChange).toHaveBeenCalledTimes(expectedReportCount)
      expect(onDimensionsChange).toHaveBeenLastCalledWith({ columns: 112, rows: 34 })
      surface.dispose()
    }
  )
})

function drainAnimationFrames(frames: Map<number, FrameRequestCallback>): void {
  let timestamp = 0
  while (frames.size > 0 && timestamp < 200) {
    const [frameId, callback] = frames.entries().next().value!
    frames.delete(frameId)
    callback((timestamp += 16))
  }
}
