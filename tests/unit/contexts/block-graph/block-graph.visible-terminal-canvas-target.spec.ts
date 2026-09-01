import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveVisibleTerminalCanvasTarget } from '../../../../src/contexts/block-graph/presentation/view-models/visibleTerminalCanvasTarget'

describe('visible terminal canvas target', () => {
  it('keeps a visible terminal as the navigation target', () => {
    expect(resolveVisibleTerminalCanvasTarget(createGraph(false), 'terminal-a')).toEqual({
      nodeId: 'terminal-a',
      objectId: 'terminal-a',
      objectKind: 'terminal'
    })
  })

  it('uses the visible group when the terminal is inside a collapsed combination', () => {
    expect(resolveVisibleTerminalCanvasTarget(createGraph(true), 'terminal-a')).toEqual({
      nodeId: 'group-1',
      objectId: 'group-1',
      objectKind: 'terminal-group'
    })
  })

  it('does not redirect a missing terminal to another canvas object', () => {
    expect(resolveVisibleTerminalCanvasTarget(createGraph(false), 'missing')).toBeNull()
  })
})

function createGraph(isCollapsed: boolean): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      {
        id: 'terminal-a',
        type: 'terminal',
        name: 'Terminal A',
        description: '',
        launchCommand: 'pnpm dev',
        position: { x: 0, y: 0 },
        size: { width: 320, height: 240 }
      }
    ],
    connections: [],
    terminalGroups: [
      {
        id: 'group-1',
        type: 'terminal-group',
        name: 'Group 1',
        position: { x: -20, y: -20 },
        size: { width: 360, height: 280 },
        isCollapsed,
        memberBlockIds: ['terminal-a']
      }
    ]
  }
}
