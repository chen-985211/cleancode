import {
  BlockGraph,
  terminalBlockVisibleSize
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('terminal expansion sizes', () => {
  it.each([false, true])(
    'applies workflow defaults when connected and restored, grouped=%s',
    (grouped) => {
      const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
      for (const id of ['a', 'b', 'custom'])
        graph.createTerminalBlock({
          id,
          name: id,
          description: '',
          position: { x: 100, y: 100 },
          ...(id === 'custom' ? { size: { width: 640, height: 380 } } : {})
        })
      if (grouped)
        graph.createTerminalGroup({
          id: 'group',
          name: 'Group',
          memberBlockIds: ['a', 'b', 'custom']
        })
      graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
      graph.connectTerminalBlocks({ sourceBlockId: 'b', targetBlockId: 'custom' })
      expect(graph.blocks.map((block) => block.size)).toEqual([
        { width: 420, height: 280 },
        { width: 420, height: 280 },
        { width: 640, height: 380 }
      ])
      const snapshot = graph.toSnapshot()
      const restored = BlockGraph.fromSnapshot({
        ...snapshot,
        blocks: snapshot.blocks.map((block) => ({
          ...block,
          size: block.id === 'custom' ? block.size : { width: 720, height: 460 }
        }))
      })
      expect(restored.blocks.map((block) => block.size)).toEqual(
        graph.blocks.map((block) => block.size)
      )
      for (const block of restored.blocks)
        expect(terminalBlockVisibleSize({ ...block, isCollapsed: true })).toEqual({
          width: 220,
          height: 44
        })
    }
  )
  it.each([false, true])(
    'resets workflow size on every reopen while preserving standalone size, grouped=%s',
    (grouped) => {
      const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
      for (const id of ['a', 'b', 'independent', 'custom', 'custom-independent'])
        graph.createTerminalBlock({
          id,
          name: id,
          description: '',
          position: { x: 100, y: 100 },
          ...(id.startsWith('custom') ? { size: { width: 640, height: 380 } } : {})
        })
      graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
      graph.connectTerminalBlocks({ sourceBlockId: 'b', targetBlockId: 'custom' })
      if (grouped)
        graph.createTerminalGroup({
          id: 'group',
          name: 'App',
          memberBlockIds: ['a', 'b', 'custom', 'independent', 'custom-independent']
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
        width: 420,
        height: 280
      })
      expect(graph.blocks.find((block) => block.id === 'custom-independent')?.size).toEqual({
        width: 640,
        height: 380
      })
      expect(BlockGraph.fromSnapshot(graph.toSnapshot()).toSnapshot()).toEqual(graph.toSnapshot())
    }
  )

  it('resets expanded workflow members when a combination opens, preserving standalone terminals', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['a', 'b', 'independent'])
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 100, y: 100 } })
    graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    graph.createTerminalGroup({
      id: 'group',
      name: 'App',
      memberBlockIds: ['a', 'b', 'independent']
    })
    for (const block of graph.blocks)
      graph.resizeTerminalBlock(block.id, {
        position: block.position,
        size: { width: 640, height: 380 }
      })
    const resized = graph.toSnapshot()
    graph.setTerminalGroupCollapsed('group', false)
    expect(graph.toSnapshot()).toEqual(resized)
    graph.setTerminalGroupCollapsed('group', true)
    graph.setTerminalGroupCollapsed('group', false)
    expect(graph.blocks.find((block) => block.id === 'a')?.size).toEqual({
      width: 420,
      height: 280
    })
    expect(graph.blocks.find((block) => block.id === 'independent')?.size).toEqual({
      width: 640,
      height: 380
    })
  })

  it.each([false, true])(
    'keeps manual resize until the next reopen, changedInput=%s',
    (changedInput) => {
      let graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
      for (const id of ['a', 'b'])
        graph.createTerminalBlock({ id, name: id, description: '', position: { x: 100, y: 100 } })
      graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
      for (const size of [
        { width: 640, height: 380 },
        { width: 500, height: 300 }
      ]) {
        let block = graph.blocks[0]!
        graph.resizeTerminalBlock(block.id, { position: block.position, size })
        graph = BlockGraph.fromSnapshot(graph.toSnapshot())
        expect(graph.blocks[0]!.size).toEqual(size)
        block = graph.blocks[0]!
        graph.resizeTerminalBlock(block.id, { position: block.position, size, isCollapsed: true })
        block = graph.blocks[0]!
        graph.resizeTerminalBlock(block.id, {
          position: block.position,
          size: changedInput ? { width: 600, height: 400 } : size,
          isCollapsed: false
        })
        expect(graph.blocks[0]!.size).toEqual({ width: 420, height: 280 })
      }
    }
  )
})
