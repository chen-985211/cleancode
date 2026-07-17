import type { ProjectRegistrySnapshot } from '../../contexts/project/application/dto/ProjectRegistrySnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'

interface WorkbenchWithProject {
  readonly project: ProjectSnapshot
}

interface LoadRememberedWorkbenchListInput<TWorkbench extends WorkbenchWithProject> {
  readonly findProject: (directory: string) => Promise<ProjectSnapshot | null>
  readonly listRememberedProjects: () => Promise<ProjectRegistrySnapshot>
  readonly loadWorkbench: (project: ProjectSnapshot) => Promise<TWorkbench>
  readonly openProject: (command: {
    readonly directory: string
    readonly name: string
  }) => Promise<ProjectSnapshot>
  readonly selectCurrentProject: (directory: string | null) => Promise<unknown>
}

export async function loadRememberedWorkbenchList<TWorkbench extends WorkbenchWithProject>(
  input: LoadRememberedWorkbenchListInput<TWorkbench>
): Promise<Array<TWorkbench & { readonly isCurrentProject: boolean }>> {
  const registry = await input.listRememberedProjects()
  const workbenches: TWorkbench[] = []

  for (const directory of registry.projectDirectories) {
    try {
      const rememberedProject = await input.findProject(directory)

      if (rememberedProject) {
        const project = await input.openProject({
          directory: rememberedProject.directory,
          name: rememberedProject.name
        })

        workbenches.push(await input.loadWorkbench(project))
      }
    } catch {
      // A remembered project may have been moved or corrupted outside cleancode.
    }
  }

  const currentProjectDirectory = resolveCurrentProjectDirectory(
    workbenches,
    registry.currentProjectDirectory
  )

  if (currentProjectDirectory !== registry.currentProjectDirectory) {
    await input.selectCurrentProject(currentProjectDirectory)
  }

  return workbenches.map((workbench) => ({
    ...workbench,
    isCurrentProject: workbench.project.directory === currentProjectDirectory
  }))
}

function resolveCurrentProjectDirectory(
  workbenches: readonly WorkbenchWithProject[],
  persistedDirectory: string | null
): string | null {
  return workbenches.some((workbench) => workbench.project.directory === persistedDirectory)
    ? persistedDirectory
    : (workbenches[0]?.project.directory ?? null)
}
