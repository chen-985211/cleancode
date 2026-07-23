import { act, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'

import type { AgentSessionSnapshot } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { TerminalSnapshot } from '../../../src/contexts/run/application/dto/TerminalModelSnapshot'
import type {
  TerminalSurface,
  TerminalSurfaceAttachment
} from '../../../src/presentation/app-shell/terminalSurfaceRegistry'
import { TerminalSurfaceRegistry } from '../../../src/presentation/app-shell/terminalSurfaceRegistry'
import { TerminalSurfaceRegistryProvider } from '../../../src/presentation/app-shell/TerminalSurfaceRegistryProvider'
import { useAgentTerminalView } from '../../../src/presentation/app-shell/useAgentTerminalView'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

const terminalViewMockState = vi.hoisted(() => ({ surfaces: [] as TerminalSurface[] }))

vi.mock('../../../src/presentation/app-shell/terminalXtermSurface', () => ({
  createTerminalXtermSurface: vi.fn(() => {
    const surface = {
      attach: vi.fn(),
      clearSearch: vi.fn(),
      detach: vi.fn(),
      dispose: vi.fn(),
      find: vi.fn(),
      focus: vi.fn(),
      getDiagnostics: vi.fn(() => ({ pendingOutputBytes: 0, rendererState: 'dom' })),
      isBracketedPasteMode: vi.fn(() => false),
      restore: vi.fn(async () => 'ready'),
      setResizeSuspended: vi.fn(),
      setScrollbackRows: vi.fn(),
      write: vi.fn()
    } as unknown as TerminalSurface
    terminalViewMockState.surfaces.push(surface)
    return surface
  })
}))

describe('Agent shared terminal view', () => {
  beforeEach(() => {
    terminalViewMockState.surfaces = []
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'cleancode')
  })

  it('uses the Run view protocol for restore, sequenced output, input, resize, and cleanup', async () => {
    const registry = new TerminalSurfaceRegistry(undefined, () => 'agent-view-1')
    const attachTerminalView = vi.fn(async (command) => createSnapshot(command.viewId))
    const detachTerminalView = vi.fn(async () => undefined)
    const resizeAgentSession = vi.fn(async () => undefined)
    const writeAgentSession = vi.fn(async () => undefined)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        ...createRuntimeApi({ resizeAgentSession, writeAgentSession }),
        attachTerminalView,
        detachTerminalView
      }
    })

    const view = render(
      <TerminalSurfaceRegistryProvider registry={registry}>
        <Harness session={createSession()} />
      </TerminalSurfaceRegistryProvider>
    )

    await waitFor(() => expect(attachTerminalView).toHaveBeenCalledTimes(1))
    const surface = terminalViewMockState.surfaces[0]!
    const attachment = vi.mocked(surface.attach).mock.calls[0]![0] as TerminalSurfaceAttachment
    expect(attachTerminalView).toHaveBeenCalledWith({
      blockId: 'agent-1',
      generation: 3,
      owner: { id: 'agent-1', kind: 'agent' },
      projectId: 'project-1',
      runId: 'agent-terminal:agent-session-1',
      sessionId: 'terminal-session-1',
      viewId: 'agent-view-1',
      workspaceName: 'main'
    })
    expect(surface.restore).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'restored output', sequence: 4 })
    )

    act(() => {
      attachment.onInput('\x03')
      attachment.onDimensionsChange({ columns: 104, rows: 31 })
      registry.write({
        output: { data: 'live output', sequence: 5 },
        scope: createSnapshotIdentity(),
        sessionId: 'terminal-session-1',
        viewId: 'agent-view-1'
      })
    })

    await waitFor(() =>
      expect(writeAgentSession).toHaveBeenCalledWith({
        input: '\x03',
        sessionId: 'agent-session-1'
      })
    )
    expect(resizeAgentSession).toHaveBeenCalledWith({
      columns: 104,
      rows: 31,
      sessionId: 'agent-session-1'
    })
    expect(surface.write).toHaveBeenCalledWith({ data: 'live output', sequence: 5 })

    const exitedSession = createSession()
    view.rerender(
      <TerminalSurfaceRegistryProvider registry={registry}>
        <Harness
          session={{
            ...exitedSession,
            runtime: {
              ...exitedSession.runtime,
              launch: { ...exitedSession.runtime.launch, exitCode: 0, status: 'exited' },
              revision: exitedSession.runtime.revision + 1
            }
          }}
        />
      </TerminalSurfaceRegistryProvider>
    )

    expect(attachTerminalView).toHaveBeenCalledTimes(1)
    expect(surface.detach).not.toHaveBeenCalled()

    view.unmount()
    await waitFor(() => expect(detachTerminalView).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(surface.dispose).toHaveBeenCalledTimes(1))
  })

  it('coalesces high-frequency terminal input inside one rendering frame', async () => {
    const registry = new TerminalSurfaceRegistry(undefined, () => 'agent-view-1')
    const writeAgentSession = vi.fn(async () => undefined)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        ...createRuntimeApi({ writeAgentSession }),
        attachTerminalView: vi.fn(async (command) => createSnapshot(command.viewId)),
        detachTerminalView: vi.fn(async () => undefined)
      }
    })
    const view = render(
      <TerminalSurfaceRegistryProvider registry={registry}>
        <Harness session={createSession()} />
      </TerminalSurfaceRegistryProvider>
    )
    await waitFor(() => expect(terminalViewMockState.surfaces).toHaveLength(1))
    const surface = terminalViewMockState.surfaces[0]!
    await waitFor(() => expect(surface.restore).toHaveBeenCalled())
    const attachment = vi.mocked(surface.attach).mock.calls[0]![0] as TerminalSurfaceAttachment

    vi.useFakeTimers()
    try {
      act(() => {
        attachment.onInput('\u001b[<64;10;5M')
        attachment.onInput('\u001b[<64;10;5M')
        attachment.onInput('\u001b[<65;10;5M')
      })
      expect(writeAgentSession).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16)
      })

      expect(writeAgentSession).toHaveBeenCalledOnce()
      expect(writeAgentSession).toHaveBeenCalledWith({
        input: '\u001b[<64;10;5M\u001b[<64;10;5M\u001b[<65;10;5M',
        sessionId: 'agent-session-1'
      })
    } finally {
      vi.useRealTimers()
      view.unmount()
    }
  })

  it('measures the visible grid before an Agent terminal identity exists', () => {
    const registry = new TerminalSurfaceRegistry(undefined, () => 'agent-view-1')
    const onDimensionsChange = vi.fn()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi()
    })

    const view = render(
      <TerminalSurfaceRegistryProvider registry={registry}>
        <Harness onDimensionsChange={onDimensionsChange} session={null} />
      </TerminalSurfaceRegistryProvider>
    )

    const surface = terminalViewMockState.surfaces[0]!
    const attachment = vi.mocked(surface.attach).mock.calls[0]![0] as TerminalSurfaceAttachment
    act(() => attachment.onDimensionsChange({ columns: 112, rows: 34 }))

    expect(onDimensionsChange).toHaveBeenCalledWith({ columns: 112, rows: 34 })
    view.unmount()
    expect(surface.detach).toHaveBeenCalledTimes(1)
    expect(surface.dispose).toHaveBeenCalledTimes(1)
  })
})

