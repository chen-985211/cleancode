import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal expansion sizes', () => {
  it.each([false, true])(
    'keeps standalone size and uses a smaller workflow default, grouped=%s',
    (grouped) => {
      const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
      for (const id of ['a', 'b', 'independent', 'custom'])
        graph.createTerminalBlock({
          id,
          name: id,
          description: '',
          position: { x: 100, y: 100 },
          ...(id === 'custom' ? { size: { width: 640, height: 380 } } : {})
        })
      graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
      graph.connectTerminalBlocks({ sourceBlockId: 'b', targetBlockId: 'custom' })
      if (grouped)
        graph.createTerminalGroup({
          id: 'group',
          name: 'App',
          memberBlockIds: ['a', 'b', 'custom', 'independent']
        })
      expect(graph.blocks.find((block) => block.id === 'independent')?.size).toEqual({
        width: 720,
        height: 460
      })
      for (const original of graph.blocks) {
        graph.resizeTerminalBlock(original.id, {
          position: original.position,
          size: original.size,
          isCollapsed: true
        })
        const compact = graph.blocks.find((block) => block.id === original.id)!
        graph.resizeTerminalBlock(compact.id, {
          position: compact.position,
          size: compact.size,
          isCollapsed: false
        })
      }
      expect(graph.blocks.find((block) => block.id === 'a')?.size).toEqual({
        width: 420,
        height: 280
      })
      expect(graph.blocks.find((block) => block.id === 'b')?.size).toEqual({
        width: 420,
        height: 280
      })
      expect(graph.blocks.find((block) => block.id === 'independent')?.size).toEqual({
        width: 720,
        height: 460
      })
      expect(graph.blocks.find((block) => block.id === 'custom')?.size).toEqual({
        width: 640,
        height: 380
      })
      expect(BlockGraph.fromSnapshot(graph.toSnapshot()).toSnapshot()).toEqual(graph.toSnapshot())
    }
  )

  it('adopts small defaults when a combination opens, preserving custom and standalone terminals', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['a', 'b', 'independent'])
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 100, y: 100 } })
    graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    graph.createTerminalGroup({
      id: 'group',
      name: 'App',
      memberBlockIds: ['a', 'b', 'independent']
    })
    graph.setTerminalGroupCollapsed('group', true)
    graph.setTerminalGroupCollapsed('group', false)
    expect(graph.blocks.find((block) => block.id === 'a')?.size).toEqual({
      width: 420,
      height: 280
    })
    expect(graph.blocks.find((block) => block.id === 'independent')?.size).toEqual({
      width: 720,
      height: 460
    })
  })
})
