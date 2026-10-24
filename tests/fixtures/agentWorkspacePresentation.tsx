import '@xterm/xterm/css/xterm.css'
import '../../src/presentation/app-shell/shell/AppShell.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import type {
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot
} from '../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { TerminalSnapshot } from '../../src/contexts/run/application/dto/TerminalModelSnapshot'
import { createTerminalRenderingServices } from '../../src/presentation/app-shell/context-adapters/run/terminalRenderingWorkloadCoordinator'
import {
  AgentWorkspacePresentationApp,
  type AgentWorkspace as Workspace
} from './agentWorkspacePresentationApp'
import type { WorkspaceAgentSnapshot } from '../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import {
  createAgentSessionSnapshot,
  createWorkbenchSnapshot
} from './presentation/appShellFixtures'

const services = createTerminalRenderingServices(2)
const registry = services.terminalSurfaceRegistry
const sessions = new Map<
  string,
  { session: AgentSessionSnapshot; dimensions: { columns: number; rows: number }; viewId: string }
>()
const originalElements = new Map<string, Element>()
const runtimeListeners = new Set<(event: AgentRuntimeChangedEvent) => void>()
const counts = { agentAttachments: 0, snapshots: 0, detaches: 0 }
const workspaces = ['first', 'second'] as const
const workbench = createWorkbenchSnapshot('/fixture', 'fixture', {
  workspaces: workspaces.map((workspaceId) => ({
    workspaceId,
    workspaceKind: 'default',
    displayName: workspaceId,
    directory: '/fixture',
    gitBranch: null,
    isCurrent: true
  }))
})
const agents = { first: createAgents('first'), second: createAgents('second') }

function createAgents(workspaceId: Workspace): readonly WorkspaceAgentSnapshot[] {
  return Array.from({ length: 6 }, (_, index) => ({
    agentId: `${workspaceId}-${index}`,
    projectId: workbench.project.id,
    workspaceId,
    providerId: 'fixture',
    name: `Agent ${index + 1}`,
    cleancodeMcpEnabled: false,
    layout: { position: { x: 0, y: 0 }, size: { width: 600, height: 360 } }
  }))
}

Object.defineProperty(window, 'cleancode', {
  configurable: true,
  value: {
    inspectAgentProvider: async () => ({
      providerId: 'fixture',
      status: 'installed',
      version: 'test'
    }),
    listAgentProviders: async () => [],
    onAgentRuntimeChanged: (listener: (event: AgentRuntimeChangedEvent) => void) => {
      runtimeListeners.add(listener)
      return () => runtimeListeners.delete(listener)
    },
    onAgentGraphUpdated: () => () => {},
    updateAgentSessionMetadata: async () => true,
    attachAgentSession: async (command: {
      agentId: string
      workspaceId: string
      columns: number
      rows: number
    }) => {
      counts.agentAttachments += 1
      const key = `session-${command.agentId}`
      const previous = sessions.get(key)
      if (previous) return previous.session
      const initial = createAgentSessionSnapshot()
      const session = createAgentSessionSnapshot({
        agentId: command.agentId,
        projectId: workbench.project.id,
        workspaceId: command.workspaceId,
        providerId: 'fixture',
        sessionId: key,
        projectDirectory: '/fixture',
        workspaceDirectory: '/fixture',
        terminalSourceTheme: 'dark',
        runtime: {
          ...initial.runtime,
          terminal: {
            ...initial.runtime.terminal,
            viewIdentity: {
              blockId: command.agentId,
              projectId: workbench.project.id,
              workspaceId: command.workspaceId,
              sessionId: `pty-${command.agentId}`,
              runId: `run-${command.agentId}`,
              generation: 1,
              owner: { kind: 'agent', id: command.agentId }
            }
          }
        }
      })
      sessions.set(key, {
        session,
        dimensions: { columns: command.columns, rows: command.rows },
        viewId: ''
      })
      return session
    },
    attachTerminalView: async (command: {
      blockId: string
      viewId: string
    }): Promise<TerminalSnapshot> => {
      counts.snapshots += 1
      const entry = sessions.get(`session-${command.blockId}`)!
      entry.viewId = command.viewId
      const rgb = entry.session.workspaceId === 'first' ? '0;128;0' : '0;0;192'
      const lines = Array.from(
        { length: entry.dimensions.rows },
        (_, index) => `\x1b[48;2;${rgb}m\x1b[2K${entry.session.agentId} latest ${index + 1}`
      ).join('\r\n')
      return {
        identity: {
          ...entry.session.runtime.terminal.viewIdentity!,
          projectDirectory: '/fixture',
          workspaceDirectory: '/fixture',
          gitBranch: null
        },
        sequence: 1,
        content: `\x1b[?25l${lines}`,
        dimensions: entry.dimensions,
        scrollbackRows: 1000,
        unicodeVersion: '11',
        terminalSourceTheme: 'dark',
        title: '',
        transcript: '',
        workingDirectory: '/fixture',
        restoreMarker: { viewId: command.viewId, sequence: 1 },
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
        }
      }
    },
    detachTerminalView: async () => {
      counts.detaches += 1
    },
    resizeAgentSession: async (command: { sessionId: string; columns: number; rows: number }) => {
      const entry = sessions.get(command.sessionId)
      if (entry) entry.dimensions = { columns: command.columns, rows: command.rows }
    },
    writeAgentSession: async () => {}
  }
})

