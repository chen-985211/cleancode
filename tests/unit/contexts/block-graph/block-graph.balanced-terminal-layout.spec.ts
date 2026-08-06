import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('balanced terminal layout', () => {
  it('packs independent terminals into a compact grid beside the occupied canvas', () => {
    const graph = createGraph()
    createTerminal(graph, 'terminal-a', 0)
    createTerminal(graph, 'terminal-b', 320)
    createTerminal(graph, 'terminal-c', 640)

    graph.arrangeTerminalLayout({
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c'],
      canvasRegions: [region(500, 100, 600, 400)]
    })

    expect(readPositions(graph)).toEqual({
      'terminal-a': { x: 1_164, y: 28 },
      'terminal-b': { x: 1_648, y: 28 },
      'terminal-c': { x: 1_406, y: 332 }
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
      blockIds: ['install', 'start', 'test'],
      canvasRegions: [region(500, 100, 600, 400)]
    })

    expect(readPositions(graph)).toEqual({
      install: { x: 1_164, y: 28 },
      start: { x: 1_648, y: 28 },
      test: { x: 1_406, y: 332 }
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
      blockIds: ['install', 'api', 'test'],
      canvasRegions: [region(500, 100, 600, 400)]
    })

    expect(readPositions(graph)).toEqual({
      api: { x: 1_164, y: 302 },
      install: { x: 1_164, y: -2 },
      test: { x: 1_788, y: 170 }
    })
  })

  it('packs small execution units together instead of stretching a wide combination vertically', () => {
    const graph = createGraph()
    createTerminal(graph, 'interactive-shell', 0)
    createTerminal(graph, 'local-build', 320)
    createTerminal(graph, 'check-app', 640)
    createTerminal(graph, 'build-app', 960)
    createTerminal(graph, 'start-app', 1_280)
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

    expect(readPositions(graph)).toEqual({
      'build-app': { x: 590, y: 944 },
      'check-app': { x: 106, y: 944 },
      'interactive-shell': { x: 348, y: 640 },
      'local-build': { x: 832, y: 640 },
      'start-app': { x: 1_074, y: 944 }
    })
    expect(graph.terminalGroups[0]).toMatchObject({
      position: { x: 74, y: 564 },
      size: { height: 1_672, width: 1_452 }
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
