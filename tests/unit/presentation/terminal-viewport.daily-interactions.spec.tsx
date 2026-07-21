import { act, fireEvent, render, waitFor } from '@testing-library/react'

import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { TerminalViewport } from '../../../src/presentation/app-shell/TerminalViewport'
import { TerminalSurfaceRegistryProvider } from '../../../src/presentation/app-shell/TerminalSurfaceRegistryProvider'
import { TerminalSurfaceRegistry } from '../../../src/presentation/app-shell/terminalSurfaceRegistry'

interface FakeSearchAddon {
  readonly clearDecorations: ReturnType<typeof vi.fn>
  readonly findNext: ReturnType<typeof vi.fn>
  readonly findPrevious: ReturnType<typeof vi.fn>
  emit(resultIndex: number, resultCount: number): void
}

interface FakeWebLinksAddon {
  trigger(event: MouseEvent, target: string): void
}

interface FakeTerminal {
  buffer: { active: { getLine(index: number): FakeBufferLine | undefined } }
  customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null
  focus: ReturnType<typeof vi.fn>
  linkProvider: { provideLinks(line: number, callback: (links: unknown[]) => void): void } | null
}

interface FakeBufferLine {
  readonly length: number
  getCell(index: number): { getChars(): string; getWidth(): number } | undefined
  translateToString(): string
}

const phaseTwoMockState = vi.hoisted(() => ({
  searchAddons: [] as FakeSearchAddon[],
  terminals: [] as FakeTerminal[],
  webLinksAddons: [] as FakeWebLinksAddon[]
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class implements FakeTerminal {
    cols = 80
    rows = 24
    options: Record<string, unknown>
    unicode = { activeVersion: '6' }
    modes = { bracketedPasteMode: false }
    buffer = { active: { getLine: vi.fn<(_: number) => FakeBufferLine | undefined>() } }
    element: HTMLElement | undefined
    customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null = null
    linkProvider: {
      provideLinks(line: number, callback: (links: unknown[]) => void): void
    } | null = null
    readonly focus = vi.fn()

    constructor(options: Record<string, unknown>) {
      this.options = options
      phaseTwoMockState.terminals.push(this)
    }

    loadAddon(addon: { activate?(terminal: FakeTerminal): void }): void {
      addon.activate?.(this)
    }

    registerLinkProvider(provider: NonNullable<FakeTerminal['linkProvider']>) {
      this.linkProvider = provider
      return { dispose: vi.fn() }
    }

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      this.customKeyEventHandler = handler
    }

    open(element: HTMLElement): void {
      const terminalElement = document.createElement('div')
      terminalElement.append(document.createElement('textarea'))
      element.append(terminalElement)
      this.element = terminalElement
    }

    onData() {
      return { dispose: vi.fn() }
    }

    hasSelection(): boolean {
      return false
    }

    getSelection(): string {
      return ''
    }

    write(_output: string, callback?: () => void): void {
      callback?.()
    }

    reset(): void {}
    resize(columns: number, rows: number): void {
      this.cols = columns
      this.rows = rows
    }
    refresh(): void {}
    dispose(): void {}
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
  }
}))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }))
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    onContextLoss() {
      return { dispose: vi.fn() }
    }
    dispose(): void {}
  }
}))
vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class implements FakeSearchAddon {
    private listener: (result: { resultIndex: number; resultCount: number }) => void = () =>
      undefined
    readonly clearDecorations = vi.fn()
    readonly findNext = vi.fn()
    readonly findPrevious = vi.fn()

    constructor() {
      phaseTwoMockState.searchAddons.push(this)
    }

    onDidChangeResults(listener: typeof this.listener) {
      this.listener = listener
      return { dispose: vi.fn() }
    }

    emit(resultIndex: number, resultCount: number): void {
      this.listener({ resultIndex, resultCount })
    }
  }
}))
vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class implements FakeWebLinksAddon {
    constructor(private readonly handler: (event: MouseEvent, target: string) => void) {
      phaseTwoMockState.webLinksAddons.push(this)
    }
    trigger(event: MouseEvent, target: string): void {
      this.handler(event, target)
    }
  }
}))