document.documentElement.dataset.theme = 'dark'
document.body.style.margin = '16px'
const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    <AgentWorkspacePresentationApp agents={agents} registry={registry} workbench={workbench} />
  </StrictMode>
)

function readFrame() {
  const hosts = [
    ...document.querySelectorAll<HTMLElement>('[data-current-workspace] .agent-terminal-viewport')
  ]
  return hosts.map((host) => {
    const element = host.querySelector<HTMLElement>('.xterm')
    const key = host.dataset.agentTerminalAgentId ?? ''
    const entry = sessions.get(`session-${key}`)
    const canvas = [...host.querySelectorAll('canvas')].find((item) => item.getContext('webgl2'))
    const colors: number[][] = []
    if (canvas && entry) {
      const gl = canvas.getContext('webgl2')!
      for (let row = 0; row < entry.dimensions.rows; row += 1) {
        const pixel = new Uint8Array(4)
        gl.readPixels(
          Math.floor(canvas.width * 0.8),
          Math.floor((canvas.height * (row + 0.5)) / entry.dimensions.rows),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel
        )
        colors.push([...pixel])
      }
    }
    return {
      key,
      colors,
      text: host.querySelector('.xterm-rows')?.textContent ?? null,
      ready:
        host.dataset.terminalContentReady === 'true' &&
        element !== null &&
        getComputedStyle(element).opacity === '1',
      reused: originalElements.get(key) === element
    }
  })
}

const fixture = {
  state: () => ({
    counts: { ...counts },
    frames: readFrame(),
    diagnostics: registry.getDiagnostics()
  }),
  select: (workspace: Workspace) => document.getElementById(workspace)!.click(),
  remember: () => {
    for (const host of document.querySelectorAll<HTMLElement>(
      '[data-current-workspace] .agent-terminal-viewport'
    )) {
      originalElements.set(host.dataset.agentTerminalAgentId!, host.querySelector('.xterm')!)
    }
  },
  switchTo: async (workspace: Workspace) => {
    const startedAt = performance.now()
    const frames: ReturnType<typeof readFrame>[] = []
    let firstFrameMs = -1
    fixture.select(workspace)
    for (let index = 0; index < 20; index += 1) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          if (index === 0) firstFrameMs = performance.now() - startedAt
          frames.push(readFrame())
          resolve()
        })
      )
    }
    return {
      frames,
      firstFrameMs,
      observationMs: performance.now() - startedAt,
      counts: { ...counts }
    }
  },
  dispose: () => {
    root.unmount()
    registry.disposeAll()
    services.terminalZoomRasterCoordinator.dispose()
    services.terminalWorkloadScheduler.dispose()
  }
}
declare global {
  interface Window {
    agentWorkspacePresentation: typeof fixture
  }
}
window.agentWorkspacePresentation = fixture
