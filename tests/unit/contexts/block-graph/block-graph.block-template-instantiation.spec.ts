import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import type { BlockTemplateSnapshot } from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateTypes'

describe('block template instantiation', () => {
  it('creates fresh terminal and connection identities while preserving relative layout', () => {
    const graph = BlockGraph.createDefault({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'workspace-2'
    })
    const template = createWorkflowTemplate()

    const first = graph.instantiateBlockTemplate(template, { x: 1_000, y: 600 })
    const second = graph.instantiateBlockTemplate(template, { x: 3_000, y: 1_200 })
    const snapshot = graph.toSnapshot()
    const firstBlocks = first.blockIds.map((blockId) =>
      snapshot.blocks.find((block) => block.id === blockId)
    )
    const secondBlocks = second.blockIds.map((blockId) =>
      snapshot.blocks.find((block) => block.id === blockId)
    )

    expect(first.blockIds).toHaveLength(2)
    expect(second.blockIds).toHaveLength(2)
    expect(new Set([...first.blockIds, ...second.blockIds]).size).toBe(4)
    expect(first.blockIds).not.toContain('template-node-1')
    expect(firstBlocks.map((block) => block?.position)).toEqual([
      { x: 1_000, y: 600 },
      { x: 1_760, y: 820 }
    ])
    expect(secondBlocks.map((block) => block?.position)).toEqual([
      { x: 3_000, y: 1_200 },
      { x: 3_760, y: 1_420 }
    ])
    expect(snapshot.connections).toEqual([
      {
        id: expect.any(String),
        sourceBlockId: first.blockIds[0],
        targetBlockId: first.blockIds[1]
      },
      {
        id: expect.any(String),
        sourceBlockId: second.blockIds[0],
        targetBlockId: second.blockIds[1]
      }
    ])
    expect(snapshot.connections?.[0]?.id).not.toBe(snapshot.connections?.[1]?.id)
  })

  it('creates a fresh terminal group for a combination template', () => {
    const graph = BlockGraph.createDefault({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'workspace-2'
    })
    const template: BlockTemplateSnapshot = {
      ...createWorkflowTemplate(),
      id: 'combination-template',
      name: 'Development',
      type: 'combination',
      nodes: [
        ...createWorkflowTemplate().nodes,
        {
          templateNodeId: 'template-node-3',
          name: 'Shell',
          description: 'Independent terminal.',
          launchCommand: 'pnpm shell',
          executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
          position: { x: 0, y: 600 },
          size: { width: 640, height: 360 }
        }
      ]
    }

    const result = graph.instantiateBlockTemplate(template, { x: 400, y: 300 })
    const snapshot = graph.toSnapshot()

    expect(result.terminalGroupId).toEqual(expect.any(String))
    expect(snapshot.terminalGroups).toEqual([
      expect.objectContaining({
        id: result.terminalGroupId,
        name: 'Development',
        memberBlockIds: result.blockIds
      })
    ])
    expect(result.executionScope).toEqual({
      terminalGroupId: result.terminalGroupId,
      type: 'terminal-group'
    })
  })

  it.each(['horizontal', 'offset workflow', 'single member'])(
    'preserves %s combination geometry through instantiation and restoration',
    (layout) => {
      const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
      const workflow = createWorkflowTemplate()
      const template: BlockTemplateSnapshot = {
        ...workflow,
        type: 'combination',
        nodes:
          layout === 'single member'
            ? workflow.nodes.slice(0, 1)
            : workflow.nodes.map((node, index) => ({
                ...node,
                position: { x: index * 760, y: layout === 'horizontal' ? 0 : index * 220 }
              })),
        connections: layout === 'offset workflow' ? workflow.connections : []
      }
      const origin = { x: 400, y: 300 }
      const instance = graph.instantiateBlockTemplate(template, origin)
      const expectedMembers = template.nodes.map((node, index) => ({
        id: instance.blockIds[index],
        position: { x: origin.x + node.position.x, y: origin.y + node.position.y },
        size: node.size
      }))
      const snapshots = [graph.toSnapshot()]
      for (let reload = 0; reload < 2; reload++) {
        snapshots.push(BlockGraph.fromSnapshot(snapshots.at(-1)!).toSnapshot())
      }
      for (const snapshot of snapshots) {
        expect(snapshot.blocks.map(({ id, position, size }) => ({ id, position, size }))).toEqual(
          expectedMembers
        )
        expect(snapshot.terminalGroups[0]).toMatchObject({
          position: { x: origin.x - 32, y: origin.y - 76 },
          size: {
            width: layout === 'single member' ? 704 : 1464,
            height: layout === 'offset workflow' ? 732 : 512
          },
          memberBlockIds: instance.blockIds
        })
        expect(snapshot.connections).toEqual(snapshots[0]!.connections)
      }
    }
  )

  it('leaves existing template instances unchanged when another workflow is created or removed', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    const template: BlockTemplateSnapshot = {
      ...createWorkflowTemplate(),
      type: 'combination',
      connections: []
    }
    const first = graph.instantiateBlockTemplate(template, { x: 400, y: 300 })
    const before = graph.toSnapshot()
    const second = graph.instantiateBlockTemplate(createWorkflowTemplate(), { x: 3000, y: 300 })
    expect(graph.blocks.filter((block) => first.blockIds.includes(block.id))).toEqual(before.blocks)
    expect(graph.terminalGroups).toEqual(before.terminalGroups)
    graph.deleteBlocks(second.blockIds)
    expect(graph.toSnapshot()).toEqual(before)
  })

  it('returns an exact block execution scope for terminal and workflow templates', () => {
    const graph = BlockGraph.createDefault({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'workspace-2'
    })

    const result = graph.instantiateBlockTemplate(createWorkflowTemplate(), { x: 0, y: 0 })

    expect(result.executionScope).toEqual({ blockIds: result.blockIds, type: 'block-set' })
  })
})

function createWorkflowTemplate(): BlockTemplateSnapshot {
  return {
    id: 'workflow-template',
    type: 'workflow',
    name: 'Build web',
    description: 'Install and build.',
    scope: { projectId: 'project-1', type: 'project' },
    createdAt: '2026-07-30T08:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'template-node-1',
        name: 'Install',
        description: 'Install dependencies.',
        launchCommand: 'pnpm install',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 640, height: 360 }
      },
      {
        templateNodeId: 'template-node-2',
        name: 'Build',
        description: 'Build web.',
        launchCommand: 'pnpm build',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 760, y: 220 },
        size: { width: 640, height: 360 }
      }
    ],
    connections: [
      { sourceTemplateNodeId: 'template-node-1', targetTemplateNodeId: 'template-node-2' }
    ]
  }
}