describe('terminal viewport daily interactions', () => {
  let originalUserAgent: string
  let openTerminalLink: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'cleancode desktop renderer'
    })
    phaseTwoMockState.searchAddons = []
    phaseTwoMockState.terminals = []
    phaseTwoMockState.webLinksAddons = []
    openTerminalLink = vi.fn(async () => ({ kind: 'external', target: 'https://example.com/' }))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        attachTerminalView: vi.fn(async (command) => snapshot(command.viewId)),
        detachTerminalView: vi.fn(async () => undefined),
        getPathForFile: vi.fn(() => ''),
        openTerminalLink
      }
    })
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as typeof ResizeObserver
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })
    Reflect.deleteProperty(window, 'cleancode')
    vi.restoreAllMocks()
  })

  it('searches incrementally, navigates matches, and restores focus without stealing IME keys', async () => {
    const workspace = renderViewport()
    const terminal = await installedTerminal()
    const handler = terminal.customKeyEventHandler
    const composing = new KeyboardEvent('keydown', { key: 'f', metaKey: true })
    Object.defineProperty(composing, 'isComposing', { value: true })
    expect(handler?.(composing)).toBe(true)

    expect(
      handler?.(new KeyboardEvent('keydown', { cancelable: true, key: 'f', metaKey: true }))
    ).toBe(false)
    const input = await workspace.findByRole('searchbox', { name: '搜索终端输出' })
    const search = phaseTwoMockState.searchAddons[0]
    fireEvent.change(input, { target: { value: 'error' } })
    expect(search?.findNext).toHaveBeenLastCalledWith(
      'error',
      expect.objectContaining({ incremental: true })
    )
    act(() => search?.emit(0, 3))
    expect(workspace.getByText('1 / 3')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(search?.findPrevious).toHaveBeenCalledWith('error', expect.any(Object))
    terminal.focus.mockClear()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(terminal.focus).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit modifier before forwarding a recognized link', async () => {
    renderViewport()
    await installedTerminal()
    const links = phaseTwoMockState.webLinksAddons[0]
    links?.trigger(new MouseEvent('click'), 'https://example.com/')
    expect(openTerminalLink).not.toHaveBeenCalled()
    links?.trigger(new MouseEvent('click', { metaKey: true }), 'https://example.com/')
    await waitFor(() => expect(openTerminalLink).toHaveBeenCalledTimes(1))
    expect(openTerminalLink).toHaveBeenCalledWith(
      expect.objectContaining({ rawTarget: 'https://example.com/', viewId: expect.any(String) })
    )
  })

  it('confirms risky text and file paths while refusing image bytes', async () => {
    const onPaste = vi.fn(async () => undefined)
    const workspace = renderViewport(onPaste)
    await installedTerminal()
    const shell = workspace.container.querySelector<HTMLElement>('.terminal-output-shell')!

    fireEvent.paste(shell, { clipboardData: { files: [], getData: () => 'first\nsecond' } })
    await waitFor(() => expect(onPaste).toHaveBeenCalledWith(expect.any(Object), 'first\rsecond'))
    onPaste.mockClear()
    fireEvent.paste(shell, { clipboardData: { files: [], getData: () => 'unsafe\u001b[2J' } })
    expect(await workspace.findByRole('alertdialog')).toBeInTheDocument()
    expect(onPaste).not.toHaveBeenCalled()

    fireEvent.click(workspace.getByRole('button', { name: '继续粘贴' }))
    await waitFor(() => expect(onPaste).toHaveBeenCalledWith(expect.any(Object), 'unsafe\u001b[2J'))
    const image = new File(['bytes'], 'shot.png', { type: 'image/png' })
    fireEvent.paste(shell, { clipboardData: { files: [image], getData: () => '' } })
    expect(await workspace.findByRole('status')).toHaveTextContent('终端不接受图片数据')
  })
})

function renderViewport(onPaste = vi.fn(async () => undefined)) {
  return render(
    <TerminalSurfaceRegistryProvider registry={new TerminalSurfaceRegistry()}>
      <TerminalViewport
        block={terminalBlock()}
        session={runningState()}
        focusRequestId={0}
        onDimensionsChange={vi.fn()}
        onInput={vi.fn()}
        onPaste={onPaste}
      />
    </TerminalSurfaceRegistryProvider>
  )
}

async function installedTerminal(): Promise<FakeTerminal> {
  await waitFor(() => expect(phaseTwoMockState.terminals).toHaveLength(1))
  return phaseTwoMockState.terminals[0]!
}

function terminalBlock(): TerminalBlockSnapshot {
  return {
    id: 'terminal-1',
    type: 'terminal',
    name: 'Terminal 1',
    description: 'Local terminal',
    launchCommand: '',
    position: { x: 0, y: 0 },
    size: { width: 600, height: 320 }
  }
}

function runningState() {
  return {
    sessionId: 'session-1',
    status: 'running' as const,
    output: '',
    runIdentity: {
      projectId: 'project-1',
      workspaceName: 'main',
      blockId: 'terminal-1',
      sessionId: 'session-1',
      runId: 'run-1',
      generation: 1
    }
  }
}

function snapshot(viewId: string) {
  return {
    identity: {
      ...runningState().runIdentity,
      projectDirectory: '/work/app',
      workspaceDirectory: '/work/app',
      gitBranch: 'main'
    },
    sequence: 0,
    scrollbackRows: 1000,
    unicodeVersion: '11' as const,
    restoreMarker: { viewId, sequence: 0 },
    content: '',
    transcript: '',
    dimensions: { columns: 80, rows: 24 },
    title: '',
    workingDirectory: '/work/app',
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
