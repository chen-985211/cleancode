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
