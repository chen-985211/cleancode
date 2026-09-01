import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveTerminalGroupDropAction } from '../../../../src/contexts/block-graph/presentation/view-models/terminalGroupDropTarget'

describe('terminal group drop target', () => {
  it('joins an ungrouped terminal whose center enters the edited group', () => {
    expect(
      resolveTerminalGroupDropAction({
        graph: createGraph(),
        draggedNode: createTerminalNode('worker', { x: 420, y: 260 }),
        editingTerminalGroupId: 'development',
        nodes: [createGroupNode()]
      })
    ).toEqual({ type: 'join-group', terminalGroupId: 'development' })
  })

  it('leaves the current group according to persisted group bounds', () => {
    const baseGraph = createGraph()
    const graph: BlockGraphSnapshot = {
      ...baseGraph,
      terminalGroups: [
        { ...baseGraph.terminalGroups[0]!, memberBlockIds: ['api', 'web', 'worker'] }
      ]
    }

    expect(
      resolveTerminalGroupDropAction({
        graph,
        draggedNode: createTerminalNode('worker', { x: 1_200, y: 260 }),
        editingTerminalGroupId: 'development',
        nodes: [createGroupNode()]
      })
    ).toEqual({ type: 'leave-group', terminalGroupId: 'development' })
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [createBlock('api'), createBlock('web'), createBlock('worker')],
    id: 'graph-1',
    projectId: 'project-1',
    terminalGroups: [
      {
        id: 'development',
        isCollapsed: false,
        memberBlockIds: ['api', 'web'],
        name: 'Development',
        position: { x: 300, y: 180 },
        size: { width: 760, height: 380 },
        type: 'terminal-group'
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}

function createBlock(id: string) {
  return {
    description: '',
    id,
    launchCommand: '',
    name: id,
    position: { x: 0, y: 0 },
    size: { width: 420, height: 306 },
    type: 'terminal' as const
  }
}

function createTerminalNode(id: string, position: { readonly x: number; readonly y: number }) {
  const block = createBlock(id)
  return { data: { block }, id, position, style: block.size, type: 'terminal' }
}

function createGroupNode() {
  const group = createGraph().terminalGroups[0]!
  return {
    data: { group },
    id: group.id,
    position: group.position,
    style: group.size,
    type: 'terminalGroup'
  }
}
