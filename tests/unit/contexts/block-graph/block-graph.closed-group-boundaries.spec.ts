import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

const connectionCases = [
  { source: 'root-a', target: 'root-b', allowed: true },
  { source: 'a-1', target: 'a-2', allowed: true },
  { source: 'b-1', target: 'b-2', allowed: true },
  { source: 'root-a', target: 'a-1', allowed: false },
  { source: 'a-1', target: 'root-a', allowed: false },
  { source: 'a-1', target: 'b-1', allowed: false },
  { source: 'b-1', target: 'a-1', allowed: false }
]

describe('closed terminal group boundaries', () => {
  describe.each([false, true])('with collapsed groups=%s', (collapsed) => {
    it.each(connectionCases)(
      '$source → $target has allowed=$allowed',
      ({ source, target, allowed }) => {
        const graph = createGraph(collapsed)
        const before = graph.toSnapshot()
        const connect = () =>
          graph.connectTerminalBlocks({ sourceBlockId: source, targetBlockId: target })
        if (allowed) {
          expect(connect).not.toThrow()
          expect(graph.connections).toEqual([
            expect.objectContaining({ sourceBlockId: source, targetBlockId: target })
          ])
          expect(graph.terminalGroups.map((group) => [group.id, group.memberBlockIds])).toEqual(
            before.terminalGroups.map((group) => [group.id, group.memberBlockIds])
          )
        } else {
          expect(connect).toThrow(
            expect.objectContaining({ code: 'TERMINAL_CONNECTION_SCOPE_MISMATCH' })
          )
          expect(graph.toSnapshot()).toEqual(before)
        }
      }
    )

    it.each([
      { block: 'root-a', target: 'group-a' },
      { block: 'a-1', target: null },
      { block: 'a-1', target: 'group-b' },
      { block: 'b-1', target: 'group-a' }
    ])('rejects splitting $block into $target without partial mutation', ({ block, target }) => {
      const graph = createGraph(collapsed)
      connectInternalWorkflows(graph)
      const before = graph.toSnapshot()
      expect(() =>
        graph.moveTerminalWorkflowToGroup(block, target, { x: 5000, y: 5000 }, 'terminal')
      ).toThrow(expect.objectContaining({ code: 'TERMINAL_CONNECTION_SCOPE_MISMATCH' }))
      expect(graph.toSnapshot()).toEqual(before)
    })

    it.each([undefined, 'workflow'] as const)('moves complete workflows with scope=%s', (scope) => {
      const graph = createGraph(collapsed)
      connectInternalWorkflows(graph)
      const connections = graph.toSnapshot().connections
      graph.moveTerminalWorkflowToGroup('root-a', 'group-a', undefined, scope)
      expect(graph.terminalGroups.find((group) => group.id === 'group-a')?.memberBlockIds).toEqual([
        'a-1',
        'a-2',
        'root-a',
        'root-b'
      ])
      graph.moveTerminalWorkflowToGroup('root-b', 'group-b', undefined, scope)
      expect(graph.terminalGroups.find((group) => group.id === 'group-b')?.memberBlockIds).toEqual([
        'b-1',
        'b-2',
        'root-a',
        'root-b'
      ])
      graph.moveTerminalWorkflowToGroup('root-a', null, undefined, scope)
      expect(graph.terminalGroups.every((group) => !group.memberBlockIds.includes('root-a'))).toBe(
        true
      )
      expect(graph.connections).toEqual(connections)
      expect(BlockGraph.fromSnapshot(graph.toSnapshot()).toSnapshot()).toEqual(graph.toSnapshot())
    })
  })

  it('keeps single-terminal positioning within its existing space available', () => {
    const graph = createGraph(false)
    connectInternalWorkflows(graph)
    const before = graph.toSnapshot()
    graph.moveTerminalWorkflowToGroup('root-a', null, { x: -1000, y: 500 }, 'terminal')
    expect(graph.blocks.find((block) => block.id === 'root-a')?.position).toEqual({
      x: -1000,
      y: 500
    })
    expect(graph.blocks.find((block) => block.id === 'root-b')).toEqual(
      before.blocks.find((block) => block.id === 'root-b')
    )
    expect(graph.connections).toEqual(before.connections)
    graph.moveTerminalWorkflowToGroup('a-1', 'group-a', undefined, 'terminal')
    expect(graph.connections).toEqual(before.connections)
  })

  it.each([false, true])(
    'restores same-space dependencies regardless of boundary edge order, boundary edges first=%s',
    (boundaryEdgesFirst) => {
      const graph = createGraph(true)
      connectInternalWorkflows(graph)
      const canonical = graph.toSnapshot()
      const boundaryEdges = [
        { id: 'root-group', sourceBlockId: 'root-a', targetBlockId: 'a-1' },
        { id: 'group-root', sourceBlockId: 'a-2', targetBlockId: 'root-a' },
        { id: 'group-group', sourceBlockId: 'a-1', targetBlockId: 'b-1' },
        { id: 'other-root', sourceBlockId: 'b-2', targetBlockId: 'root-b' }
      ]
      const restored = BlockGraph.fromSnapshot({
        ...canonical,
        connections: boundaryEdgesFirst
          ? [...boundaryEdges, ...canonical.connections!]
          : [...canonical.connections!, ...boundaryEdges]
      }).toSnapshot()
      expect(restored).toEqual(canonical)
      expect(BlockGraph.fromSnapshot(restored).toSnapshot()).toEqual(canonical)
    }
  )
})

function createGraph(collapsed: boolean): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
  for (const [index, id] of ['root-a', 'root-b', 'a-1', 'a-2', 'b-1', 'b-2'].entries()) {
    graph.createTerminalBlock({
      id,
      name: id,
      description: id,
      launchCommand: `echo ${id}`,
      position: { x: index * 800, y: 0 }
    })
  }
  for (const [id, members] of [
    ['group-a', ['a-1', 'a-2']],
    ['group-b', ['b-1', 'b-2']]
  ] as const) {
    graph.createTerminalGroup({ id, name: id, memberBlockIds: members })
    graph.setTerminalGroupCollapsed(id, collapsed)
  }
  return graph
}

function connectInternalWorkflows(graph: BlockGraph): void {
  for (const [sourceBlockId, targetBlockId] of [
    ['root-a', 'root-b'],
    ['a-1', 'a-2'],
    ['b-1', 'b-2']
  ]) {
    graph.connectTerminalBlocks({
      id: `${sourceBlockId}-${targetBlockId}`,
      sourceBlockId,
      targetBlockId
    })
  }
}
