import { act, render, screen, waitFor } from '@testing-library/react'

import type {
  AgentPtyExitEvent,
  AgentSessionSnapshot
} from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import { installAgentXterm } from '../../../src/presentation/app-shell/agentTerminalXterm'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

interface ExpectedAgentTerminalSessionController {
  replaceSession(input: {
    readonly onBind: () => void
    readonly replayOutput: string
    readonly sessionId: string
    readonly terminalSourceTheme: 'dark' | 'light'
  }): Promise<void>
  write(data: string): void
}

interface ControllableTerminalInstance {
  cols: number
  element: HTMLElement | null
  rows: number
  readonly events: string[]
  readonly options: { theme?: Record<string, string> }
  readonly attachCustomKeyEventHandler: ReturnType<typeof vi.fn>
  readonly dispose: ReturnType<typeof vi.fn>
  readonly getSelection: ReturnType<typeof vi.fn>
  readonly hasSelection: ReturnType<typeof vi.fn>
  readonly loadAddon: ReturnType<typeof vi.fn>
  readonly onData: ReturnType<typeof vi.fn>
  readonly onResize: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
  readonly refresh: ReturnType<typeof vi.fn>
  readonly reset: ReturnType<typeof vi.fn>
  readonly write: ReturnType<typeof vi.fn>
  completeNextWrite(): void
}

interface ControllableFitAddonInstance {
  terminal?: ControllableTerminalInstance
  readonly fit: ReturnType<typeof vi.fn>
}

const terminalGenerationMockState = vi.hoisted(() => ({
  terminals: [] as ControllableTerminalInstance[]
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class ControllableTerminal implements ControllableTerminalInstance {
    cols = 88
    element: HTMLElement | null = null
    rows = 24
    readonly events: string[] = []
    readonly options: { theme?: Record<string, string> }
    private readonly pendingWriteCallbacks: Array<(() => void) | undefined> = []
    private openedElement: HTMLDivElement | null = null

    readonly attachCustomKeyEventHandler = vi.fn()
    readonly dispose = vi.fn()
    readonly getSelection = vi.fn(() => '')
    readonly hasSelection = vi.fn(() => false)
    readonly open = vi.fn((element: HTMLDivElement) => {
      this.openedElement = element
      this.element = document.createElement('div')
      element.append(this.element)
    })
    readonly refresh = vi.fn()
    readonly reset = vi.fn(() =>
      this.events.push(`reset:${this.openedElement?.dataset.agentTerminalSourceTheme}`)
    )
    readonly loadAddon = vi.fn((addon: ControllableFitAddonInstance) => {
      addon.terminal = this
    })
    readonly onData = vi.fn(() => ({ dispose: vi.fn() }))
    readonly onResize = vi.fn(() => ({ dispose: vi.fn() }))
    readonly write = vi.fn((data: string, callback?: () => void) => {
      this.events.push(`write:${data}`)
      this.pendingWriteCallbacks.push(callback)
    })

    constructor(input: { theme?: Record<string, string> }) {
      let theme = input.theme
      this.options = {}
      Object.defineProperty(this.options, 'theme', {
        configurable: true,
        get: () => theme,
        set: (nextTheme: Record<string, string>) => {
          theme = nextTheme
          this.events.push('palette')
        }
      })
      terminalGenerationMockState.terminals.push(this)
    }

    completeNextWrite(): void {
      this.pendingWriteCallbacks.shift()?.()
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class ControllableFitAddon implements ControllableFitAddonInstance {
    terminal?: ControllableTerminalInstance
    readonly fit = vi.fn()
  }
}))

describe('Agent terminal session generation', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined

  beforeEach(() => {
    terminalGenerationMockState.terminals = []
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'cleancode')
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, 'ResizeObserver')
    }
  })

  it('waits for old writes and commits only the latest replacement generation', async () => {
    const element = document.createElement('div')
    const runtimeRef = { current: null }
    const dispose = installAgentXterm({
      element,
      initialOutput: '',
      onDimensionsChange: vi.fn(),
      onInput: vi.fn(),
      xtermRef: runtimeRef as unknown as Parameters<typeof installAgentXterm>[0]['xtermRef']
    })
    const terminal = terminalGenerationMockState.terminals[0]!
    const controller = runtimeRef.current as unknown as ExpectedAgentTerminalSessionController

    try {
      expect(controller?.replaceSession).toBeTypeOf('function')
      expect(controller?.write).toBeTypeOf('function')

      controller.write('old-generation-write')
      terminal.events.length = 0
      const replacementS2 = controller.replaceSession({
        onBind: () => terminal.events.push('bind:S2'),
        replayOutput: 'tail:S2',
        sessionId: 'S2',
        terminalSourceTheme: 'dark'
      })
      const replacementS3 = controller.replaceSession({
        onBind: () => terminal.events.push('bind:S3'),
        replayOutput: 'tail:S3',
        sessionId: 'S3',
        terminalSourceTheme: 'light'
      })

      await Promise.resolve()
      expect(terminal.events).toEqual([])

      terminal.completeNextWrite()
      await vi.waitFor(() => expect(terminal.events).toContain('write:tail:S3'))

      expect(terminal.events).not.toContain('bind:S2')
      expect(terminal.events).not.toContain('write:tail:S2')
      const resetIndex = terminal.events.indexOf('reset:light')
      expect(terminal.events.indexOf('palette')).toBeLessThan(resetIndex)
      expect(terminal.events.slice(resetIndex)).toEqual(['reset:light', 'bind:S3', 'write:tail:S3'])

      terminal.completeNextWrite()
      await Promise.all([replacementS2, replacementS3])
    } finally {
      dispose()
    }
  })

  it('preserves an exit event that arrives before a delayed Agent session is bound', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    let exitListener: (event: AgentPtyExitEvent) => void = () => undefined
    let resolveAttach: (session: AgentSessionSnapshot) => void = () => undefined
    const pendingAttach = new Promise<AgentSessionSnapshot>((resolve) => {
      resolveAttach = resolve
    })
    const attachAgentSession = vi.fn(
      (command: Parameters<NonNullable<typeof window.cleancode>['attachAgentSession']>[0]) => {
        void command
        return pendingAttach
      }
    )

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        inspectCodexCli: vi.fn(async () => ({
          status: 'installed',
          version: 'codex-cli test'
        })),
        listWorkbenches: vi.fn(async () => [workbench]),
        onAgentPtyExit: vi.fn((listener: (event: AgentPtyExitEvent) => void) => {
          exitListener = listener
          return vi.fn()
        })
      })
    })

    render(<AppShell />)
    await waitFor(() => expect(attachAgentSession).toHaveBeenCalled())
    const command = attachAgentSession.mock.calls[0]![0]
    const session: AgentSessionSnapshot = {
      agentId: command.agentId,
      codexThreadId: null,
      gitBranch: command.gitBranch ?? null,
      processId: 41,
      projectDirectory: command.projectDirectory,
      projectId: command.projectId,
      sessionId: 'agent-session-exited-before-bind',
      status: 'running',
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName
    }

    await act(async () => {
      exitListener({ agentId: session.agentId, exitCode: 0, sessionId: session.sessionId })
      resolveAttach(session)
      await pendingAttach
    })

    expect(await screen.findByText('Codex 会话已结束')).toBeInTheDocument()
  })
})