function Harness({
  onDimensionsChange = () => undefined,
  session
}: {
  readonly onDimensionsChange?: (dimensions: {
    readonly columns: number
    readonly rows: number
  }) => void
  readonly session: AgentSessionSnapshot | null
}) {
  const dimensionsRef = useRef(null)
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  useAgentTerminalView({
    dimensionsRef,
    enabled: true,
    onDimensionsChange,
    session,
    terminalElementRef,
    workspaceKey: 'project-1\0main\0\0agent-1'
  })
  return <div ref={terminalElementRef} />
}

function createSession(): AgentSessionSnapshot {
  return {
    agentId: 'agent-1',
    gitBranch: null,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    providerId: 'codex',
    providerSessionRef: null,
    runtime: {
      activity: { status: 'idle' },
      binding: { status: 'unbound' },
      launch: {
        exitCode: null,
        failureKind: null,
        generation: 1,
        launchId: 'launch-1',
        status: 'running'
      },
      mcp: { status: 'ready' },
      revision: 1,
      terminal: {
        exitCode: null,
        processId: 42,
        status: 'running',
        viewIdentity: {
          blockId: 'agent-1',
          generation: 3,
          owner: { id: 'agent-1', kind: 'agent' },
          projectId: 'project-1',
          runId: 'agent-terminal:agent-session-1',
          sessionId: 'terminal-session-1',
          workspaceName: 'main'
        }
      }
    },
    sessionId: 'agent-session-1',
    terminalSourceTheme: 'light',
    workspaceDirectory: '/repo/app',
    workspaceName: 'main'
  }
}

function createSnapshot(viewId: string): TerminalSnapshot {
  return {
    content: 'restored output',
    dimensions: { columns: 88, rows: 24 },
    identity: createSnapshotIdentity(),
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
    restoreMarker: { sequence: 4, viewId },
    scrollbackRows: 1000,
    sequence: 4,
    terminalSourceTheme: 'light',
    title: '',
    transcript: 'restored output',
    unicodeVersion: '11',
    workingDirectory: '/repo/app'
  }
}

function createSnapshotIdentity() {
  return {
    blockId: 'agent-1',
    generation: 3,
    gitBranch: null,
    owner: { id: 'agent-1', kind: 'agent' as const },
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    runId: 'agent-terminal:agent-session-1',
    sessionId: 'terminal-session-1',
    workspaceDirectory: '/repo/app',
    workspaceName: 'main'
  }
}
