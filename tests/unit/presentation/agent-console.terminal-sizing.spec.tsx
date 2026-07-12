import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentSessionSnapshot } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

interface FakeAgentTerminal {
  cols: number
  rows: number
  readonly dispose: ReturnType<typeof vi.fn>
  readonly loadAddon: ReturnType<typeof vi.fn>
  readonly onData: ReturnType<typeof vi.fn>
  readonly onResize: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
  readonly reset: ReturnType<typeof vi.fn>
  readonly write: ReturnType<typeof vi.fn>
  resizeListener: ((dimensions: { cols: number; rows: number }) => void) | null
}

interface FakeFitAddon {
  terminal?: FakeAgentTerminal
  readonly fit: ReturnType<typeof vi.fn>
}

interface ControlledResizeObserver {
  disconnected: boolean
  readonly callback: ResizeObserverCallback
  target: Element | null
}

const sizingMockState = vi.hoisted(() => ({
  fitDimensions: { columns: 64, rows: 18 },
  animationFrames: [] as FrameRequestCallback[],
  resizeObservers: [] as ControlledResizeObserver[],
  terminals: [] as FakeAgentTerminal[]
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class FakeTerminal implements FakeAgentTerminal {
    cols = 88
    rows = 24
    resizeListener: ((dimensions: { cols: number; rows: number }) => void) | null = null

    readonly dispose = vi.fn()
    readonly open = vi.fn()
    readonly reset = vi.fn()
    readonly write = vi.fn()
    readonly loadAddon = vi.fn((addon: FakeFitAddon) => {
      addon.terminal = this
    })
    readonly onData = vi.fn(() => ({ dispose: vi.fn() }))
    readonly onResize = vi.fn((listener: (dimensions: { cols: number; rows: number }) => void) => {
      this.resizeListener = listener
      return { dispose: vi.fn() }
    })

    constructor() {
      sizingMockState.terminals.push(this)
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FakeFitAddonInstance implements FakeFitAddon {
    terminal?: FakeAgentTerminal

    readonly fit = vi.fn(() => {
      if (!this.terminal) return
      const next = sizingMockState.fitDimensions
      const changed = this.terminal.cols !== next.columns || this.terminal.rows !== next.rows
      this.terminal.cols = next.columns
      this.terminal.rows = next.rows
      if (changed) this.terminal.resizeListener?.({ cols: next.columns, rows: next.rows })
    })
  }
}))

describe('agent console terminal sizing', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined
  let originalUserAgent: string

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver
    originalUserAgent = navigator.userAgent
    sizingMockState.fitDimensions = { columns: 64, rows: 18 }
    sizingMockState.animationFrames = []
    sizingMockState.resizeObservers = []
    sizingMockState.terminals = []

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'cleancode desktop renderer'
    })
    globalThis.ResizeObserver = class StubResizeObserver {
      private readonly observer: ControlledResizeObserver

      constructor(callback: ResizeObserverCallback) {
        this.observer = { callback, disconnected: false, target: null }
        sizingMockState.resizeObservers.push(this.observer)
      }

      observe(target: Element): void {
        this.observer.target = target
      }
      unobserve(): void {}
      disconnect(): void {
        this.observer.disconnected = true
      }
    }
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      sizingMockState.animationFrames.push(callback)
      return sizingMockState.animationFrames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, 'ResizeObserver')
    }
  })

  it('waits for the current xterm surface to report valid dimensions before attaching its PTY', async () => {
    sizingMockState.fitDimensions = { columns: 0, rows: 0 }
    const attachAgentSession = vi.fn(async () => createAgentSession('agent-main', 'main'))
    installRuntime(attachAgentSession)

    render(<AppShell />)

    await waitFor(() => expect(sizingMockState.terminals).toHaveLength(1))
    expect(attachAgentSession).not.toHaveBeenCalled()

    sizingMockState.fitDimensions = { columns: 71, rows: 22 }
    triggerTerminalResize()

    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenCalledWith(
        expect.objectContaining({ columns: 71, rows: 22, workspaceName: 'main' })
      )
    )
  })

  it('synchronizes the latest xterm dimensions when they change while attach is pending', async () => {
    const pendingSession = createDeferred<AgentSessionSnapshot>()
    const attachAgentSession = vi.fn(() => pendingSession.promise)
    const resizeAgentSession = vi.fn(async () => undefined)
    installRuntime(attachAgentSession, resizeAgentSession)

    render(<AppShell />)

    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenCalledWith(
        expect.objectContaining({ columns: 64, rows: 18 })
      )
    )
    sizingMockState.fitDimensions = { columns: 73, rows: 21 }
    triggerTerminalResize()
    expect(resizeAgentSession).not.toHaveBeenCalled()

    pendingSession.resolve(createAgentSession('agent-main', 'main'))

    await waitFor(() =>
      expect(resizeAgentSession).toHaveBeenCalledWith({
        columns: 73,
        rows: 21,
        sessionId: 'agent-main'
      })
    )
  })

  it('coalesces repeated fits without attaching another PTY or repeating the same resize', async () => {
    const attachAgentSession = vi.fn(async () => createAgentSession('agent-main', 'main'))
    const resizeAgentSession = vi.fn(async () => undefined)
    installRuntime(attachAgentSession, resizeAgentSession)

    render(<AppShell />)

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(1))
    triggerTerminalResize()
    expect(resizeAgentSession).not.toHaveBeenCalled()

    sizingMockState.fitDimensions = { columns: 76, rows: 23 }
    triggerTerminalResize(2)

    await waitFor(() =>
      expect(resizeAgentSession).toHaveBeenCalledWith({
        columns: 76,
        rows: 23,
        sessionId: 'agent-main'
      })
    )
    expect(resizeAgentSession).toHaveBeenCalledTimes(1)
    expect(attachAgentSession).toHaveBeenCalledTimes(1)
  })

  it('never binds a late attach result from the previous workspace to the current xterm surface', async () => {
    const mainSession = createDeferred<AgentSessionSnapshot>()
    const attachAgentSession = vi
      .fn()
      .mockImplementationOnce(() => mainSession.promise)
      .mockResolvedValueOnce(createAgentSession('agent-feature', 'feature'))
    const resizeAgentSession = vi.fn(async () => undefined)
    const mainWorkbench = createWorkbenchSnapshot('/repo/app', 'app', {
      workspaces: [
        { directory: '/repo/app', gitBranch: 'main', isCurrent: true, name: 'main' },
        {
          directory: '/repo/app-worktrees/feature',
          gitBranch: 'feature',
          isCurrent: false,
          name: 'feature'
        }
      ]
    })
    const featureWorkbench = {
      ...mainWorkbench,
      graph: { ...mainWorkbench.graph, workspaceName: 'feature' },
      project: {
        ...mainWorkbench.project,
        workspaces: mainWorkbench.project.workspaces.map((workspace) => ({
          ...workspace,
          isCurrent: workspace.name === 'feature'
        }))
      }
    }
    installRuntime(attachAgentSession, resizeAgentSession, {
      listWorkbenches: vi.fn(async () => [mainWorkbench]),
      switchBranchWorkspace: vi.fn(async () => featureWorkbench)
    })

    render(<AppShell />)

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole('button', { name: 'feature 独立工作区' }))
    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(2))
    mainSession.resolve(createAgentSession('agent-main', 'main'))
    sizingMockState.fitDimensions = { columns: 78, rows: 24 }
    triggerTerminalResize()

    await waitFor(() =>
      expect(resizeAgentSession).toHaveBeenLastCalledWith({
        columns: 78,
        rows: 24,
        sessionId: 'agent-feature'
      })
    )
    expect(resizeAgentSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'agent-main' })
    )
  })
})

