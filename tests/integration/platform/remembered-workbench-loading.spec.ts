import { ProjectRegistryTransactionCoordinator } from '../../../src/contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import type { ProjectRegistrySnapshot } from '../../../src/contexts/project/application/dto/ProjectRegistrySnapshot'
import type { ProjectSnapshot } from '../../../src/contexts/project/application/dto/ProjectSnapshot'
import { loadRememberedWorkbenchList as composeRememberedWorkbenches } from '../../../src/platform/electron-main/loadRememberedWorkbenchList'

describe('remembered workbench loading', () => {
  it('preserves an explicit project selection made while remembered workbenches are loading', async () => {
    const alpha = createProject('/work/alpha', 'alpha')
    const beta = createProject('/work/beta', 'beta')
    let registry = createRegistry(
      ['/work/missing', alpha.directory, beta.directory],
      '/work/missing'
    )
    const selectCurrentProject = vi.fn(async (directory: string | null) => {
      registry = { ...registry, currentProjectDirectory: directory }
    })
    await loadRememberedWorkbenchList({
      findProject: async (directory) =>
        [alpha, beta].find((project) => project.directory === directory) ?? null,
      listRememberedProjects: async () => registry,
      openProject: async ({ directory }) =>
        [alpha, beta].find((project) => project.directory === directory)!,
      loadWorkbench: async (project) => {
        if (project.directory === alpha.directory) await selectCurrentProject(beta.directory)
        return { project }
      },
      selectCurrentProject
    })
    expect(registry.currentProjectDirectory).toBe(beta.directory)
    expect(selectCurrentProject).toHaveBeenCalledOnce()
  })

  it('marks the persisted current project without reordering remembered workbenches', async () => {
    const alpha = createProject('/work/alpha', 'alpha')
    const beta = createProject('/work/beta', 'beta')
    const selectCurrentProject = vi.fn()

    const workbenches = await loadRememberedWorkbenchList({
      findProject: async (directory) =>
        [alpha, beta].find((project) => project.directory === directory) ?? null,
      listRememberedProjects: async () =>
        createRegistry(['/work/alpha', '/work/beta'], '/work/beta'),
      loadWorkbench: async (project) => ({ project }),
      openProject: async ({ directory }) =>
        [alpha, beta].find((project) => project.directory === directory)!,
      selectCurrentProject
    })

    expect(workbenches.map((workbench) => workbench.project.directory)).toEqual([
      '/work/alpha',
      '/work/beta'
    ])
    expect(workbenches.map((workbench) => workbench.isCurrentProject)).toEqual([false, true])
    expect(selectCurrentProject).not.toHaveBeenCalled()
  })

  it('falls back to the first loadable project and repairs the persisted selection', async () => {
    const alpha = createProject('/work/alpha', 'alpha')
    const selectCurrentProject = vi.fn()

    const workbenches = await loadRememberedWorkbenchList({
      findProject: async (directory) => (directory === alpha.directory ? alpha : null),
      listRememberedProjects: async () =>
        createRegistry(['/work/missing', '/work/alpha'], '/work/missing'),
      loadWorkbench: async (project) => ({ project }),
      openProject: async () => alpha,
      selectCurrentProject
    })

    expect(workbenches).toEqual([{ isCurrentProject: true, project: alpha }])
    expect(selectCurrentProject).toHaveBeenCalledWith('/work/alpha')
  })

  it('clears the persisted selection when no remembered project is loadable', async () => {
    const selectCurrentProject = vi.fn()

    await expect(
      loadRememberedWorkbenchList({
        findProject: async () => null,
        listRememberedProjects: async () => createRegistry(['/work/missing'], '/work/missing'),
        loadWorkbench: vi.fn(),
        openProject: vi.fn(),
        selectCurrentProject
      })
    ).resolves.toEqual([])
    expect(selectCurrentProject).toHaveBeenCalledWith(null)
  })
})

function createRegistry(
  projectDirectories: readonly string[],
  currentProjectDirectory: string | null
): ProjectRegistrySnapshot {
  return { currentProjectDirectory, projectDirectories }
}

function createProject(directory: string, name: string): ProjectSnapshot {
  return {
    id: `project-${name}`,
    directory,
    name,
    workspaces: [
      {
        workspaceId: 'workspace-main',
        workspaceKind: 'default',
        displayName: 'main',
        directory,
        gitBranch: null,
        isCurrent: true
      }
    ]
  }
}

function loadRememberedWorkbenchList(input: {
  findProject: (directory: string) => Promise<ProjectSnapshot | null>
  listRememberedProjects: () => Promise<ProjectRegistrySnapshot>
  openProject: (command: { directory: string; name: string }) => Promise<ProjectSnapshot>
  loadWorkbench: (project: ProjectSnapshot) => Promise<{ project: ProjectSnapshot }>
  selectCurrentProject: (directory: string | null) => Promise<unknown>
}) {
  return composeRememberedWorkbenches({
    projects: { findByDirectory: input.findProject, save: vi.fn() },
    registry: {
      get: input.listRememberedProjects,
      save: async (registry) => {
        await input.selectCurrentProject(registry.toSnapshot().currentProjectDirectory)
      }
    },
    openProject: { execute: input.openProject },
    loadWorkbench: input.loadWorkbench,
    registryTransactions: new ProjectRegistryTransactionCoordinator()
  })
}
