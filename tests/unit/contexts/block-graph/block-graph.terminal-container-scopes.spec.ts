import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal combination container scopes', () => {
  it('creates and preserves an empty combination at an explicit canvas position', () => {
    const graph = createGraph()

    graph.createTerminalGroup({
      id: 'empty-group',
      name: 'New combination',
      position: { x: 420, y: 260 }
    })

    expect(graph.toSnapshot().terminalGroups).toEqual([
      expect.objectContaining({
        id: 'empty-group',
        position: { x: 420, y: 260 },
        memberBlockIds: []
      })
    ])
  })

  it('keeps an empty combination anchored while absorbing a terminal into its content space', () => {
    const graph = createGraph()
    createTerminal(graph, 'shell', 1_600, 100)
    graph.createTerminalGroup({
      id: 'shell-space',
      name: 'Shell space',
      position: { x: 400, y: 300 }
    })

    graph.moveTerminalWorkflowToGroup('shell', 'shell-space', { x: 500, y: 360 })

    expect(graph.toSnapshot().blocks).toEqual([
      expect.objectContaining({ id: 'shell', position: { x: 432, y: 376 } })
    ])
    expect(graph.toSnapshot().terminalGroups).toEqual([
      expect.objectContaining({
        id: 'shell-space',
        position: { x: 400, y: 300 },
        size: { width: 784, height: 612 },
        memberBlockIds: ['shell']
      })
    ])
  })

  it('absorbs and releases a complete workflow as one rigid spatial unit', () => {
    const graph = createGraph()
    createTerminal(graph, 'install', 0, 0)
    createTerminal(graph, 'build', 800, 0)
    graph.connectTerminalBlocks({ sourceBlockId: 'install', targetBlockId: 'build' })
    graph.createTerminalGroup({
      id: 'build-space',
      name: 'Build space',
      position: { x: 400, y: 700 }
    })

    graph.moveTerminalWorkflowToGroup('build', 'build-space', { x: 500, y: 760 })

    expect(graph.toSnapshot().blocks).toEqual([
      expect.objectContaining({ id: 'install', position: { x: 432, y: 776 } }),
      expect.objectContaining({ id: 'build', position: { x: 1_216, y: 776 } })
    ])
    expect(graph.toSnapshot().terminalGroups[0]).toMatchObject({
      position: { x: 400, y: 700 },
      size: { width: 1_568, height: 612 },
      memberBlockIds: ['install', 'build']
    })

    graph.moveTerminalWorkflowToGroup('install', null, { x: 2_000, y: 300 })

    expect(graph.toSnapshot().blocks).toEqual([
      expect.objectContaining({ id: 'install', position: { x: 2_000, y: 300 } }),
      expect.objectContaining({ id: 'build', position: { x: 2_784, y: 300 } })
    ])
    expect(graph.toSnapshot().terminalGroups[0]).toMatchObject({
      position: { x: 400, y: 700 },
      memberBlockIds: []
    })
  })

  it('allows one terminal or one complete workflow to be the only member', () => {
    const graph = createGraph()
    createTerminal(graph, 'install', 100, 120)
    createTerminal(graph, 'build', 900, 120)
    graph.connectTerminalBlocks({ sourceBlockId: 'install', targetBlockId: 'build' })

    graph.createTerminalGroup({
      id: 'workflow-group',
      name: 'Build',
      memberBlockIds: ['build']
    })

    expect(graph.toSnapshot().terminalGroups[0]?.memberBlockIds).toEqual(['install', 'build'])
  })

  it('keeps the combination when its last terminal is deleted', () => {
    const graph = createGraph()
    createTerminal(graph, 'shell', 240, 200)
    graph.createTerminalGroup({
      id: 'shell-group',
      name: 'Shell space',
      memberBlockIds: ['shell']
    })

    graph.deleteBlock('shell')

    expect(graph.toSnapshot().terminalGroups).toEqual([
      expect.objectContaining({ id: 'shell-group', memberBlockIds: [] })
    ])
  })

  it('allows connections only when both endpoints share the same container scope', () => {
    const graph = createGraph()
    for (const [id, x] of [
      ['root-a', 0],
      ['root-b', 800],
      ['group-a', 1_600],
      ['group-b', 2_400]
    ] as const) {
      createTerminal(graph, id, x, 100)
    }
    graph.createTerminalGroup({ id: 'group', name: 'Inside', memberBlockIds: ['group-a'] })
    graph.createTerminalGroup({ id: 'other-group', name: 'Other', memberBlockIds: ['group-b'] })

    expect(() =>
      graph.connectTerminalBlocks({ sourceBlockId: 'root-a', targetBlockId: 'group-a' })
    ).toThrow('Terminal connections must stay within one container scope.')
    expect(() =>
      graph.connectTerminalBlocks({ sourceBlockId: 'group-a', targetBlockId: 'root-a' })
    ).toThrow('Terminal connections must stay within one container scope.')
    expect(() =>
      graph.connectTerminalBlocks({ sourceBlockId: 'group-a', targetBlockId: 'group-b' })
    ).toThrow('Terminal connections must stay within one container scope.')

    graph.connectTerminalBlocks({ sourceBlockId: 'root-a', targetBlockId: 'root-b' })
    graph.moveTerminalWorkflowToGroup('root-b', 'group')
    graph.connectTerminalBlocks({ sourceBlockId: 'root-a', targetBlockId: 'group-a' })

    expect(graph.toSnapshot().connections).toHaveLength(2)
  })

  it('moves a complete connected workflow into and out of a combination atomically', () => {
    const graph = createGraph()
    createTerminal(graph, 'install', 0, 0)
    createTerminal(graph, 'build', 800, 0)
    createTerminal(graph, 'shell', 1_600, 0)
    graph.connectTerminalBlocks({ sourceBlockId: 'install', targetBlockId: 'build' })
    graph.createTerminalGroup({
      id: 'development',
      name: 'Development',
      position: { x: 0, y: 700 }
    })

    graph.moveTerminalWorkflowToGroup('build', 'development')
    expect(graph.toSnapshot().terminalGroups[0]?.memberBlockIds).toEqual(['install', 'build'])

    graph.moveTerminalWorkflowToGroup('install', null)
    expect(graph.toSnapshot().terminalGroups[0]?.memberBlockIds).toEqual([])
    expect(graph.toSnapshot().connections).toHaveLength(1)
  })

  it('refits a combination when members move out and moves the remaining members with it', () => {
    const graph = createGraph()
    createTerminal(graph, 'left', 100, 100)
    createTerminal(graph, 'right', 1_200, 100)
    graph.createTerminalGroup({ id: 'wide', name: 'Wide', memberBlockIds: ['left', 'right'] })
    const initial = graph.toSnapshot().terminalGroups[0]!

    graph.moveTerminalWorkflowToGroup('right', null)
    graph.moveTerminalGroup('wide', { x: 500, y: 400 })

    const current = graph.toSnapshot().terminalGroups[0]!
    expect(current.size.width).toBeLessThan(initial.size.width)
    expect(current.size).toEqual({ width: 784, height: 612 })
    expect(current.position).toEqual({ x: 500, y: 400 })
    expect(graph.toSnapshot().blocks.find((block) => block.id === 'left')?.position).toEqual({
      x: 532,
      y: 476
    })
  })

  it('contracts again when a member moves inward after expanding the combination', () => {
    const graph = createGraph()
    createTerminal(graph, 'left', 100, 100)
    createTerminal(graph, 'right', 1_200, 100)
    graph.createTerminalGroup({
      id: 'adaptive',
      name: 'Adaptive',
      memberBlockIds: ['left', 'right']
    })
    const expandedWidth = graph.toSnapshot().terminalGroups[0]!.size.width

    graph.moveBlock('right', { x: 900, y: 100 })

    const contracted = graph.toSnapshot().terminalGroups[0]!
    expect(contracted.position).toEqual({ x: 68, y: 24 })
    expect(contracted.size.width).toBeLessThan(expandedWidth)
    expect(contracted.size).toEqual({ width: 1_584, height: 612 })
  })

  it('reflows existing terminals around the combination anchor when another unit joins', () => {
    const graph = createGraph()
    createTerminal(graph, 'left', 100, 100)
    createTerminal(graph, 'right', 1_200, 100)
    createTerminal(graph, 'incoming', 3_000, 800)
    graph.createTerminalGroup({
      id: 'anchored',
      name: 'Anchored',
      memberBlockIds: ['left', 'right']
    })

    graph.moveTerminalWorkflowToGroup('incoming', 'anchored', { x: 500, y: 300 })

    expect(graph.toSnapshot().blocks).toEqual([
      expect.objectContaining({ id: 'left', position: { x: 100, y: 100 } }),
      expect.objectContaining({ id: 'right', position: { x: 884, y: 100 } }),
      expect.objectContaining({ id: 'incoming', position: { x: 492, y: 624 } })
    ])
    expect(graph.toSnapshot().terminalGroups[0]).toMatchObject({
      position: { x: 68, y: 24 },
      size: { width: 1_568, height: 1_136 },
      memberBlockIds: ['left', 'right', 'incoming']
    })
  })
})

function createGraph(): BlockGraph {
  return BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
}

function createTerminal(graph: BlockGraph, id: string, x: number, y: number): void {
  graph.createTerminalBlock({ id, name: id, description: '', position: { x, y } })
}
