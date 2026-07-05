import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { ProjectRegistry } from '../../../../src/contexts/project/domain/aggregates/ProjectRegistry'
import { FileSystemProjectRegistryRepository } from '../../../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRegistryRepository'

describe('project filesystem registry', () => {
  let registryDirectory: string

  beforeEach(async () => {
    registryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-project-registry-'))
  })

  afterEach(async () => {
    await rm(registryDirectory, { recursive: true, force: true })
  })

  it('persists remembered project directories outside renderer memory', async () => {
    const registryPath = join(registryDirectory, 'project-registry.json')
    const repository = new FileSystemProjectRegistryRepository(registryPath)
    const registry = ProjectRegistry.empty()
      .rememberProject('/work/alpha')
      .rememberProject('/work/beta')

    await repository.save(registry)

    expect(JSON.parse(await readFile(registryPath, 'utf8'))).toEqual({
      projectDirectories: ['/work/beta', '/work/alpha']
    })
    await expect(repository.get()).resolves.toEqual({
      projectDirectories: ['/work/beta', '/work/alpha']
    })
  })
})
