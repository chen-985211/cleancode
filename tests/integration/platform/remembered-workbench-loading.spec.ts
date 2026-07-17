import type { ProjectRegistrySnapshot } from '../../../src/contexts/project/application/dto/ProjectRegistrySnapshot'
import type { ProjectSnapshot } from '../../../src/contexts/project/application/dto/ProjectSnapshot'
import { loadRememberedWorkbenchList } from '../../../src/platform/electron-main/loadRememberedWorkbenchList'

describe('remembered workbench loading', () => {
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
        name: 'main',
        directory,
        gitBranch: null,
        isCurrent: true
      }
    ]
  }
}
