import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal drag membership', () => {
  it('rejects a workflow whose dependencies changed after the drag preview was captured', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['a', 'b', 'late'])
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 0, y: 0 } })
    graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    graph.connectTerminalBlocks({ sourceBlockId: 'b', targetBlockId: 'late' })
    const before = graph.toSnapshot()
    expect(() =>
      graph.moveTerminalWorkflowToGroup('a', null, { x: 900, y: 100 }, 'workflow', ['a', 'b'])
    ).toThrow('Terminal workflow scope changed before it could be moved.')
    expect(graph.toSnapshot()).toEqual(before)
  })

  it('rejects a partial membership move and restores a complete workflow move', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['a', 'b'])
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 0, y: 0 } })
    graph.connectTerminalBlocks({ id: 'a-b', sourceBlockId: 'a', targetBlockId: 'b' })
    graph.createTerminalGroup({ id: 'group', name: 'App', position: { x: 800, y: 100 } })
    const before = graph.toSnapshot()
    expect(() => graph.moveTerminalWorkflowToGroup('a', 'group', undefined, 'terminal')).toThrow(
      expect.objectContaining({ code: 'TERMINAL_CONNECTION_SCOPE_MISMATCH' })
    )
    expect(graph.toSnapshot()).toEqual(before)
    graph.moveTerminalWorkflowToGroup('a', 'group')
    const snapshot = graph.toSnapshot()
    expect(snapshot.terminalGroups[0]?.memberBlockIds).toEqual(['a', 'b'])
    expect(snapshot.connections).toEqual([{ id: 'a-b', sourceBlockId: 'a', targetBlockId: 'b' }])
    expect(BlockGraph.fromSnapshot(snapshot).toSnapshot()).toEqual(snapshot)
    graph.moveTerminalWorkflowToGroup('a', null, { x: -500, y: 0 }, 'workflow')
    expect(graph.toSnapshot().terminalGroups[0]?.memberBlockIds).toEqual([])
    expect(graph.toSnapshot().blocks).toHaveLength(2)
    expect(graph.toSnapshot().connections).toEqual(snapshot.connections)
  })

  it('keeps a compact empty combination after its last workflow leaves, including restore', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['a', 'b', 'c']) {
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 0, y: 0 } })
      const block = graph.blocks.find((block) => block.id === id)!
      graph.resizeTerminalBlock(id, {
        position: block.position,
        size: block.size,
        isCollapsed: true
      })
    }
    graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    graph.connectTerminalBlocks({ sourceBlockId: 'b', targetBlockId: 'c' })
    graph.createTerminalGroup({ id: 'group', name: 'App', position: { x: 800, y: 100 } })
    graph.moveTerminalWorkflowToGroup('a', 'group', undefined, 'workflow')
    const before = graph.terminalGroups[0]!
    graph.moveTerminalWorkflowToGroup('a', null, { x: 100, y: 600 }, 'workflow')
    const snapshot = graph.toSnapshot()
    const empty = snapshot.terminalGroups[0]!
    expect(empty.position).toEqual(before.position)
    expect(empty.size.width).toBeLessThanOrEqual(before.size.width)
    expect(empty.size.height).toBeLessThanOrEqual(before.size.height)
    expect(empty.size).toEqual({ width: 320, height: 160 })
    expect(BlockGraph.fromSnapshot(snapshot).toSnapshot()).toEqual(snapshot)
  })

  it('translates an entire workflow by one delta when membership stays the same', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const [id, x, y] of [
      ['a', 10, 20],
      ['b', 700, 80]
    ] as const) {
      graph.createTerminalBlock({ id, name: id, description: '', position: { x, y } })
    }
    graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    graph.moveTerminalWorkflowToGroup('a', null, { x: 110, y: 220 }, 'workflow')
    expect(graph.blocks.map((block) => block.position)).toEqual([
      { x: 110, y: 220 },
      { x: 800, y: 280 }
    ])
  })
})
