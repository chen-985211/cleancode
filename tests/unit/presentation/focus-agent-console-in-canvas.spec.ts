import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { focusAgentConsoleInCanvas } from '../../../src/presentation/app-shell/workbench/viewport/focusAgentConsoleInCanvas'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'

describe('focus Agent console in canvas', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the Agent layout before its flow node exists and clears sibling selections', () => {
    const setViewport = vi.fn<(viewport: Viewport) => Promise<boolean>>(async () => true)
    const setSelectedAgentId = vi.fn()
    const setSelectedTerminalBlockIds = vi.fn()
    const setSelectedTerminalGroupId = vi.fn()
    const setHoveredTerminalBlockId = vi.fn()

    focusAgentConsoleInCanvas({
      agent: createAgent(),
      reactFlowInstance: createReactFlowInstance(setViewport),
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      setHoveredTerminalBlockId
    })

    expect(setSelectedAgentId).toHaveBeenCalledWith('agent-2')
    expect(setSelectedTerminalBlockIds).toHaveBeenCalledWith([])
    expect(setSelectedTerminalGroupId).toHaveBeenCalledWith(null)
    expect(setHoveredTerminalBlockId).toHaveBeenCalledWith(null)
    const viewport = setViewport.mock.calls[0]![0] as unknown as {
      x: number
      y: number
      zoom: number
    }
    expect(viewport.x + 1260 * viewport.zoom).toBeCloseTo(480)
    expect(viewport.y + 470 * viewport.zoom).toBeCloseTo(320)
    expect(viewport.zoom).toBeGreaterThan(0.6)
    expect(720 * viewport.zoom).toBeLessThan(960)
    expect(460 * viewport.zoom).toBeLessThan(640)
  })
})

function createReactFlowInstance(
  setViewport: ReturnType<typeof vi.fn>
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  return {
    getNode: () => undefined,
    getViewport: () => ({ x: 0, y: 0, zoom: 0.6 }),
    getZoom: () => 0.6,
    setViewport
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}

function stubReducedMotionPreference(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  )
}

function createAgent(): WorkspaceAgentSnapshot {
  return {
    agentId: 'agent-2',
    cleancodeMcpEnabled: true,
    layout: {
      position: { x: 900, y: 240 },
      size: { width: 720, height: 460 }
    },
    name: 'Agent 2',
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'main'
  }
}
