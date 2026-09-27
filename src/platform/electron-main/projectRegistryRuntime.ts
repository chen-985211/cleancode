import { join } from 'node:path'
import { FileSystemProjectRegistryRepository } from '../../contexts/project/infrastructure/filesystem/FileSystemProjectRegistryRepository'

export function createProjectRegistryProvider(appStateDirectory: string) {
  let repository: FileSystemProjectRegistryRepository | undefined
  return () => {
    repository ??= new FileSystemProjectRegistryRepository(
      process.env.CLEANCODE_TEST_PROJECT_REGISTRY_PATH ??
        join(appStateDirectory, 'project-registry.json')
    )
    return repository
  }
}
