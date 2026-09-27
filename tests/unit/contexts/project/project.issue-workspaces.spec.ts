import { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

const issue = {
  id: 'I_example',
  repository: 'owner/repo',
  number: 42,
  title: 'Fix resizing',
  url: 'https://github.com/owner/repo/issues/42'
}

describe('project issue workspaces', () => {
  it('keeps repository selection and issue identity through workspace changes and Git synchronization', () => {
    const project = Project.create({ name: 'Project', directory: '/project' })
      .bindIssueRepository('owner/repo')
      .addLinkedWorktreeWorkspace({
        workspaceId: 'task',
        displayName: 'issue/42',
        directory: '/task',
        gitBranch: 'issue/42',
        issue
      })
    const synchronized = Project.fromSnapshot(project.toSnapshot()).syncGitBranchWorkspaces({
      mainDirectory: '/project',
      mainGitBranch: 'main',
      worktrees: [{ branchName: 'issue/42', directory: '/task' }]
    })
    expect(synchronized.toSnapshot().issueRepository).toBe('owner/repo')
    expect(synchronized.workspaces.find((w) => w.workspaceId === 'task')?.issue).toEqual(issue)
    expect(synchronized.archiveLinkedWorktreeWorkspace('task').toSnapshot().issueRepository).toBe(
      'owner/repo'
    )
  })

  it('allows only one active workspace for an issue in a project', () => {
    const project = Project.create({
      name: 'Project',
      directory: '/project'
    }).addLinkedWorktreeWorkspace({
      displayName: 'one',
      directory: '/one',
      gitBranch: 'one',
      issue
    })
    expect(() =>
      project.addLinkedWorktreeWorkspace({
        displayName: 'two',
        directory: '/two',
        gitBranch: 'two',
        issue
      })
    ).toThrow()
  })

  it('rejects invalid repository selections', () => {
    const project = Project.create({ name: 'Project', directory: '/project' })
    for (const repository of [
      '--help',
      '../repo',
      'owner/.',
      'owner/..',
      'https://example.com/repo',
      'owner/repo/extra'
    ]) {
      expect(() => project.bindIssueRepository(repository)).toThrow()
    }
  })
})
