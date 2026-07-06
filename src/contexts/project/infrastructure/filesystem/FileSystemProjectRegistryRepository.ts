import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { ProjectRegistrySnapshot } from '../../application/dto/ProjectRegistrySnapshot'
import type { ProjectRegistryRepository } from '../../application/ports/ProjectRegistryRepository'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export class FileSystemProjectRegistryRepository implements ProjectRegistryRepository {
  constructor(private readonly registryPath: string) {}

  async save(registry: ProjectRegistry): Promise<void> {
    await mkdir(dirname(this.registryPath), { recursive: true })
    await writeFile(this.registryPath, serializeProjectRegistry(registry.toSnapshot()))
  }

  async get(): Promise<ProjectRegistrySnapshot> {
    try {
      return ProjectRegistry.fromSnapshot(
        parseProjectRegistry(await readFile(this.registryPath, 'utf8'))
      ).toSnapshot()
    } catch (error) {
      if (isMissingFileError(error)) {
        return ProjectRegistry.empty().toSnapshot()
      }

      throw error
    }
  }
}

function serializeProjectRegistry(snapshot: ProjectRegistrySnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function parseProjectRegistry(metadata: string): ProjectRegistrySnapshot {
  const parsed = JSON.parse(metadata) as Partial<ProjectRegistrySnapshot>

  if (!Array.isArray(parsed.projectDirectories)) {
    throw createExpectedAppError(
      'INVALID_CLEANCODE_PROJECT_REGISTRY',
      'Invalid cleancode project registry.'
    )
  }

  return {
    projectDirectories: parsed.projectDirectories.filter(
      (directory): directory is string => typeof directory === 'string'
    )
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
