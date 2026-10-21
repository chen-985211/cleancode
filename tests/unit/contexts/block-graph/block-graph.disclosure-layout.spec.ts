import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { terminalBlockVisibleSize } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraphTypes'

describe('terminal disclosure layout', () => {
  it('keeps the group anchor fixed when resizing a member from its top-left corner', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['a', 'b'])
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 100, y: 100 } })
    graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    graph.createTerminalGroup({
      id: 'group',
      name: 'App',
      position: { x: 200, y: 300 },
      memberBlockIds: ['a', 'b']
    })
    const before = graph.toSnapshot()
    const member = graph.blocks[0]!
    graph.resizeTerminalBlock(member.id, {
      position: { x: member.position.x - 100, y: member.position.y - 80 },
      size: { width: 520, height: 360 }
    })
    expect(graph.terminalGroups[0]!.position).toEqual(before.terminalGroups[0]!.position)
    expect(graph.blocks[0]!.position).toEqual(member.position)
    expect(graph.blocks[1]!.position.x).toBe(graph.blocks[0]!.position.x + 520 + 64)
    expect(BlockGraph.fromSnapshot(graph.toSnapshot()).toSnapshot()).toEqual(graph.toSnapshot())
  })
  it.each([false, true])('reflows the visible workflow footprint, grouped=%s', (grouped) => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    const blocks = ['Install', 'Build', 'Serve'].map((name, index) =>
      graph.createTerminalBlock({
        name,
        description: '',
        position: { x: 100 + index * 1000, y: 100 }
      })
    )
    graph.connectTerminalBlocks({ sourceBlockId: blocks[0]!.id, targetBlockId: blocks[1]!.id })
    graph.connectTerminalBlocks({ sourceBlockId: blocks[1]!.id, targetBlockId: blocks[2]!.id })
    const group = grouped
      ? graph.createTerminalGroup({ name: 'App', memberBlockIds: blocks.map((block) => block.id) })
      : null
    const external = graph.createTerminalBlock({
      name: 'Unrelated',
      description: '',
      position: { x: -800, y: -600 }
    })
    if (group)
      graph.connectTerminalBlocks({ sourceBlockId: blocks[2]!.id, targetBlockId: external.id })
    const externalBeforeDisclosure = graph.blocks.find((block) => block.id === external.id)
    const connections = graph.toSnapshot().connections
    const anchor = group?.position ?? { x: 100, y: 100 }
    for (const original of blocks) {
      const block = graph.blocks.find((item) => item.id === original.id)!
      graph.resizeTerminalBlock(block.id, {
        position: block.position,
        size: block.size,
        isCollapsed: true
      })
    }
    const compact = blocks.map((original) => graph.blocks.find((item) => item.id === original.id)!)
    for (let index = 1; index < compact.length; index++) {
      const previous = compact[index - 1]!,
        next = compact[index]!
      expect(next.position.x - previous.position.x - terminalBlockVisibleSize(previous).width).toBe(
        64
      )
      expect(next.position.y).toBe(previous.position.y)
    }
    expect(graph.blocks.find((block) => block.id === external.id)).toEqual(externalBeforeDisclosure)
    expect(graph.toSnapshot().connections).toEqual(connections)
    if (group) {
      expect(graph.terminalGroups[0]!.position).toEqual(anchor)
      expect(graph.terminalGroups[0]!.size.width).toBeLessThan(group.size.width)
      expect(graph.terminalGroups[0]!.size.height).toBeLessThan(240)
    } else expect(compact[0]!.position).toEqual(anchor)

    const middle = compact[1]!
    graph.resizeTerminalBlock(middle.id, {
      position: middle.position,
      size: middle.size,
      isCollapsed: false
    })
    const expanded = graph.blocks.find((block) => block.id === middle.id)!
    const successor = graph.blocks.find((block) => block.id === compact[2]!.id)!
    expect(expanded.size.width).toBeLessThan(blocks[1]!.size.width)
    expect(expanded.size.height).toBeLessThan(blocks[1]!.size.height)
    expect(successor.position.x - expanded.position.x - expanded.size.width).toBe(64)
    expect(expanded.position).toEqual(middle.position)
    expect(successor.position.y).toBe(compact[0]!.position.y)
    expect(graph.blocks.find((block) => block.id === compact[0]!.id)!.position).toEqual(
      compact[0]!.position
    )
    expect(graph.toSnapshot().connections).toEqual(connections)
    expect(BlockGraph.fromSnapshot(graph.toSnapshot()).toSnapshot()).toEqual(graph.toSnapshot())
  })

  it.each([0, 1, 2, 3, 4, 5])(
    'keeps flow rows left aligned and nodes top aligned when terminal %s expands',
    (expandedIndex) => {
      const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
      const ids = Array.from(
        { length: 6 },
        (_, index) =>
          graph.createTerminalBlock({
            name: `Step ${index}`,
            description: '',
            position: { x: 100 + (index % 3) * 1000, y: 100 + Math.floor(index / 3) * 600 }
          }).id
      )
      for (const [source, target] of [
        [0, 1],
        [1, 2],
        [3, 4],
        [4, 5]
      ])
        graph.connectTerminalBlocks({ sourceBlockId: ids[source!]!, targetBlockId: ids[target!]! })
      graph.createTerminalGroup({ name: 'App', memberBlockIds: ids })
      const toggle = (index: number, isCollapsed: boolean) => {
        const block = graph.blocks.find((item) => item.id === ids[index])!
        graph.resizeTerminalBlock(block.id, {
          position: block.position,
          size: block.size,
          isCollapsed
        })
      }
      ids.forEach((_, index) => toggle(index, true))
      const compact = graph.toSnapshot()
      const positions = compact.blocks.map((block) => block.position)
      const group = compact.terminalGroups[0]!
      for (let cycle = 0; cycle < 3; cycle++) {
        toggle(expandedIndex, false)
        const row = Math.floor(expandedIndex / 3)
        const next = graph.blocks
        for (let i = 0; i < 6; i++) {
          expect(next[i]!.position.y).toBe(next[Math.floor(i / 3) * 3]!.position.y)
          if (Math.floor(i / 3) !== row || i <= expandedIndex)
            expect(next[i]!.position.x).toBe(positions[i]!.x)
          if (i % 3 > 0) {
            const previous = next[i - 1]!
            expect(next[i]!.position.x).toBe(
              previous.position.x + terminalBlockVisibleSize(previous).width + 64
            )
          }
        }
        expect(next[0]!.position.x).toBe(next[3]!.position.x)
        expect(next[0]!.position.y).toBe(positions[0]!.y)
        expect(next[3]!.position.y).toBe(next[0]!.position.y + (row === 0 ? 280 : 44) + 64)
        expect(graph.terminalGroups[0]!.position).toEqual(group.position)
        toggle(expandedIndex, true)
        expect(graph.blocks.map((block) => block.position)).toEqual(positions)
        expect(graph.terminalGroups[0]!.size).toEqual(group.size)
      }
    }
  )

  it.each([false, true])(
    'repairs scrambled saved members at the stored group anchor, collapsed=%s',
    (isCollapsed) => {
      const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
      for (const id of ['a', 'b', 'c', 'outside']) {
        graph.createTerminalBlock({ id, name: id, description: '', position: { x: 100, y: 100 } })
        const block = graph.blocks.find((block) => block.id === id)!
        graph.resizeTerminalBlock(id, {
          position: block.position,
          size: block.size,
          isCollapsed: true
        })
      }
      graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
      graph.connectTerminalBlocks({ sourceBlockId: 'b', targetBlockId: 'c' })
      graph.createTerminalGroup({ id: 'app', name: 'App', memberBlockIds: ['a', 'b', 'c'] })
      const canonical = graph.toSnapshot()
      const saved = {
        ...canonical,
        terminalGroups: canonical.terminalGroups.map((group) => ({ ...group, isCollapsed })),
        blocks: canonical.blocks.map((block, index) =>
          block.id === 'outside'
            ? block
            : { ...block, position: { x: 700 - index * 90, y: 450 + index * 10 } }
        )
      }
      const restored = BlockGraph.fromSnapshot(saved).toSnapshot()
      expect(restored.blocks).toEqual(canonical.blocks)
      expect(restored.terminalGroups[0]).toEqual({ ...canonical.terminalGroups[0], isCollapsed })
      expect(restored.connections).toEqual(saved.connections)
      expect(BlockGraph.fromSnapshot(restored).toSnapshot()).toEqual(restored)
    }
  )

  it('assigns fixed slots immediately when a group is created from scrambled terminals', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const [id, x, y] of [
      ['a', 800, 300],
      ['b', 400, 400],
      ['c', 500, 200]
    ] as const) {
      graph.createTerminalBlock({ id, name: id, description: '', position: { x, y } })
      const block = graph.blocks.find((block) => block.id === id)!
      graph.resizeTerminalBlock(id, {
        position: block.position,
        size: block.size,
        isCollapsed: true
      })
    }
    graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    graph.connectTerminalBlocks({ sourceBlockId: 'b', targetBlockId: 'c' })
    graph.createTerminalGroup({
      id: 'app',
      name: 'App',
      position: { x: 200, y: 300 },
      memberBlockIds: ['c', 'a', 'b']
    })
    expect(graph.blocks.map((block) => block.position)).toEqual([
      { x: 232, y: 376 },
      { x: 516, y: 376 },
      { x: 800, y: 376 }
    ])
    expect(graph.terminalGroups[0]!.position).toEqual({ x: 200, y: 300 })
  })

  it('keeps canonical slots after dependencies change or the first member is deleted', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['a', 'b']) {
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 100, y: 100 } })
      const block = graph.blocks.find((block) => block.id === id)!
      graph.resizeTerminalBlock(id, {
        position: block.position,
        size: block.size,
        isCollapsed: true
      })
    }
    graph.createTerminalGroup({
      id: 'app',
      name: 'App',
      position: { x: 200, y: 300 },
      memberBlockIds: ['a', 'b']
    })
    const edge = graph.connectTerminalBlocks({ sourceBlockId: 'a', targetBlockId: 'b' })
    expect(graph.blocks.map((block) => block.position)).toEqual([
      { x: 232, y: 376 },
      { x: 516, y: 376 }
    ])
    graph.disconnectTerminalBlocks(edge.id)
    expect(graph.blocks.map((block) => block.position)).toEqual([
      { x: 232, y: 376 },
      { x: 232, y: 484 }
    ])
    graph.deleteBlock('a')
    expect(graph.blocks[0]!.position).toEqual({ x: 232, y: 376 })
    expect(graph.terminalGroups[0]!.position).toEqual({ x: 200, y: 300 })
    expect(BlockGraph.fromSnapshot(graph.toSnapshot()).toSnapshot()).toEqual(graph.toSnapshot())
  })

  it('preserves branch slot order independently of the saved coordinates', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'main' })
    for (const id of ['root', 'upper', 'lower', 'merge']) {
      graph.createTerminalBlock({ id, name: id, description: '', position: { x: 100, y: 100 } })
      const block = graph.blocks.find((block) => block.id === id)!
      graph.resizeTerminalBlock(id, {
        position: block.position,
        size: block.size,
        isCollapsed: true
      })
    }
    for (const [sourceBlockId, targetBlockId] of [
      ['root', 'upper'],
      ['root', 'lower'],
      ['upper', 'merge'],
      ['lower', 'merge']
    ])
      graph.connectTerminalBlocks({ sourceBlockId: sourceBlockId!, targetBlockId: targetBlockId! })
    graph.createTerminalGroup({
      name: 'Branches',
      position: { x: 200, y: 300 },
      memberBlockIds: ['root', 'upper', 'lower', 'merge']
    })
    const canonical = graph.toSnapshot()
    expect(canonical.blocks.map((block) => block.position)).toEqual([
      { x: 232, y: 376 },
      { x: 516, y: 376 },
      { x: 516, y: 484 },
      { x: 800, y: 376 }
    ])
    const restored = BlockGraph.fromSnapshot({
      ...canonical,
      blocks: canonical.blocks.map((block, index) => ({
        ...block,
        position: { x: 900 - index * 50, y: 600 - index * 50 }
      }))
    })
    expect(restored.toSnapshot()).toEqual(canonical)
  })
})
