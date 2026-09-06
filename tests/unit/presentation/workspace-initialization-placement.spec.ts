import { workspaceInitializationPositions } from '../../../src/presentation/app-shell/coordinators/workspaceInitializationPlacement'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'
import { WorkspaceInitialization } from '../../../src/contexts/project/domain/aggregates/WorkspaceInitialization'
import { BlockGraph } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { createBlockTemplate } from '../../../src/contexts/block-graph/domain/services/BlockTemplateProjection'
import { projectBlockTemplateRects } from '../../../src/contexts/block-graph/presentation/view-models/blockTemplateGeometry'

describe('workspace initialization placement', () => {
  it('preserves internal geometry while moving a retried wide template away from an existing Agent', () => {
    const workbench = createWorkbenchSnapshot('/project', 'Project')
    const source = BlockGraph.createDefault({
      projectId: workbench.project.id,
      workspaceId: 'source'
    })
    source.createTerminalBlock({
      id: 'one',
      name: 'One',
      description: '',
      position: { x: 0, y: 0 }
    })
    const original = createBlockTemplate({
      graph: source.toSnapshot(),
      id: 'wide',
      name: 'Wide',
      description: '',
      createdAt: '2026-09-06',
      scope: { type: 'global' },
      selectedBlockIds: ['one']
    })
    const template = {
      ...original,
      nodes: original.nodes.map((node) => ({ ...node, size: { width: 1800, height: 460 } }))
    }
    const operation = WorkspaceInitialization.create({
      id: 'request',
      projectId: workbench.project.id,
      projectDirectory: '/project',
      workspaceId: workbench.graph.workspaceId,
      workspaceDirectory: '/project',
      branchName: null,
      mode: 'new-workspace',
      defaults: {
        templates: [{ templateId: template.id, runAfterPlacement: false }],
        agents: []
      }
    })
    const itemId = operation.toSnapshot().items[0].id
    operation.prepare(itemId, 'Wide')
    operation.place(itemId, { x: 0, y: 0 })
    operation.fail(itemId, 'BLOCK_TEMPLATE_NOT_FOUND')
    const agent = {
      agentId: 'agent',
      projectId: workbench.project.id,
      workspaceId: workbench.graph.workspaceId,
      providerId: 'provider',
      name: 'Agent',
      cleancodeMcpEnabled: false,
      layout: { position: { x: 784, y: 0 }, size: { width: 720, height: 460 } }
    }
    const [position] = workspaceInitializationPositions(
      { initialization: operation.toSnapshot(), templates: [{ itemId, template }] },
      {
        ...workbench,
        graph: { ...workbench.graph, blocks: [], terminalGroups: [] },
        agents: [agent]
      },
      itemId
    )
    const [rect] = projectBlockTemplateRects(template, position)
    expect(rect.position.x).toBeGreaterThanOrEqual(
      agent.layout.position.x + agent.layout.size.width + 64
    )
    expect(rect.size.width).toBe(1800)
  })
})
