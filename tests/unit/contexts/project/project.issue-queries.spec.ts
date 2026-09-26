import { ProjectIssueReadCache } from '../../../../src/contexts/project/application/services/ProjectIssueReadCache'
import type { ProjectIssueSnapshot } from '../../../../src/contexts/project/application/dto/ProjectIssues'
import { Project } from '../../../../src/contexts/project/domain/aggregates/Project'
import { ProjectIssueScope } from '../../../../src/contexts/project/application/services/ProjectIssueScope'
import { ListProjectIssuesUseCase } from '../../../../src/contexts/project/application/use-cases/ListProjectIssuesUseCase'
import { GetProjectIssueUseCase } from '../../../../src/contexts/project/application/use-cases/GetProjectIssueUseCase'
import { ConfigureProjectIssueRepositoryUseCase } from '../../../../src/contexts/project/application/use-cases/ConfigureProjectIssueRepositoryUseCase'
import { ProjectWorkspaceTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'

describe('project issue queries and configuration', () => {
  it('keeps provider-read references isolated by project identity and selected source', async () => {
    const f = fixture()
    const cache = new ProjectIssueReadCache()
    const issue: ProjectIssueSnapshot = {
      id: 'I_42',
      repository: 'owner/repo',
      number: 42,
      title: 'Listed',
      url: 'https://github.com/owner/repo/issues/42',
      body: 'Private body',
      state: 'OPEN',
      labels: [],
      assignees: []
    }
    f.github.list.mockResolvedValue([issue])
    await new ListProjectIssuesUseCase(f.scope, f.github, cache).execute({
      projectDirectory: '/project'
    })
    const project = f.project().toSnapshot()
    expect(cache.repository(project)?.name).toBe('owner/repo')
    expect(cache.issue(project, 'OWNER/repo', 42)).toMatchObject({ id: 'I_42', title: 'Listed' })
    expect(cache.issue(project, 'owner/repo', 42)).not.toHaveProperty('body')
    f.github.issue.mockResolvedValue({ ...issue, title: 'Updated' })
    await new GetProjectIssueUseCase(f.scope, f.github, cache).execute({
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42
    })
    expect(cache.issue(project, 'owner/repo', 42)?.title).toBe('Updated')
    for (const changed of [
      { ...project, id: 'replacement' },
      { ...project, directory: '/other' },
      { ...project, issueRepository: 'other/repo' }
    ]) {
      expect(cache.issue(changed, 'owner/repo', 42)).toBeUndefined()
      expect(cache.repository(changed)).toBeUndefined()
    }
  })
  it('retains the resolved repository when listing issues fails', async () => {
    const f = fixture()
    f.github.list.mockRejectedValue(
      createExpectedAppError('GITHUB_REQUEST_FAILED', 'Request failed')
    )
    await expect(
      new ListProjectIssuesUseCase(f.scope, f.github).execute({ projectDirectory: '/project' })
    ).rejects.toMatchObject({
      code: 'GITHUB_REQUEST_FAILED',
      details: { repository: 'owner/repo' }
    })
  })
  it('queries the project root repository even while a linked worktree is selected', async () => {
    const f = fixture()
    await new ListProjectIssuesUseCase(f.scope, f.github).execute({
      projectDirectory: '/project',
      search: 'resize',
      assignedToMe: true,
      label: 'bug'
    })
    expect(f.github.repository).toHaveBeenCalledWith('/project', 'owner/repo')
    expect(f.github.list).toHaveBeenCalledWith(
      '/project',
      'owner/repo',
      expect.objectContaining({ search: 'resize', assignedToMe: true, label: 'bug', limit: 51 })
    )
  })
  it('saves a validated repository without overwriting a newer workspace selection', async () => {
    const f = fixture()
    const configure = new ConfigureProjectIssueRepositoryUseCase(
      f.scope,
      f.github,
      f.projects,
      new ProjectWorkspaceTransactionCoordinator()
    )
    await configure.execute({ projectDirectory: '/project', repository: 'owner/repo' })
    expect(f.projects.save).toHaveBeenCalledOnce()
    expect(f.project().currentWorkspace.workspaceId).toBe('task')
  })
  it('rejects issue queries against an outdated project repository selection', async () => {
    const f = fixture()
    await expect(
      new GetProjectIssueUseCase(f.scope, f.github).execute({
        projectDirectory: '/project',
        repository: 'other/repo',
        number: 42
      })
    ).rejects.toMatchObject({ code: 'PROJECT_ISSUE_INVALID' })
    expect(f.github.issue).not.toHaveBeenCalled()
  })
  it('rejects forgotten projects before contacting GitHub', async () => {
    const f = fixture()
    f.registry.get.mockResolvedValue({ projectDirectories: [], currentProjectDirectory: null })
    await expect(
      new ListProjectIssuesUseCase(f.scope, f.github).execute({ projectDirectory: '/project' })
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_REMEMBERED' })
    expect(f.github.repository).not.toHaveBeenCalled()
  })
})
function fixture() {
  let project = Project.create({ name: 'Project', directory: '/project' })
    .bindIssueRepository('owner/repo')
    .addLinkedWorktreeWorkspace({
      workspaceId: 'task',
      displayName: 'task',
      gitBranch: 'task',
      directory: '/task'
    })
  const projects = {
    findByDirectory: async () => project.toSnapshot(),
    save: vi.fn(async (value: Project) => {
      project = value
    })
  }
  const registry = {
    get: vi.fn(
      async (): Promise<{
        projectDirectories: readonly string[]
        currentProjectDirectory: string | null
      }> => ({ projectDirectories: ['/project'], currentProjectDirectory: '/project' })
    ),
    save: vi.fn()
  }
  const github = {
    repository: vi.fn(async () => ({ name: 'owner/repo', defaultBranch: 'main' })),
    list: vi.fn(async (): Promise<ProjectIssueSnapshot[]> => []),
    issue: vi.fn()
  }
  return {
    projects,
    registry,
    github,
    scope: new ProjectIssueScope(projects, registry),
    project: () => project
  }
}
