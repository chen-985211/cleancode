import { BlockTemplateLibrary } from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateLibrary'
import type {
  BlockTemplateScope,
  BlockTemplateSnapshot
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateTypes'

describe('block template library', () => {
  it('isolates project templates from global templates', () => {
    const library = BlockTemplateLibrary.empty()
    library.add(createTemplate('project-a-template', { projectId: 'project-a', type: 'project' }))
    library.add(createTemplate('project-b-template', { projectId: 'project-b', type: 'project' }))
    library.add(createTemplate('global-template', { type: 'global' }))

    expect(
      library.list({ projectId: 'project-a', type: 'project' }).map((template) => template.id)
    ).toEqual(['project-a-template'])
    expect(library.list({ type: 'global' }).map((template) => template.id)).toEqual([
      'global-template'
    ])
  })

  it('renames, moves and deletes a template without changing its identity or contents', () => {
    const library = BlockTemplateLibrary.empty()
    library.add(createTemplate('template-1', { projectId: 'project-a', type: 'project' }))

    const renamed = library.updateMetadata('template-1', {
      description: 'Updated description.',
      name: 'Updated template',
      updatedAt: '2026-07-30T09:00:00.000Z'
    })
    const moved = library.move('template-1', {
      scope: { type: 'global' },
      updatedAt: '2026-07-30T10:00:00.000Z'
    })

    expect(renamed).toMatchObject({
      id: 'template-1',
      name: 'Updated template',
      description: 'Updated description.'
    })
    expect(moved).toMatchObject({
      id: 'template-1',
      scope: { type: 'global' },
      nodes: createTemplate('ignored', { type: 'global' }).nodes
    })
    expect(library.list({ projectId: 'project-a', type: 'project' })).toEqual([])
    expect(library.list({ type: 'global' })).toHaveLength(1)

    library.remove('template-1')

    expect(library.toSnapshot().templates).toEqual([])
  })

  it('rejects duplicate template identities', () => {
    const library = BlockTemplateLibrary.empty()
    library.add(createTemplate('template-1', { type: 'global' }))

    expect(() => library.add(createTemplate('template-1', { type: 'global' }))).toThrowError(
      expect.objectContaining({ code: 'BLOCK_TEMPLATE_ALREADY_EXISTS' })
    )
  })

  it('rejects damaged references and unknown persistence versions', () => {
    const damaged = {
      ...createTemplate('template-1', { type: 'global' }),
      connections: [
        {
          sourceTemplateNodeId: 'template-node-1',
          targetTemplateNodeId: 'missing-template-node'
        }
      ]
    }

    expect(() =>
      BlockTemplateLibrary.restore({ templates: [damaged], version: 1 } as never)
    ).toThrowError(expect.objectContaining({ code: 'BLOCK_TEMPLATE_INVALID' }))
    expect(() => BlockTemplateLibrary.restore({ templates: [], version: 2 } as never)).toThrowError(
      expect.objectContaining({ code: 'BLOCK_TEMPLATE_VERSION_UNSUPPORTED' })
    )
  })
})

function createTemplate(id: string, scope: BlockTemplateScope): BlockTemplateSnapshot {
  return {
    id,
    type: 'terminal',
    name: 'Template',
    description: 'Description.',
    scope,
    createdAt: '2026-07-30T08:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'template-node-1',
        name: 'API',
        description: 'Runs API.',
        launchCommand: 'pnpm dev:api',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 640, height: 360 }
      }
    ],
    connections: []
  }
}
