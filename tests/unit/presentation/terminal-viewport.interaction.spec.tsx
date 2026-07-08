import { act, fireEvent, render, waitFor } from '@testing-library/react'

import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { TerminalViewport } from '../../../src/presentation/app-shell/TerminalViewport'
import { terminalOutputBrowserEventName } from '../../../src/presentation/app-shell/types'

interface FakeTerminalInstance {
  cols: number
  rows: number
  readonly focus: ReturnType<typeof vi.fn>
  readonly write: ReturnType<typeof vi.fn>
  readonly loadAddon: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
  readonly onData: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
  textarea: HTMLTextAreaElement | null
}

interface FakeFitAddonInstance {
  terminal?: FakeTerminalInstance
  readonly fit: ReturnType<typeof vi.fn>
}

interface TerminalSize {
  readonly columns: number
  readonly rows: number
}

const xtermMockState = vi.hoisted(() => ({
  fitAddons: [] as FakeFitAddonInstance[],
  fitSizes: [] as TerminalSize[],
  terminals: [] as FakeTerminalInstance[]
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class FakeTerminal implements FakeTerminalInstance {
    cols = 80
    rows = 24
    textarea: HTMLTextAreaElement | null = null

    readonly focus = vi.fn(() => {
      this.textarea?.focus()
    })

    readonly write = vi.fn((_output: string, callback?: () => void) => {
      callback?.()
    })

    readonly loadAddon = vi.fn((addon: FakeFitAddonInstance) => {
      addon.terminal = this
    })

    readonly open = vi.fn((element: HTMLElement) => {
      const textarea = document.createElement('textarea')

      textarea.className = 'xterm-helper-textarea'
      textarea.focus = vi.fn()
      element.append(textarea)
      this.textarea = textarea
    })

    readonly onData = vi.fn(() => ({ dispose: vi.fn() }))
    readonly dispose = vi.fn()

    constructor() {
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
    xtermMockState.fitAddons = []
    xtermMockState.fitSizes = []
    xtermMockState.terminals = []
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
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })
    vi.restoreAllMocks()
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

    act(() => {
      window.dispatchEvent(
        new CustomEvent(terminalOutputBrowserEventName, {
          detail: { sessionId: 'terminal-session-1', data: 'agent output\n' }
        })
      )
    })

    expect(terminal.write.mock.calls.at(-1)?.[0]).toBe('agent output\n')
    expect(terminal.focus).not.toHaveBeenCalled()
    expect(helperTextareaFocus).not.toHaveBeenCalled()
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
  onDimensionsChange = vi.fn()
}: {
  readonly isResizeSuspended?: boolean
  readonly onDimensionsChange?: (dimensions: {
    readonly columns: number
    readonly rows: number
  }) => void
} = {}) {
  return render(
    <TerminalViewport
      block={createTerminalBlock()}
      session={{ sessionId: 'terminal-session-1', status: 'running', output: '' }}
      focusRequestId={0}
      isResizeSuspended={isResizeSuspended}
      onDimensionsChange={onDimensionsChange}
      onInput={vi.fn()}
    />
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
    <TerminalViewport
      block={createTerminalBlock()}
      session={{ sessionId: 'terminal-session-1', status: 'running', output: '' }}
      focusRequestId={0}
      isResizeSuspended={isResizeSuspended}
      onDimensionsChange={onDimensionsChange}
      onInput={vi.fn()}
    />
  )
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
