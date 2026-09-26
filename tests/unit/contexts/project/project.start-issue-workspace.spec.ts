import { ProjectIssueReadCache } from '../../../../src/contexts/project/application/services/ProjectIssueReadCache'
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
  it('replaces a legacy invalid uncreated request after the branch name is corrected', async () => {
    const f = fixture(true, 'issue/invalid name')
    await f.useCase.execute({
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/fixed',
      baseBranch: 'main'
    })
    expect(f.cancelOne).toHaveBeenCalledWith('/project', 'original')
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({
        branchName: 'issue/fixed',
        requestId: undefined,
        baseRef: 'b'.repeat(40)
      })
    )
  })

  it('keeps a legacy request when its replacement is still invalid', async () => {
    const f = fixture(true, 'issue/invalid name')
    await expect(
      f.useCase.execute({
        projectDirectory: '/project',
        repository: 'owner/repo',
        number: 42,
        branchName: 'issue/still invalid',
        baseBranch: 'main'
      })
    ).rejects.toMatchObject({ code: 'GIT_BRANCH_NAME_INVALID' })
    expect(f.cancelOne).not.toHaveBeenCalled()
    expect(f.base.resolve).not.toHaveBeenCalled()
    expect(f.create).not.toHaveBeenCalled()
  })

  it('does not prepare a base for an invalid new branch', async () => {
    const f = fixture(false)
    await expect(
      f.useCase.execute({
        projectDirectory: '/project',
        repository: 'owner/repo',
        number: 42,
        branchName: 'HEAD',
        baseBranch: 'main'
      })
    ).rejects.toMatchObject({ code: 'GIT_BRANCH_NAME_INVALID' })
    expect(f.base.resolve).not.toHaveBeenCalled()
    expect(f.create).not.toHaveBeenCalled()
  })

  it('reuses a provider-read Issue and prepares without creating or selecting a workspace', async () => {
    const f = fixture(false)
    f.cache.rememberIssue(f.project(), issue)
    f.github.issue.mockRejectedValue(new Error('Offline'))
    const command = {
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/42',
      baseBranch: 'main'
    }
    await f.useCase.prepare(command)
    expect(f.create).not.toHaveBeenCalled()
    const progress = vi.fn()
    await f.useCase.execute(command, progress)
    expect(f.github.issue).not.toHaveBeenCalled()
    expect(f.github.repository).not.toHaveBeenCalled()
    expect(progress.mock.calls).toEqual([['preparing'], ['creating']])
    expect(f.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseRef: 'b'.repeat(40),
        issue: expect.objectContaining({ id: issue.id })
      })
    )
  })

  it.each(['source', 'identity'] as const)(
    'rejects a changed project %s after preparation',
    async (change) => {
      const f = fixture(false)
      f.base.resolve.mockImplementation(async () => {
        f.update(change === 'source' ? { issueRepository: 'other/repo' } : { id: 'replacement' })
        return 'b'.repeat(40)
      })
      await expect(
        f.useCase.execute({
          projectDirectory: '/project',
          repository: 'owner/repo',
          number: 42,
          branchName: 'issue/42',
          baseBranch: 'main'
        })
      ).rejects.toMatchObject({ code: 'PROJECT_ISSUE_INVALID' })
      expect(f.create).not.toHaveBeenCalled()
    }
  )

  it('serializes duplicate starts into one created workspace', async () => {
    const { useCase, create, github } = fixture(false)
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
    expect(github.issue).toHaveBeenCalledOnce()
  })

  it('resumes a persisted creation with its frozen base instead of fetching a new base', async () => {
    const { useCase, create, base, github, cancelOne } = fixture()
    await useCase.execute({
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/edited-on-retry',
      baseBranch: 'main'
    })
    expect(base.resolve).not.toHaveBeenCalled()
    expect(cancelOne).not.toHaveBeenCalled()
    expect(github.issue).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'original',
        branchName: 'issue/42',
        baseRef: 'a'.repeat(40),
        issue
      })
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

function fixture(withPending = true, pendingBranch = 'issue/42') {
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
  const github = { repository: vi.fn(), list: vi.fn(), issue: vi.fn(async () => issue) }
  const cache = new ProjectIssueReadCache()
  const cancelOne = vi.fn(async () => {
    withPending = false
  })
  const useCase = new StartIssueWorkspaceUseCase({
    cache,
    scope: { require: async () => project },
    github,
    base,
    preparation: {
      create,
      cancelOne,
      list: async () =>
        withPending
          ? [
              {
                id: 'original',
                projectId: 'project',
                projectDirectory: '/project',
                workspaceId: 'workspace',
                workspaceDirectory: '/worktree',
                branchName: pendingBranch,
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
  return {
    useCase,
    create,
    base,
    github,
    cache,
    cancelOne,
    project: () => project,
    update: (value: Partial<ProjectSnapshot>) => {
      project = { ...project, ...value }
    }
  }
}
