import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { projectWorkbenchObjectMotion } from '../../../src/presentation/app-shell/projections/workbenchObjectMotion'

describe('workbench object canvas arrangement motion', () => {
  it('projects grid moves with distance-aware dynamics and no cascade delay', () => {
    const currentTerminal = createTerminalNode('terminal-1', { x: 100, y: 120 })
    const nextTerminal = createTerminalNode('terminal-1', { x: 900, y: 220 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId: (kind, nodeId) => `${kind}:${nodeId}`,
      currentNodes: [currentTerminal],
      canvasArrangementMotion: {
        delayByNodeId: { 'terminal-1': 0 },
        kind: 'grid'
      },
      isCanvasArrangementPending: true,
      isContinuingGraph: true,
      nextNodes: [nextTerminal],
      reducedMotion: false
    })

    expect(projection.nodes[0]?.data.objectMotion).toEqual({
      id: 'canvas-arrange:terminal-1',
      kind: 'canvas-arrange',
      offset: { x: -800, y: -100 },
      positionDynamics: 'grid'
    })
  })
})

function createTerminalNode(
  id: string,
  position: { readonly x: number; readonly y: number }
): WorkbenchFlowNode {
  return {
    data: {
      block: {
        id,
        position,
        size: { height: 100, width: 200 }
      }
    },
    id,
    position,
    style: { height: 100, width: 200 },
    type: 'terminal'
  } as unknown as WorkbenchFlowNode
}
