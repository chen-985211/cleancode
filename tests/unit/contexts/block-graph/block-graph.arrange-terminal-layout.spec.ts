import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal layout in the default block graph', () => {
  it('places dependencies left to right and stacks the same layer with the actual terminal sizes', () => {
    const graph = createGraphWithSizedWorkflow()

    const result = graph.arrangeTerminalLayout({
      blockIds: ['test-terminal', 'api-terminal', 'install-terminal'],
      canvasRegions: [region(500, 100, 600, 400)]
    })

    expect(readPositions(graph)).toEqual({
      'api-terminal': { x: 1_164, y: 302 },
      'install-terminal': { x: 1_164, y: -2 },
      'test-terminal': { x: 1_788, y: 170 }
    })
    expect(readSizes(graph)).toEqual({
      'api-terminal': { width: 560, height: 300 },
      'install-terminal': { width: 400, height: 240 },
      'test-terminal': { width: 420, height: 260 }
    })
    expect(result).toEqual({
      arrangedBlockIds: ['install-terminal', 'api-terminal', 'test-terminal'],
      arrangedTerminalGroupIds: [],
      graphChanged: true
    })
  })

  it('keeps the arranged workflow clear of terminals, groups, and reserved regions', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    graph.createTerminalBlock({
      id: 'selected-terminal',
      name: 'Selected',
      description: '',
      position: { x: 0, y: 0 },
      size: { width: 420, height: 240 }
    })
    graph.createTerminalBlock({
      id: 'existing-a',
      name: 'Existing A',
      description: '',
      position: { x: 300, y: 900 },
      size: { width: 420, height: 240 }
    })
    graph.createTerminalBlock({
      id: 'existing-b',
      name: 'Existing B',
      description: '',
      position: { x: 784, y: 900 },
      size: { width: 420, height: 240 }
    })
    const existingGroup = graph.createTerminalGroup({
      id: 'existing-group',
      name: 'Existing Group',
      memberBlockIds: ['existing-a', 'existing-b']
    })

    graph.arrangeTerminalLayout({
      blockIds: ['selected-terminal'],
      canvasRegions: [
        region(300, 100, 720, 460),
        region(300, 624, 720, 180),
        region(300, 1270, 720, 200)
      ]
    })

    expect(existingGroup.position).toEqual({ x: 268, y: 824 })
    expect(existingGroup.size).toEqual({ width: 968, height: 392 })
    expect(graph.blocks.find((block) => block.id === 'selected-terminal')?.position).toEqual({
      x: 542,
      y: 1534
    })
  })

  it('preserves same-layer unit order when an earlier cross-layer group is pushed by an obstacle', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    createTerminal(graph, 'u-0', 40, 40)
    createTerminal(graph, 'u-1', 800, 40)
    createTerminal(graph, 'u-companion', 40, 40)
    createTerminal(graph, 'v-0', 40, 400)
    createTerminal(graph, 'v-1', 40, 760)
    graph.connectTerminalBlocks({
      id: 'u-0-to-u-1',
      sourceBlockId: 'u-0',
      targetBlockId: 'u-1'
    })
    graph.createTerminalGroup({
      id: 'group-u',
      memberBlockIds: ['u-0', 'u-1', 'u-companion'],
      name: 'Group U'
    })
    graph.createTerminalGroup({
      id: 'group-v',
      memberBlockIds: ['v-0', 'v-1'],
      name: 'Group V'
    })
    const input = {
      blockIds: ['u-0', 'u-1', 'u-companion', 'v-0', 'v-1'],
      canvasRegions: [region(500, 100, 600, 400), region(1100, 500, 300, 1500)]
    }

    graph.arrangeTerminalLayout(input)
    const firstSnapshot = graph.toSnapshot()
    const second = graph.arrangeTerminalLayout(input)
    const groupU = firstSnapshot.terminalGroups.find((group) => group.id === 'group-u')!
    const groupV = firstSnapshot.terminalGroups.find((group) => group.id === 'group-v')!

    expect(groupV.position.y).toBeGreaterThanOrEqual(groupU.position.y + groupU.size.height + 64)
    expect(second.graphChanged).toBe(false)
    expect(graph.toSnapshot()).toEqual(firstSnapshot)
  })

  it('recomputes complete terminal group bounds and is stable when the same layout is applied again', () => {
    const graph = createGraphWithSizedWorkflow()
    createTerminal(graph, 'workflow-companion', 40, 40)
    graph.createTerminalGroup({
      id: 'workflow-group',
      name: 'Workflow',
      memberBlockIds: ['install-terminal', 'api-terminal', 'test-terminal', 'workflow-companion']
    })
    const input = {
      blockIds: ['test-terminal', 'install-terminal', 'api-terminal', 'workflow-companion'],
      canvasRegions: [region(500, 100, 600, 400)]
    }

    const first = graph.arrangeTerminalLayout(input)
    const firstSnapshot = graph.toSnapshot()
    const second = graph.arrangeTerminalLayout(input)

    expect(first).toEqual({
      arrangedBlockIds: ['install-terminal', 'workflow-companion', 'api-terminal', 'test-terminal'],
      arrangedTerminalGroupIds: ['workflow-group'],
      graphChanged: true
    })
    expect(firstSnapshot.terminalGroups).toEqual([
      expect.objectContaining({
        id: 'workflow-group',
        position: { x: 1_164, y: -78 },
        size: { width: 1592, height: 756 }
      })
    ])
    expect(second).toEqual({ ...first, graphChanged: false })
    expect(graph.toSnapshot()).toEqual(firstSnapshot)
  })

  it('keeps a complete arranged group clear of an arranged ungrouped terminal', () => {
    const graph = createGraphWithFourSameLayerTerminals()
    graph.createTerminalGroup({
      id: 'startup-group',
      name: 'Startup',
      memberBlockIds: ['terminal-a', 'terminal-b']
    })

    graph.arrangeTerminalLayout({
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c'],
      canvasRegions: [region(500, 100, 600, 400)]
    })

    const snapshot = graph.toSnapshot()
    const group = snapshot.terminalGroups.find((candidate) => candidate.id === 'startup-group')!
    const terminal = snapshot.blocks.find((candidate) => candidate.id === 'terminal-c')!

    expect(terminal.position.y).toBeGreaterThanOrEqual(group.position.y + group.size.height + 64)
  })

  it('keeps multiple arranged terminal groups as separate visual units', () => {
    const graph = createGraphWithFourSameLayerTerminals()
    graph.createTerminalGroup({
      id: 'group-a',
      name: 'Group A',
      memberBlockIds: ['terminal-a', 'terminal-b']
    })
    graph.createTerminalGroup({
      id: 'group-b',
      name: 'Group B',
      memberBlockIds: ['terminal-c', 'terminal-d']
    })

    graph.arrangeTerminalLayout({
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c', 'terminal-d'],
      canvasRegions: [region(500, 100, 600, 400)]
    })

    const [firstGroup, secondGroup] = [...graph.terminalGroups].sort(
      (left, right) => left.position.y - right.position.y
    )

    expect(secondGroup.position.y).toBeGreaterThanOrEqual(
      firstGroup.position.y + firstGroup.size.height + 64
    )
  })

  it('stabilizes a cross-layer group and same-layer terminals in one arrangement', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    createTerminal(graph, 'terminal-a', 40, 40)
    createTerminal(graph, 'terminal-b', 40, 400)
    createTerminal(graph, 'terminal-d', 800, 40)
    createTerminal(graph, 'terminal-c', 800, 400)
    createTerminal(graph, 'terminal-companion', 40, 40)
    graph.connectTerminalBlocks({
      id: 'a-to-c',
      sourceBlockId: 'terminal-a',
      targetBlockId: 'terminal-c'
    })
    graph.connectTerminalBlocks({
      id: 'b-to-d',
      sourceBlockId: 'terminal-b',
      targetBlockId: 'terminal-d'
    })
    graph.createTerminalGroup({
      id: 'cross-layer-group',
      name: 'Cross layer',
      memberBlockIds: ['terminal-a', 'terminal-c', 'terminal-companion']
    })
    const input = {
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c', 'terminal-d', 'terminal-companion'],
      canvasRegions: [region(500, 100, 600, 400)]
    }

    const first = graph.arrangeTerminalLayout(input)
    const firstSnapshot = graph.toSnapshot()
    const second = graph.arrangeTerminalLayout(input)

    expect(first.graphChanged).toBe(true)
    expect(second.graphChanged).toBe(false)
    expect(graph.toSnapshot()).toEqual(firstSnapshot)
  })

  it('rejects a scope that contains only part of a terminal group without changing the graph', () => {
    const graph = createGraphWithSizedWorkflow()
    createTerminal(graph, 'workflow-companion', 40, 40)
    graph.createTerminalGroup({
      id: 'workflow-group',
      name: 'Workflow',
      memberBlockIds: ['install-terminal', 'workflow-companion']
    })
    const before = graph.toSnapshot()

    expect(() =>
      graph.arrangeTerminalLayout({
        blockIds: ['install-terminal', 'test-terminal'],
        canvasRegions: [region(500, 100, 600, 400)]
      })
    ).toThrow('Terminal layout scope must contain every member of an included group.')
    expect(graph.toSnapshot()).toEqual(before)
  })

  it('rejects empty and unknown block scopes without changing the graph', () => {
    const graph = createGraphWithSizedWorkflow()
    const before = graph.toSnapshot()

    expect(() =>
      graph.arrangeTerminalLayout({
        blockIds: [],
        canvasRegions: [region(500, 100, 600, 400)]
      })
    ).toThrow('Terminal layout scope cannot be empty.')
    expect(() =>
      graph.arrangeTerminalLayout({
        blockIds: ['missing-terminal'],
        canvasRegions: [region(500, 100, 600, 400)]
      })
    ).toThrow('Terminal block was not found.')
    expect(graph.toSnapshot()).toEqual(before)
  })
})

