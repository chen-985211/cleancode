import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('canvas-aware terminal placement', () => {
  it('fills an existing canvas gap without expanding the occupied bounds', () => {
    const graph = createGraph()
    createTerminal(graph, 'left', { x: 0, y: 0 })
    createTerminal(graph, 'right', { x: 968, y: 0 })
    createTerminal(graph, 'target', { x: 0, y: 800 })

    graph.arrangeTerminalLayout({
      blockIds: ['target'],
      canvasRegions: [region(-420, 0, 420, 240)]
    })

    expect(readPosition(graph, 'target')).toEqual({ x: 484, y: 0 })
  })

  it('places a wide combination beside existing content when that expands the canvas less', () => {
    const graph = createGraph()
    createTerminal(graph, 'interactive-shell', { x: 0, y: 0 })
    createTerminal(graph, 'local-build', { x: 0, y: 320 })
    createTerminal(graph, 'check-app', { x: 0, y: 640 })
    createTerminal(graph, 'build-app', { x: 0, y: 960 })
    createTerminal(graph, 'start-app', { x: 0, y: 1_280 })
    graph.connectTerminalBlocks({
      id: 'check-build',
      sourceBlockId: 'check-app',
      targetBlockId: 'build-app'
    })
    graph.connectTerminalBlocks({
      id: 'build-start',
      sourceBlockId: 'build-app',
      targetBlockId: 'start-app'
    })
    graph.createTerminalGroup({
      id: 'development-group',
      memberBlockIds: ['interactive-shell', 'local-build', 'check-app', 'build-app', 'start-app'],
      name: 'Development'
    })

    graph.arrangeTerminalLayout({
      blockIds: ['interactive-shell', 'local-build', 'check-app', 'build-app', 'start-app'],
      canvasRegions: [region(500, 100, 600, 400)]
    })

    expect(graph.terminalGroups[0]).toMatchObject({
      position: { x: 74, y: 564 },
      size: { height: 1_672, width: 1_452 }
    })
  })

  it('searches around occupied canvas nodes instead of pushing only downward', () => {
    const graph = createGraph()
    createTerminal(graph, 'target', { x: 0, y: 0 })

    graph.arrangeTerminalLayout({
      blockIds: ['target'],
      canvasRegions: [
        region(0, 0, 420, 240),
        region(-484, 0, 420, 240),
        region(0, -65, 420, 1),
        region(0, 304, 420, 1)
      ]
    })

    expect(readPosition(graph, 'target')).toEqual({ x: 484, y: 0 })
  })
})

function createGraph(): BlockGraph {
  return BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
}

function createTerminal(
  graph: BlockGraph,
  id: string,
  position: { readonly x: number; readonly y: number }
): void {
  graph.createTerminalBlock({
    description: '',
    id,
    name: id,
    position,
    size: { height: 240, width: 420 }
  })
}

function readPosition(graph: BlockGraph, blockId: string) {
  return graph.blocks.find((block) => block.id === blockId)?.position
}

function region(x: number, y: number, width: number, height: number) {
  return { position: { x, y }, size: { height, width } }
}
