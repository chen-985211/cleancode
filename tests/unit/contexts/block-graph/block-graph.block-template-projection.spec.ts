import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { createBlockTemplate } from '../../../../src/contexts/block-graph/domain/services/BlockTemplateProjection'

describe('block template projection', () => {
  it('recognizes a single selected terminal and removes its workspace identity', () => {
    const graph = createGraph()

    const template = createBlockTemplate({
      createdAt: '2026-07-30T08:00:00.000Z',
      description: 'Reusable API terminal.',
      graph: graph.toSnapshot(),
      id: 'template-1',
      name: 'API',
      scope: { projectId: 'project-1', type: 'project' },
      selectedBlockIds: ['api']
    })

    expect(template).toMatchObject({
      id: 'template-1',
      type: 'terminal',
      name: 'API',
      description: 'Reusable API terminal.',
      scope: { projectId: 'project-1', type: 'project' },
      createdAt: '2026-07-30T08:00:00.000Z',
      updatedAt: '2026-07-30T08:00:00.000Z',
      connections: []
    })
    expect(template.nodes).toEqual([
      expect.objectContaining({
        templateNodeId: 'template-node-1',
        name: 'API',
        launchCommand: 'pnpm dev:api',
        position: { x: 0, y: 0 },
        size: { width: 640, height: 360 }
      })
    ])
    expect(JSON.stringify(template)).not.toContain('"api"')
  })

  it('recognizes one connected dependency graph as a workflow and keeps internal edges only', () => {
    const graph = createGraph()

    const template = createBlockTemplate({
      createdAt: '2026-07-30T08:00:00.000Z',
      description: '',
      graph: graph.toSnapshot(),
      id: 'template-2',
      name: 'Build web',
      scope: { type: 'global' },
      selectedBlockIds: ['install', 'build', 'web']
    })

    expect(template.type).toBe('workflow')
    expect(template.nodes.map((node) => [node.name, node.position])).toEqual([
      ['Install', { x: 0, y: 0 }],
      ['Build', { x: 760, y: 0 }],
      ['Web', { x: 1520, y: 220 }]
    ])
    expect(template.connections).toEqual([
      { sourceTemplateNodeId: 'template-node-1', targetTemplateNodeId: 'template-node-2' },
      { sourceTemplateNodeId: 'template-node-2', targetTemplateNodeId: 'template-node-3' }
    ])
    expect(template.connections).not.toContainEqual(
      expect.objectContaining({ targetTemplateNodeId: expect.stringContaining('outside') })
    )
  })

  it('recognizes disconnected flows and standalone terminals as one combination', () => {
    const graph = createGraph()

    const template = createBlockTemplate({
      createdAt: '2026-07-30T08:00:00.000Z',
      description: '',
      graph: graph.toSnapshot(),
      id: 'template-3',
      name: 'Development',
      scope: { projectId: 'project-1', type: 'project' },
      selectedBlockIds: ['install', 'build', 'api', 'web']
    })

    expect(template.type).toBe('combination')
    expect(template.nodes).toHaveLength(4)
    expect(template.connections).toEqual([
      { sourceTemplateNodeId: 'template-node-1', targetTemplateNodeId: 'template-node-2' },
      { sourceTemplateNodeId: 'template-node-2', targetTemplateNodeId: 'template-node-3' }
    ])
  })

  it('copies execution configuration without runtime state', () => {
    const graph = createGraph()
    graph.updateTerminalExecutionConfig('api', {
      mode: 'service',
      port: {
        binding: { type: 'environment', variableName: 'PORT' },
        policy: { port: 4_000, type: 'preferred' },
        protocol: 'http'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 20_000
    })

    const template = createBlockTemplate({
      createdAt: '2026-07-30T08:00:00.000Z',
      description: '',
      graph: graph.toSnapshot(),
      id: 'template-4',
      name: 'API',
      scope: { type: 'global' },
      selectedBlockIds: ['api']
    })

    expect(template.nodes[0]?.executionConfig).toEqual({
      mode: 'service',
      port: {
        binding: { type: 'environment', variableName: 'PORT' },
        policy: { port: 4_000, type: 'preferred' },
        protocol: 'http'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 20_000
    })
    expect(template.nodes[0]).not.toHaveProperty('sessionId')
    expect(template.nodes[0]).not.toHaveProperty('output')
    expect(template.nodes[0]).not.toHaveProperty('actualEndpoint')
  })
})

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1'
  })

  createTerminal(graph, 'install', 'Install', 'pnpm install', 100, 80)
  createTerminal(graph, 'build', 'Build', 'pnpm build', 860, 80)
  createTerminal(graph, 'web', 'Web', 'pnpm dev:web', 1_620, 300)
  createTerminal(graph, 'api', 'API', 'pnpm dev:api', 100, 760)
  createTerminal(graph, 'outside', 'Outside', 'pnpm outside', 2_380, 300)
  graph.connectTerminalBlocks({
    id: 'install-build',
    sourceBlockId: 'install',
    targetBlockId: 'build'
  })
  graph.connectTerminalBlocks({ id: 'build-web', sourceBlockId: 'build', targetBlockId: 'web' })
  graph.connectTerminalBlocks({ id: 'web-outside', sourceBlockId: 'web', targetBlockId: 'outside' })

  return graph
}

function createTerminal(
  graph: BlockGraph,
  id: string,
  name: string,
  launchCommand: string,
  x: number,
  y: number
): void {
  graph.createTerminalBlock({
    id,
    name,
    description: `${name} terminal.`,
    launchCommand,
    position: { x, y },
    size: { width: 640, height: 360 }
  })
}
