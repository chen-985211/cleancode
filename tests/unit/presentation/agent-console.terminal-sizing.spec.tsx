import { act, render, waitFor } from '@testing-library/react'

import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import type {
  TerminalSurface,
  TerminalSurfaceAttachment
} from '../../../src/presentation/app-shell/terminalSurfaceRegistry'
import { TerminalSurfaceRegistry } from '../../../src/presentation/app-shell/terminalSurfaceRegistry'
import { TerminalSurfaceRegistryProvider } from '../../../src/presentation/app-shell/TerminalSurfaceRegistryProvider'
import {
  createAgentSessionSnapshot,
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

const sizingMockState = vi.hoisted(() => ({ surfaces: [] as TerminalSurface[] }))

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
    sizingMockState.surfaces.push(surface)
    return surface
  })
}))

describe('Agent console terminal sizing', () => {
  const originalUserAgent = navigator.userAgent

  beforeEach(() => {
    sizingMockState.surfaces = []
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Chromium' })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })
    Reflect.deleteProperty(window, 'cleancode')
  })

  it('waits for the first visible grid measurement before attaching the Agent session', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const attachAgentSession = vi.fn(async (command) =>
      createAgentSessionSnapshot({
        agentId: command.agentId,
        gitBranch: command.gitBranch ?? null,
        projectDirectory: command.projectDirectory,
        projectId: command.projectId,
        providerId: command.providerId,
        sessionId: 'agent-session-1',
        terminalSourceTheme: command.terminalSourceTheme,
        workspaceDirectory: command.workspaceDirectory,
        workspaceId: command.workspaceId
      })
    )
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ attachAgentSession })
    })

    render(
      <TerminalSurfaceRegistryProvider registry={new TerminalSurfaceRegistry()}>
        <AgentConsole
          currentWorkbench={workbench}
          currentWorkspace={workbench.project.workspaces[0]}
        />
      </TerminalSurfaceRegistryProvider>
    )

    await waitFor(() => expect(sizingMockState.surfaces).toHaveLength(1))
    expect(attachAgentSession).not.toHaveBeenCalled()
    const measurementSurface = sizingMockState.surfaces[0]!
    const attachment = vi.mocked(measurementSurface.attach).mock
      .calls[0]![0] as TerminalSurfaceAttachment

    act(() => attachment.onDimensionsChange({ columns: 112, rows: 34 }))

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(1))
    expect(attachAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ columns: 112, rows: 34 })
    )
  })
})
