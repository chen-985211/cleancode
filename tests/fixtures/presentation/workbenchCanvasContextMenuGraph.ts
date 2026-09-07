import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

export function createGraph(): BlockGraphSnapshot {
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
    ],
    quickExecutionSlots: [
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
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
