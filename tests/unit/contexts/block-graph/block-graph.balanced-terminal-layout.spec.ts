import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('balanced terminal layout', () => {
  it('packs independent terminals into a compact grid centered beneath the Agent', () => {
    const graph = createGraph()
    createTerminal(graph, 'terminal-a', 0)
    createTerminal(graph, 'terminal-b', 320)
    createTerminal(graph, 'terminal-c', 640)

    graph.arrangeTerminalLayout({
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c'],
      reservedRegions: []
    })

    expect(readPositions(graph)).toEqual({
      'terminal-a': { x: 348, y: 564 },
      'terminal-b': { x: 832, y: 564 },
      'terminal-c': { x: 590, y: 868 }
    })
  })

  it('keeps one dependency workflow together and places an independent terminal on another row', () => {
    const graph = createGraph()
    createTerminal(graph, 'install', 0)
    createTerminal(graph, 'start', 320)
    createTerminal(graph, 'test', 640)
    graph.connectTerminalBlocks({
      id: 'install-start',
      sourceBlockId: 'install',
      targetBlockId: 'start'
    })

    graph.arrangeTerminalLayout({
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['install', 'start', 'test'],
      reservedRegions: []
    })

    expect(readPositions(graph)).toEqual({
      install: { x: 348, y: 564 },
      start: { x: 832, y: 564 },
      test: { x: 590, y: 868 }
    })
  })

  it('centers a downstream terminal against a taller upstream dependency layer', () => {
    const graph = createGraph()
    createTerminal(graph, 'install', 0, { height: 240, width: 400 })
    createTerminal(graph, 'api', 320, { height: 300, width: 560 })
    createTerminal(graph, 'test', 640, { height: 260, width: 420 })
    graph.connectTerminalBlocks({
      id: 'install-test',
      sourceBlockId: 'install',
      targetBlockId: 'test'
    })
    graph.connectTerminalBlocks({
      id: 'api-test',
      sourceBlockId: 'api',
      targetBlockId: 'test'
    })

    graph.arrangeTerminalLayout({
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['install', 'api', 'test'],
      reservedRegions: []
    })

    expect(readPositions(graph)).toEqual({
      api: { x: 278, y: 868 },
      install: { x: 278, y: 564 },
      test: { x: 902, y: 736 }
    })
  })
})

function createGraph(): BlockGraph {
  return BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
}

function createTerminal(
  graph: BlockGraph,
  id: string,
  y: number,
  size = { height: 240, width: 420 }
): void {
  graph.createTerminalBlock({
    description: '',
    id,
    name: id,
    position: { x: 0, y },
    size
  })
}

function readPositions(graph: BlockGraph) {
  return Object.fromEntries(graph.blocks.map((block) => [block.id, block.position]))
}

function region(x: number, y: number, width: number, height: number) {
  return { position: { x, y }, size: { height, width } }
}
