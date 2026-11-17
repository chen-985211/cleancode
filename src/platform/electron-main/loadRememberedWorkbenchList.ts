import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import type { ProjectRegistryRepository } from '../../contexts/project/application/ports/ProjectRegistryRepository'
import type { CreateOrOpenProjectUseCase } from '../../contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import type { ProjectRegistryTransactionCoordinator } from '../../contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import { RestoreRememberedProjectsUseCase } from '../../contexts/project/application/use-cases/RestoreRememberedProjectsUseCase'

interface WorkbenchWithProject {
  readonly project: ProjectSnapshot
}

export async function loadRememberedWorkbenchList<TWorkbench extends WorkbenchWithProject>(input: {
  readonly projects: ProjectRepository
  readonly registry: ProjectRegistryRepository
  readonly openProject: Pick<CreateOrOpenProjectUseCase, 'execute'>
  readonly registryTransactions: ProjectRegistryTransactionCoordinator
  readonly loadWorkbench: (project: ProjectSnapshot) => Promise<TWorkbench>
}): Promise<Array<TWorkbench & { readonly isCurrentProject: boolean }>> {
  const workbenches = new Map<string, TWorkbench>()
  const restored = await new RestoreRememberedProjectsUseCase(
    input.projects,
    input.registry,
    input.openProject,
    {
      async load(project) {
        workbenches.set(project.directory, await input.loadWorkbench(project))
      }
    },
    input.registryTransactions
  ).execute()
  return restored.projectDirectories.map((directory) => ({
    ...workbenches.get(directory)!,
    isCurrentProject: directory === restored.currentProjectDirectory
  }))
}
