import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { BlockTemplateLibrary } from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateLibrary'
import { terminalBlockVisibleSize } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraphTypes'
import { createBlockTemplate } from '../../../../src/contexts/block-graph/domain/services/BlockTemplateProjection'
import { projectBlockTemplateRects } from '../../../../src/contexts/block-graph/presentation/view-models/blockTemplateGeometry'

describe('template disclosure geometry', () => {
  it.each([
    ['terminal', [true]],
    ['workflow', [true, true]],
    ['workflow', [true, false]],
    ['combination', [true, true]],
    ['combination', [false, true]]
  ] as const)(
    'preserves %s member visibility %j through save, reload and placement',
    (type, collapsed) => {
      const source = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'source' })
      collapsed.forEach((_, index) =>
        source.createTerminalBlock({
          id: `node-${index}`,
          name: `Step ${index}`,
          description: '',
          launchCommand: 'echo ready',
          position: { x: index * 484, y: 0 },
          size: { width: 420, height: 280 }
        })
      )
      if (collapsed.length > 1)
        source.connectTerminalBlocks({ sourceBlockId: 'node-0', targetBlockId: 'node-1' })
      if (type === 'combination')
        source.createTerminalGroup({ id: 'group', name: 'Group', memberBlockIds: ['node-0'] })
      collapsed.forEach((isCollapsed, index) => {
        const block = source.blocks.find((node) => node.id === `node-${index}`)!
        source.resizeTerminalBlock(block.id, {
          position: block.position,
          size: block.size,
          isCollapsed
        })
      })
      const before = source.toSnapshot()
      const saved = createBlockTemplate({
        id: 'template',
        name: 'Template',
        description: '',
        scope: { type: 'global' },
        createdAt: '2026-10-22T00:00:00.000Z',
        graph: before,
        selectedBlockIds: before.blocks.map((block) => block.id)
      })
      const template = BlockTemplateLibrary.restore(
        JSON.parse(JSON.stringify({ version: 1, templates: [saved] }))
      ).toSnapshot().templates[0]!
      const target = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'target' })
      const origin = { x: 1200, y: 800 }
      const instance = target.instantiateBlockTemplate(template, origin)
      const minimumX = Math.min(...before.blocks.map((block) => block.position.x))
      const minimumY = Math.min(...before.blocks.map((block) => block.position.y))
      for (const snapshot of [
        target.toSnapshot(),
        BlockGraph.fromSnapshot(target.toSnapshot()).toSnapshot()
      ]) {
        expect(snapshot.blocks.map((block) => Boolean(block.isCollapsed))).toEqual(collapsed)
        expect(
          snapshot.blocks.map((block) => ({ position: block.position, size: block.size }))
        ).toEqual(
          before.blocks.map((block) => ({
            position: {
              x: origin.x + block.position.x - minimumX,
              y: origin.y + block.position.y - minimumY
            },
            size: block.size
          }))
        )
        const preview = projectBlockTemplateRects(template, origin)
        const actual =
          type === 'combination'
            ? snapshot.terminalGroups.map((group) => ({
                position: group.position,
                size: group.size
              }))
            : snapshot.blocks.map((block) => ({
                position: block.position,
                size: terminalBlockVisibleSize(block)
              }))
        expect(preview.map(({ position, size }) => ({ position, size }))).toEqual(actual)
        expect(snapshot.connections?.length).toBe(before.connections?.length)
        expect(snapshot.blocks.map((block) => block.id)).toEqual(instance.blockIds)
      }
      expect(source.toSnapshot()).toEqual(before)
    }
  )
})
