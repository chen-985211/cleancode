import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { focusAgentConsoleInCanvas } from '../../../src/presentation/app-shell/focusAgentConsoleInCanvas'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'

describe('focus Agent console in canvas', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the created Agent layout before its flow node exists and clears sibling selections', () => {
    const setViewport = vi.fn(async () => true)
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
    expect(setViewport).toHaveBeenCalledWith({ x: -654, y: -103, zoom: 0.9 }, { duration: 0 })
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
