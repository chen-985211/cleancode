import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  isBlockTemplateSelectionModifier,
  resolveBlockTemplateSelectionBlockIds
} from '../../../src/presentation/app-shell/blockTemplateSelection'

describe('block template canvas selection', () => {
  it('uses Command on macOS and Ctrl on Windows or Linux', () => {
    expect(isBlockTemplateSelectionModifier({ ctrlKey: false, metaKey: true }, 'mac')).toBe(true)
    expect(isBlockTemplateSelectionModifier({ ctrlKey: true, metaKey: false }, 'mac')).toBe(false)
    expect(isBlockTemplateSelectionModifier({ ctrlKey: true, metaKey: false }, 'other')).toBe(true)
    expect(isBlockTemplateSelectionModifier({ ctrlKey: false, metaKey: true }, 'other')).toBe(false)
  })

  it('selects only terminal blocks fully enclosed by the lasso', () => {
    expect(
      resolveBlockTemplateSelectionBlockIds({
        graph: createGraph(),
        selection: { x: 90, y: 90, width: 250, height: 180 }
      })
    ).toEqual(['terminal-a'])
  })

  it('resolves an enclosed collapsed combination to all of its terminal members', () => {
    const graph = createGraph()
    graph.terminalGroups = [
      {
        id: 'group-1',
        type: 'terminal-group',
        name: 'Release',
        position: { x: 80, y: 60 },
        size: { width: 560, height: 360 },
        isCollapsed: true,
        memberBlockIds: ['terminal-a', 'terminal-b']
      }
    ]

    expect(
      resolveBlockTemplateSelectionBlockIds({
        graph,
        selection: { x: 80, y: 60, width: 360, height: 160 }
      })
    ).toEqual(['terminal-a', 'terminal-b'])
  })
})

function createGraph(): BlockGraphSnapshot & {
  terminalGroups: BlockGraphSnapshot['terminalGroups']
} {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      {
        id: 'terminal-a',
        type: 'terminal',
        name: 'A',
        description: '',
        launchCommand: 'pnpm a',
        position: { x: 100, y: 100 },
        size: { width: 200, height: 120 }
      },
      {
        id: 'terminal-b',
        type: 'terminal',
        name: 'B',
        description: '',
        launchCommand: 'pnpm b',
        position: { x: 360, y: 100 },
        size: { width: 200, height: 120 }
      }
    ],
    connections: [],
    terminalGroups: []
  }
}
