import { ProjectRegistry } from '../../domain/aggregates/ProjectRegistry'
import type { RestoredProjectsSnapshot } from '../dto/RestoredProjectsSnapshot'
import type { ProjectRepository } from '../ports/ProjectRepository'
import type { ProjectRegistryRepository } from '../ports/ProjectRegistryRepository'
import type { RememberedProjectLoadPort } from '../ports/RememberedProjectLoadPort'
import type { CreateOrOpenProjectUseCase } from './CreateOrOpenProjectUseCase'
import type { ProjectRegistryTransactionCoordinator } from './ProjectRegistryTransactionCoordinator'

export class RestoreRememberedProjectsUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly registry: ProjectRegistryRepository,
    private readonly openProject: Pick<CreateOrOpenProjectUseCase, 'execute'>,
    private readonly loader: RememberedProjectLoadPort,
    private readonly transactions: ProjectRegistryTransactionCoordinator
  ) {}

  async execute(): Promise<RestoredProjectsSnapshot> {
    const initial = await this.transactions.run(() => this.registry.get())
    const loaded: string[] = []
    for (const directory of initial.projectDirectories) {
      try {
        const remembered = await this.projects.findByDirectory(directory)
        if (!remembered) continue
        const project = await this.openProject.execute({
          directory: remembered.directory,
          name: remembered.name
        })
        await this.loader.load(project)
        loaded.push(project.directory)
      } catch {
        // One unavailable project must not prevent restoring the others.
      }
    }

    // External loads must not hold the registry lock or overwrite newer navigation.
    return this.transactions.run(async () => {
      const latest = await this.registry.get()
      const registry = ProjectRegistry.fromSnapshot(latest)
      const recovered =
        latest.currentProjectDirectory === initial.currentProjectDirectory
          ? registry.recoverCurrentProject(loaded)
          : registry
      const snapshot = recovered.toSnapshot()
      if (snapshot.currentProjectDirectory !== latest.currentProjectDirectory) {
        await this.registry.save(recovered)
      }
      const loadable = new Set(loaded)
      return {
        currentProjectDirectory: snapshot.currentProjectDirectory,
        projectDirectories: snapshot.projectDirectories.filter((directory) =>
          loadable.has(directory)
        )
      }
    })
  }
}
