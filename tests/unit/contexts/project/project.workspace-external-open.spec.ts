import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { WorkspaceExternalOpenPort } from '../../../../src/contexts/project/application/ports/WorkspaceExternalOpenPort'
import { GetWorkspaceExternalOpenCapabilitiesUseCase } from '../../../../src/contexts/project/application/use-cases/GetWorkspaceExternalOpenCapabilitiesUseCase'
import { OpenWorkspaceExternallyUseCase } from '../../../../src/contexts/project/application/use-cases/OpenWorkspaceExternallyUseCase'

describe('workspace external open use cases', () => {
  it.each([
    ['folder', 'main', '/work/app'],
    ['vscode', 'feature', '/work/app-feature']
  ] as const)(
    'opens %s with the authoritative %s workspace directory',
    async (target, workspaceId, directory) => {
      const projects = createProjectRepository(projectSnapshot)
      const externalOpen = createExternalOpenPort()
      const useCase = new OpenWorkspaceExternallyUseCase(projects, externalOpen)

      await useCase.execute({
        projectDirectory: '/work/app',
        target,
        workspaceId
      })

      expect(externalOpen.open).toHaveBeenCalledWith({ directory, target })
    }
  )

  it('rejects a stale project before asking the system to open anything', async () => {
    const projects = createProjectRepository(null)
    const externalOpen = createExternalOpenPort()
    const useCase = new OpenWorkspaceExternallyUseCase(projects, externalOpen)

    await expect(
      useCase.execute({
        projectDirectory: '/work/missing',
        target: 'folder',
        workspaceId: 'main'
      })
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND', isExpected: true })
    expect(externalOpen.open).not.toHaveBeenCalled()
  })

  it('rejects a stale workspace before asking the system to open anything', async () => {
    const externalOpen = createExternalOpenPort()
    const useCase = new OpenWorkspaceExternallyUseCase(
      createProjectRepository(projectSnapshot),
      externalOpen
    )

    await expect(
      useCase.execute({
        projectDirectory: '/work/app',
        target: 'folder',
        workspaceId: 'missing'
      })
    ).rejects.toMatchObject({ code: 'BRANCH_WORKSPACE_NOT_FOUND', isExpected: true })
    expect(externalOpen.open).not.toHaveBeenCalled()
  })

  it('projects system discovery through the application capability query', async () => {
    const capabilities = {
      vscode: { available: true }
    }
    const externalOpen = createExternalOpenPort()
    externalOpen.getCapabilities.mockResolvedValue(capabilities)

    await expect(
      new GetWorkspaceExternalOpenCapabilitiesUseCase(externalOpen).execute()
    ).resolves.toEqual(capabilities)
  })
})

const projectSnapshot: ProjectSnapshot = {
  id: 'project-1',
  directory: '/work/app',
  name: 'app',
  workspaces: [
    {
      workspaceId: 'main',
      workspaceKind: 'default',
      displayName: 'main',
      directory: '/work/app',
      gitBranch: 'main',
      isCurrent: false
    },
    {
      workspaceId: 'feature',
      workspaceKind: 'linked-worktree',
      displayName: 'feature',
      directory: '/work/app-feature',
      gitBranch: 'feature',
      isCurrent: true
    }
  ]
}

function createProjectRepository(snapshot: ProjectSnapshot | null): ProjectRepository {
  return {
    findByDirectory: vi.fn(async () => snapshot),
    save: vi.fn()
  }
}

function createExternalOpenPort(): WorkspaceExternalOpenPort & {
  readonly getCapabilities: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
} {
  return {
    getCapabilities: vi.fn(async () => ({
      vscode: { available: false }
    })),
    open: vi.fn(async () => undefined)
  } satisfies WorkspaceExternalOpenPort
}
