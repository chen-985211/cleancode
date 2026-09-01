import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { projectWorkbenchObjectMotion } from '../../../src/presentation/app-shell/projections/workbenchObjectMotion'

describe('terminal workflow build object motion', () => {
  it('keeps an orchestrated terminal pending without inventing a second creation effect', () => {
    const pendingTerminal = withPresence(createTerminalNode(), 'pending')

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [],
      isContinuingGraph: true,
      nextNodes: [pendingTerminal],
      reducedMotion: false
    })

    expect(projection.nodes[0]?.data.objectMotion).toBeUndefined()
  })

  it('materializes an orchestrated terminal through the same atomic creation motion', () => {
    const terminal = createTerminalNode()

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [withPresence(terminal, 'pending')],
      isContinuingGraph: true,
      nextNodes: [withPresence(terminal, 'entering')],
      reducedMotion: false
    })

    expect(projection.nodes[0]?.data.objectMotion).toEqual({
      id: 'operation-1:terminal-1',
      kind: 'create',
      offset: { x: 0, y: 0 },
      scale: { from: 0, to: 1 }
    })
  })

  it('materializes an orchestrated group through the group atomic creation motion', () => {
    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [],
      isContinuingGraph: true,
      nextNodes: [withPresence(createGroupNode(), 'entering')],
      reducedMotion: false
    })

    expect(projection.nodes[0]?.data.objectMotion).toEqual({
      id: 'operation-1:group-1',
      kind: 'create',
      offset: { x: 0, y: 0 }
    })
  })
})

function withPresence(node: WorkbenchFlowNode, phase: 'pending' | 'entering'): WorkbenchFlowNode {
  return {
    ...node,
    data: {
      ...node.data,
      objectPresence: { id: `operation-1:${node.id}`, phase }
    }
  } as WorkbenchFlowNode
}

function createTerminalNode(): WorkbenchFlowNode {
  return {
    data: {
      block: {
        id: 'terminal-1',
        position: { x: 640, y: 360 },
        size: { height: 100, width: 200 }
      }
    },
    id: 'terminal-1',
    position: { x: 640, y: 360 },
    style: { height: 100, width: 200 },
    type: 'terminal'
  } as unknown as WorkbenchFlowNode
}

function createGroupNode(): WorkbenchFlowNode {
  return {
    data: {
      group: {
        id: 'group-1',
        isCollapsed: false,
        memberBlockIds: [],
        position: { x: 640, y: 360 },
        size: { height: 360, width: 640 }
      }
    },
    id: 'group-1',
    position: { x: 640, y: 360 },
    style: { height: 360, width: 640 },
    type: 'terminalGroup'
  } as unknown as WorkbenchFlowNode
}

function createMotionId(kind: string, nodeId: string): string {
  return `${kind}:${nodeId}`
}
