import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkspaceAgentSnapshot } from '../../../src/contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { focusAgentConsoleInCanvas } from '../../../src/presentation/app-shell/focusAgentConsoleInCanvas'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'

describe('focus Agent console in canvas', () => {
  it('uses the created Agent layout before its flow node exists and clears sibling selections', () => {
    const setCenter = vi.fn(async () => true)
    const setSelectedAgentId = vi.fn()
    const setSelectedTerminalBlockIds = vi.fn()
    const setSelectedTerminalGroupId = vi.fn()
    const setHoveredTerminalBlockId = vi.fn()

    focusAgentConsoleInCanvas({
      agent: createAgent(),
      reactFlowInstance: createReactFlowInstance(setCenter),
      setSelectedAgentId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      setHoveredTerminalBlockId
    })

    expect(setSelectedAgentId).toHaveBeenCalledWith('agent-2')
    expect(setSelectedTerminalBlockIds).toHaveBeenCalledWith([])
    expect(setSelectedTerminalGroupId).toHaveBeenCalledWith(null)
    expect(setHoveredTerminalBlockId).toHaveBeenCalledWith(null)
    expect(setCenter).toHaveBeenCalledWith(1_260, 470, {
      zoom: 0.9,
      duration: 220
    })
  })
})

function createReactFlowInstance(
  setCenter: ReturnType<typeof vi.fn>
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  return {
    getNode: () => undefined,
    getZoom: () => 0.6,
    setCenter
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
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
    workspaceName: 'main'
  }
}
