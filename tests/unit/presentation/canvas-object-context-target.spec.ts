import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveCanvasObjectContextTarget } from '../../../src/presentation/app-shell/workbench/menus/canvasObjectContextTarget'

describe('canvas object context target', () => {
  const graph = createGraph()

  it('resolves an independent terminal without expanding its scope', () => {
    expect(
      resolveCanvasObjectContextTarget(graph, {
        nodeId: 'standalone',
        nodeType: 'terminal'
      })
    ).toEqual({
      kind: 'terminal',
      selectedConnectionIds: [],
      selectedNodeIds: ['standalone'],
      terminalBlockIds: ['standalone']
    })
  })

  it.each(['workflow-a', 'workflow-b', 'workflow-c'])(
    'resolves %s to the same complete workflow',
    (nodeId) => {
      expect(
        resolveCanvasObjectContextTarget(graph, {
          nodeId,
          nodeType: 'terminal'
        })
      ).toEqual({
        kind: 'workflow',
        selectedConnectionIds: ['connection-a-b', 'connection-b-c'],
        selectedNodeIds: ['workflow-a', 'workflow-b', 'workflow-c'],
        terminalBlockIds: ['workflow-a', 'workflow-b', 'workflow-c']
      })
    }
  )

  it('resolves a combination from its explicit group node and exact members', () => {
    expect(
      resolveCanvasObjectContextTarget(graph, {
        nodeId: 'combination',
        nodeType: 'terminalGroup'
      })
    ).toEqual({
      groupId: 'combination',
      kind: 'combination',
      selectedConnectionIds: [],
      selectedNodeIds: ['combination'],
      terminalBlockIds: ['combination-a', 'combination-b']
    })
  })

  it('resolves an Agent without inventing terminal actions', () => {
    expect(
      resolveCanvasObjectContextTarget(graph, {
        nodeId: 'agent:reviewer',
        nodeType: 'agentConsole'
      })
    ).toEqual({
      agentId: 'reviewer',
      kind: 'agent',
      selectedConnectionIds: [],
      selectedNodeIds: ['agent:reviewer']
    })
  })

  it.each([
    { nodeId: 'missing-terminal', nodeType: 'terminal' as const },
    { nodeId: 'missing-group', nodeType: 'terminalGroup' as const }
  ])('does not invent a context target for $nodeType $nodeId', (hit) => {
    expect(resolveCanvasObjectContextTarget(graph, hit)).toBeNull()
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      createBlock('workflow-a', 0),
      createBlock('workflow-b', 400),
      createBlock('workflow-c', 800),
      createBlock('standalone', 1200),
      createBlock('combination-a', 1600),
      createBlock('combination-b', 2000)
    ],
    connections: [
      {
        id: 'connection-a-b',
        sourceBlockId: 'workflow-a',
        targetBlockId: 'workflow-b'
      },
      {
        id: 'connection-b-c',
        sourceBlockId: 'workflow-b',
        targetBlockId: 'workflow-c'
      }
    ],
    terminalGroups: [
      {
        id: 'combination',
        type: 'terminal-group',
        name: 'Combination',
        position: { x: 1580, y: -20 },
        size: { width: 760, height: 340 },
        isCollapsed: false,
        memberBlockIds: ['combination-a', 'combination-b']
      }
    ]
  }
}

function createBlock(id: string, x: number): BlockGraphSnapshot['blocks'][number] {
  return {
    id,
    type: 'terminal',
    name: id,
    description: '',
    launchCommand: `pnpm ${id}`,
    position: { x, y: 0 },
    size: { width: 320, height: 240 }
  }
}