function installRuntime(
  attachAgentSession: ReturnType<typeof vi.fn>,
  resizeAgentSession = vi.fn(async () => undefined),
  overrides: Parameters<typeof createRuntimeApi>[0] = {}
): void {
  const workbench = createWorkbenchSnapshot('/repo/app', 'app')
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: createRuntimeApi({
      attachAgentSession,
      listWorkbenches: vi.fn(async () => [workbench]),
      resizeAgentSession,
      ...overrides
    })
  })
}

function triggerTerminalResize(times = 1): void {
  act(() => {
    for (let index = 0; index < times; index += 1) {
      sizingMockState.resizeObservers
        .filter(
          (observer) =>
            !observer.disconnected && observer.target?.classList.contains('agent-terminal-viewport')
        )
        .forEach((observer) => observer.callback([], observer as unknown as ResizeObserver))
    }
    const frames = sizingMockState.animationFrames.splice(0)
    frames.forEach((frame) => frame(0))
  })
}

function createAgentSession(sessionId: string, workspaceName: string): AgentSessionSnapshot {
  return {
    agentId: 'default-agent',
    codexThreadId: null,
    gitBranch: workspaceName === 'main' ? null : workspaceName,
    processId: 42,
    projectDirectory: '/repo/app',
    projectId: 'project-app',
    sessionId,
    status: 'running',
    workspaceDirectory:
      workspaceName === 'main' ? '/repo/app' : `/repo/app-worktrees/${workspaceName}`,
    workspaceName
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  resolve(value: T): void
} {
  let resolvePromise!: (value: T) => void
  return {
    promise: new Promise<T>((resolve) => {
      resolvePromise = resolve
    }),
    resolve: resolvePromise
  }
}
