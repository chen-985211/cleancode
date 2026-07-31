import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal layout in the default block graph', () => {
  it('places dependencies left to right and stacks the same layer with the actual terminal sizes', () => {
    const graph = createGraphWithSizedWorkflow()

    const result = graph.arrangeTerminalLayout({
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['test-terminal', 'api-terminal', 'install-terminal'],
      reservedRegions: []
    })

    expect(readPositions(graph)).toEqual({
      'api-terminal': { x: 278, y: 868 },
      'install-terminal': { x: 278, y: 564 },
      'test-terminal': { x: 902, y: 736 }
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

  it('keeps the arranged workflow below the agent while avoiding terminals, groups, and reserved regions', () => {
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
      anchorRegion: region(300, 100, 720, 460),
      blockIds: ['selected-terminal'],
      reservedRegions: [region(300, 624, 720, 180), region(300, 1270, 720, 200)]
    })

    expect(existingGroup.position).toEqual({ x: 268, y: 824 })
    expect(existingGroup.size).toEqual({ width: 968, height: 392 })
    expect(graph.blocks.find((block) => block.id === 'selected-terminal')?.position).toEqual({
      x: 450,
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
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['u-0', 'u-1', 'u-companion', 'v-0', 'v-1'],
      reservedRegions: [region(1100, 500, 300, 1500)]
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
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['test-terminal', 'install-terminal', 'api-terminal', 'workflow-companion'],
      reservedRegions: []
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
        position: { x: 4, y: 564 },
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
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c'],
      reservedRegions: []
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
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c', 'terminal-d'],
      reservedRegions: []
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
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['terminal-a', 'terminal-b', 'terminal-c', 'terminal-d', 'terminal-companion'],
      reservedRegions: []
    }

    const first = graph.arrangeTerminalLayout(input)
    const firstSnapshot = graph.toSnapshot()
    const second = graph.arrangeTerminalLayout(input)

    expect(first.graphChanged).toBe(true)
    expect(second.graphChanged).toBe(false)
    expect(graph.toSnapshot()).toEqual(firstSnapshot)
  })

  it('stabilizes cyclic cross-layer group precedence alongside an independent group', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    createTerminal(graph, 'a-root', 40, 40)
    createTerminal(graph, 'c-root', 40, 400)
    createTerminal(graph, 'c-child', 800, 40)
    createTerminal(graph, 'a-child', 800, 400)
    createTerminal(graph, 'b-one', 1560, 40)
    createTerminal(graph, 'b-two', 1560, 400)
    graph.createTerminalGroup({
      id: 'group-a',
      name: 'Group A',
      memberBlockIds: ['a-root', 'a-child']
    })
    graph.createTerminalGroup({
      id: 'group-c',
      name: 'Group C',
      memberBlockIds: ['c-root', 'c-child']
    })
    graph.createTerminalGroup({
      id: 'group-b',
      name: 'Group B',
      memberBlockIds: ['b-one', 'b-two']
    })
    graph.connectTerminalBlocks({
      id: 'a-root-to-child',
      sourceBlockId: 'a-root',
      targetBlockId: 'a-child'
    })
    graph.connectTerminalBlocks({
      id: 'c-root-to-child',
      sourceBlockId: 'c-root',
      targetBlockId: 'c-child'
    })
    graph.connectTerminalBlocks({
      id: 'a-child-to-b-one',
      sourceBlockId: 'a-child',
      targetBlockId: 'b-one'
    })
    graph.connectTerminalBlocks({
      id: 'c-child-to-b-two',
      sourceBlockId: 'c-child',
      targetBlockId: 'b-two'
    })
    const input = {
      anchorRegion: region(500, 100, 600, 400),
      blockIds: ['a-root', 'a-child', 'c-root', 'c-child', 'b-one', 'b-two'],
      reservedRegions: []
    }

    const first = graph.arrangeTerminalLayout(input)
    const firstSnapshot = graph.toSnapshot()
    const second = graph.arrangeTerminalLayout(input)

    expect(first.graphChanged).toBe(true)
    expect(second.graphChanged).toBe(false)
    expect(graph.toSnapshot()).toEqual(firstSnapshot)
  })

  it('stabilizes a multi-unit precedence cycle whose synthetic order is not observable in every layer', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    const terminals = [
      ['z-0', 40, 40],
      ['a-0', 40, 400],
      ['c-0', 40, 760],
      ['c-1', 800, 40],
      ['b-1', 800, 400],
      ['b-2', 1560, 40],
      ['d-2', 1560, 400],
      ['d-3', 2320, 40],
      ['a-3', 2320, 400],
      ['z-4', 3080, 40],
      ['a-4', 3080, 400]
    ] as const
    const connections = [
      ['z-0-to-c-1', 'z-0', 'c-1'],
      ['a-0-to-b-1', 'a-0', 'b-1'],
      ['c-1-to-b-2', 'c-1', 'b-2'],
      ['b-1-to-d-2', 'b-1', 'd-2'],
      ['b-2-to-d-3', 'b-2', 'd-3'],
      ['d-2-to-a-3', 'd-2', 'a-3'],
      ['d-3-to-z-4', 'd-3', 'z-4'],
      ['a-3-to-a-4', 'a-3', 'a-4']
    ] as const
    const groups = [
      ['group-z', ['z-0', 'z-4']],
      ['group-a', ['a-0', 'a-3', 'a-4']],
      ['group-c', ['c-0', 'c-1']],
      ['group-b', ['b-1', 'b-2']],
      ['group-d', ['d-2', 'd-3']]
    ] as const

    for (const [id, x, y] of terminals) createTerminal(graph, id, x, y)
    for (const [id, memberBlockIds] of groups) {
      graph.createTerminalGroup({ id, memberBlockIds, name: id })
    }
    for (const [id, sourceBlockId, targetBlockId] of connections) {
      graph.connectTerminalBlocks({ id, sourceBlockId, targetBlockId })
    }

    const input = {
      anchorRegion: region(500, 100, 600, 400),
      blockIds: terminals.map(([id]) => id),
      reservedRegions: []
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
        anchorRegion: region(500, 100, 600, 400),
        blockIds: ['install-terminal', 'test-terminal'],
        reservedRegions: []
      })
    ).toThrow('Terminal layout scope must contain every member of an included group.')
    expect(graph.toSnapshot()).toEqual(before)
  })

  it('rejects empty and unknown block scopes without changing the graph', () => {
    const graph = createGraphWithSizedWorkflow()
    const before = graph.toSnapshot()

    expect(() =>
      graph.arrangeTerminalLayout({
        anchorRegion: region(500, 100, 600, 400),
        blockIds: [],
        reservedRegions: []
      })
    ).toThrow('Terminal layout scope cannot be empty.')
    expect(() =>
      graph.arrangeTerminalLayout({
        anchorRegion: region(500, 100, 600, 400),
        blockIds: ['missing-terminal'],
        reservedRegions: []
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
