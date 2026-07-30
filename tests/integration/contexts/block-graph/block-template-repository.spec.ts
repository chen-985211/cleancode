import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { FileSystemBlockTemplateRepository } from '../../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockTemplateRepository'
import type { BlockTemplateSnapshot } from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateTypes'

describe('file system block template repository', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-block-templates-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('treats a missing file as an empty template library', async () => {
    const repository = new FileSystemBlockTemplateRepository(
      join(directory, 'block-template-library.json')
    )

    await expect(repository.get()).resolves.toEqual({ templates: [], version: 1 })
  })

  it('atomically persists templates that another repository instance can restore', async () => {
    const path = join(directory, 'block-template-library.json')
    const repository = new FileSystemBlockTemplateRepository(path)

    await repository.transact((library) => library.add(createTemplate('template-1')))

    await expect(new FileSystemBlockTemplateRepository(path).get()).resolves.toEqual({
      templates: [createTemplate('template-1')],
      version: 1
    })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      templates: [createTemplate('template-1')],
      version: 1
    })
  })

  it('serializes concurrent transactions without losing templates', async () => {
    const repository = new FileSystemBlockTemplateRepository(
      join(directory, 'block-template-library.json')
    )

    await Promise.all([
      repository.transact((library) => library.add(createTemplate('template-1'))),
      repository.transact((library) => library.add(createTemplate('template-2')))
    ])

    await expect(repository.get()).resolves.toMatchObject({
      templates: [
        expect.objectContaining({ id: 'template-1' }),
        expect.objectContaining({ id: 'template-2' })
      ]
    })
  })

  it('rejects an unknown version without replacing the source file', async () => {
    const path = join(directory, 'block-template-library.json')
    const source = '{"version":2,"templates":[]}\n'
    await writeFile(path, source)
    const repository = new FileSystemBlockTemplateRepository(path)

    await expect(repository.get()).rejects.toMatchObject({
      code: 'BLOCK_TEMPLATE_VERSION_UNSUPPORTED'
    })
    expect(await readFile(path, 'utf8')).toBe(source)
  })

  it('reports damaged nested template data as a stable template error', async () => {
    const path = join(directory, 'block-template-library.json')
    const source = JSON.stringify({
      version: 1,
      templates: [{ ...createTemplate('template-1'), nodes: [{ name: 'Missing fields' }] }]
    })
    await writeFile(path, source)
    const repository = new FileSystemBlockTemplateRepository(path)

    await expect(repository.get()).rejects.toMatchObject({
      code: 'BLOCK_TEMPLATE_INVALID'
    })
    expect(await readFile(path, 'utf8')).toBe(source)
  })
})

function createTemplate(id: string): BlockTemplateSnapshot {
  return {
    id,
    type: 'terminal',
    name: 'API',
    description: '',
    scope: { type: 'global' },
    createdAt: '2026-07-30T08:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'template-node-1',
        name: 'API',
        description: '',
        launchCommand: 'pnpm api',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 640, height: 360 }
      }
    ],
    connections: []
  }
}
