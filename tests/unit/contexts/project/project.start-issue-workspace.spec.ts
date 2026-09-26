import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import { StartIssueWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/StartIssueWorkspaceUseCase'

const issue = {
  id: 'I_42',
  repository: 'owner/repo',
  number: 42,
  title: 'Resize',
  url: 'https://github.com/owner/repo/issues/42',
  body: '',
  state: 'OPEN' as const,
  labels: [],
  assignees: []
}

describe('start an issue workspace', () => {
  it('serializes duplicate starts into one created workspace', async () => {
    const { useCase, create } = fixture(false)
    const command = {
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/42',
      baseBranch: 'main'
    }
    const [first, second] = await Promise.all([useCase.execute(command), useCase.execute(command)])
    expect(create).toHaveBeenCalledOnce()
    expect(first.workspaces[0]?.workspaceId).toBe(second.workspaces[0]?.workspaceId)
  })

  it('resumes a persisted creation with its frozen base instead of fetching a new base', async () => {
    const { useCase, create, base } = fixture()
    await useCase.execute({
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/42',
      baseBranch: 'main'
    })
    expect(base.resolve).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'original', baseRef: 'a'.repeat(40), issue })
    )
  })

  it('rejects a repository changed since the list was loaded', async () => {
    const { useCase, create } = fixture()
    await expect(
      useCase.execute({
        projectDirectory: '/project',
        repository: 'other/repo',
        number: 42,
        branchName: 'issue/42',
        baseBranch: 'main'
      })
    ).rejects.toMatchObject({ code: 'PROJECT_ISSUE_INVALID' })
    expect(create).not.toHaveBeenCalled()
  })
})

function fixture(withPending = true) {
  let project: ProjectSnapshot = {
    id: 'project',
    directory: '/project',
    name: 'Project',
    issueRepository: 'owner/repo',
    workspaces: []
  }
  const create = vi.fn(async () => {
    project = {
      ...project,
      workspaces: [
        {
          workspaceId: 'task',
          workspaceKind: 'linked-worktree',
          directory: '/task',
          gitBranch: 'issue/42',
          displayName: 'issue/42',
          isCurrent: true,
          issue
        }
      ]
    }
    return project
  })
  const base = { resolve: vi.fn(async () => 'b'.repeat(40)) }
  const useCase = new StartIssueWorkspaceUseCase({
    scope: { require: async () => project },
    github: { repository: vi.fn(), list: vi.fn(), issue: async () => issue },
    base,
    preparation: {
      create,
      list: async () =>
        withPending
          ? [
              {
                id: 'original',
                projectId: 'project',
                projectDirectory: '/project',
                workspaceId: 'workspace',
                workspaceDirectory: '/worktree',
                branchName: 'issue/42',
                baseRef: 'a'.repeat(40),
                issue,
                mode: 'new-workspace' as const,
                stage: 'prepared' as const,
                items: []
              }
            ]
          : []
    },
    select: vi.fn(async () => project)
  })
  return { useCase, create, base }
}