function createGraphWithSizedWorkflow(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  graph.createTerminalBlock({
    id: 'install-terminal',
    name: 'Install',
    description: '',
    position: { x: 40, y: 40 },
    size: { width: 400, height: 240 }
  })
  graph.createTerminalBlock({
    id: 'api-terminal',
    name: 'API',
    description: '',
    position: { x: 40, y: 400 },
    size: { width: 560, height: 300 }
  })
  graph.createTerminalBlock({
    id: 'test-terminal',
    name: 'Test',
    description: '',
    position: { x: 800, y: 40 },
    size: { width: 420, height: 260 }
  })
  graph.connectTerminalBlocks({
    id: 'install-test',
    sourceBlockId: 'install-terminal',
    targetBlockId: 'test-terminal'
  })
  graph.connectTerminalBlocks({
    id: 'api-test',
    sourceBlockId: 'api-terminal',
    targetBlockId: 'test-terminal'
  })

  return graph
}

function createGraphWithFourSameLayerTerminals(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })

  for (const [index, id] of ['terminal-a', 'terminal-b', 'terminal-c', 'terminal-d'].entries()) {
    graph.createTerminalBlock({
      id,
      name: id,
      description: '',
      position: { x: 40, y: 40 + index * 320 },
      size: { width: 420, height: 240 }
    })
  }

  return graph
}

function createTerminal(graph: BlockGraph, id: string, x: number, y: number): void {
  graph.createTerminalBlock({
    id,
    name: id,
    description: '',
    position: { x, y },
    size: { width: 420, height: 240 }
  })
}

function readPositions(graph: BlockGraph) {
  return Object.fromEntries(graph.blocks.map((block) => [block.id, block.position]))
}

function readSizes(graph: BlockGraph) {
  return Object.fromEntries(graph.blocks.map((block) => [block.id, block.size]))
}

function region(x: number, y: number, width: number, height: number) {
  return { position: { x, y }, size: { width, height } }
}
