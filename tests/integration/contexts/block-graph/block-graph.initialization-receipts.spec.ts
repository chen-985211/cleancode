import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { createBlockTemplate } from '../../../../src/contexts/block-graph/domain/services/BlockTemplateProjection'
import { FileSystemBlockGraphRepository } from '../../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'

describe('atomic template initialization receipts', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-template-receipt-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('persists new objects and their receipt together, surviving deletion and process-level repository recreation', async () => {
    const source = BlockGraph.createDefault({ projectId: 'project', workspaceId: 'source' })
    source.createTerminalBlock({
      id: 'dev',
      name: 'Dev',
      description: '',
      position: { x: 10, y: 20 }
    })
    const template = createBlockTemplate({
      graph: source.toSnapshot(),
      id: 'template',
      name: 'Startup',
      description: '',
      createdAt: '2026-09-06',
      scope: { type: 'project', projectId: 'project' },
      selectedBlockIds: ['dev']
    })
    const repository = new FileSystemBlockGraphRepository(directory)
    const projectDirectory = join(directory, 'project')
    await repository.initializeDefaultGraph(
      projectDirectory,
      BlockGraph.createDefault({ projectId: 'project', workspaceId: 'target' })
    )
    await repository.transactDefaultGraph(projectDirectory, 'target', (graph) =>
      graph.instantiateBlockTemplate(template, { x: 100, y: 100 }, 'operation')
    )
    const first = (await repository.findDefaultGraphSnapshot(projectDirectory, 'target'))!
    expect(first.templateApplications?.[0].blockIds).toEqual(first.blocks.map((block) => block.id))
    await repository.transactDefaultGraph(projectDirectory, 'target', (graph) => {
      for (const block of graph.blocks) graph.deleteBlock(block.id)
    })
    const reopened = new FileSystemBlockGraphRepository(directory)
    await reopened.transactDefaultGraph(projectDirectory, 'target', (graph) =>
      graph.instantiateBlockTemplate(template, { x: 900, y: 900 }, 'operation')
    )
    const final = (await reopened.findDefaultGraphSnapshot(projectDirectory, 'target'))!
    expect(final.blocks).toEqual([])
    expect(final.templateApplications).toEqual(first.templateApplications)
  })
})
