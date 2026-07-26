import { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

describe('project physical workspaces', () => {
  it('keeps the default workspace identity across git initialization and branch changes', () => {
    const created = createProject()
    const initialized = created.bindDefaultWorkspaceToGit({
      directory: '/work/app',
      gitBranch: 'main'
    })
    const switched = initialized.bindDefaultWorkspaceToGit({
      directory: '/work/app',
      gitBranch: 'feature/identity'
    })

    expect(created.currentWorkspace.workspaceId).toBe('workspace-default')
    expect(initialized.currentWorkspace.workspaceId).toBe('workspace-default')
    expect(switched.currentWorkspace).toEqual(defaultWorkspace({ gitBranch: 'feature/identity' }))
  })

  it('adds a linked worktree and makes it the only current workspace', () => {
    const project = createProject()
      .bindDefaultWorkspaceToGit({
        directory: '/work/app',
        gitBranch: 'main'
      })
      .addLinkedWorktreeWorkspace({
        workspaceId: 'workspace-feature',
        displayName: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar'
      })

    expect(project.currentWorkspace.workspaceId).toBe('workspace-feature')
    expect(project.workspaces).toEqual([
      defaultWorkspace({ gitBranch: 'main', isCurrent: false }),
      featureWorkspace()
    ])
  })

  it('switches workspaces by stable id without changing git metadata', () => {
    const project = createProject()
      .addLinkedWorktreeWorkspace({
        workspaceId: 'workspace-feature',
        displayName: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar'
      })
      .switchCurrentWorkspace('workspace-default')

    expect(project.currentWorkspace.workspaceId).toBe('workspace-default')
    expect(
      project.workspaces.find(({ workspaceId }) => workspaceId === 'workspace-feature')
    ).toEqual(featureWorkspace({ isCurrent: false }))
  })

  it('archives a linked worktree by id and falls back to the default workspace', () => {
    const project = createProject()
      .addLinkedWorktreeWorkspace({
        workspaceId: 'workspace-feature',
        displayName: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar'
      })
      .archiveLinkedWorktreeWorkspace('workspace-feature')

    expect(project.workspaces).toEqual([defaultWorkspace()])
  })

  it('rejects archiving the default workspace', () => {
    expect(() => createProject().archiveLinkedWorktreeWorkspace('workspace-default')).toThrow(
      'Main workspace cannot be archived.'
    )
  })

  it('rejects duplicate linked-worktree display names and git bindings', () => {
    const project = createProject().addLinkedWorktreeWorkspace({
      workspaceId: 'workspace-feature',
      displayName: 'feature/sidebar',
      directory: '/state/worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    })

    expect(() =>
      project.addLinkedWorktreeWorkspace({
        workspaceId: 'workspace-other',
        displayName: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar-2',
        gitBranch: 'feature/sidebar'
      })
    ).toThrow('Branch workspace already exists.')
  })

  it('normalizes restored workspaces to a single current workspace', () => {
    const project = Project.fromSnapshot({
      id: 'project-1',
      directory: '/work/app',
      name: 'app',
      workspaces: [defaultWorkspace(), featureWorkspace()]
    })

    expect(project.workspaces.filter(({ isCurrent }) => isCurrent)).toEqual([defaultWorkspace()])
  })

  it('preserves linked-worktree ids when either its branch or directory changes', () => {
    const moved = Project.fromSnapshot({
      id: 'project-1',
      directory: '/work/app',
      name: 'app',
      workspaces: [defaultWorkspace({ isCurrent: false }), featureWorkspace()]
    }).syncGitBranchWorkspaces({
      mainDirectory: '/work/app',
      mainGitBranch: 'trunk',
      worktrees: [
        {
          branchName: 'feature/sidebar',
          directory: '/state/worktrees/feature-sidebar-moved'
        }
      ]
    })
    const switched = moved.syncGitBranchWorkspaces({
      mainDirectory: '/work/app',
      mainGitBranch: 'trunk',
      worktrees: [
        {
          branchName: 'feature/sidebar-v2',
          directory: '/state/worktrees/feature-sidebar-moved'
        }
      ]
    })

    expect(moved.currentWorkspace.workspaceId).toBe('workspace-feature')
    expect(switched.currentWorkspace).toMatchObject({
      workspaceId: 'workspace-feature',
      directory: '/state/worktrees/feature-sidebar-moved',
      gitBranch: 'feature/sidebar-v2'
    })
  })
})

function createProject(): Project {
  return Project.create({
    id: 'project-1',
    defaultWorkspaceId: 'workspace-default',
    directory: '/work/app',
    name: 'app'
  })
}

function defaultWorkspace(
  overrides: Partial<ReturnType<Project['toSnapshot']>['workspaces'][number]> = {}
) {
  return {
    workspaceId: 'workspace-default',
    workspaceKind: 'default' as const,
    displayName: 'main',
    directory: '/work/app',
    gitBranch: null,
    isCurrent: true,
    ...overrides
  }
}

function featureWorkspace(
  overrides: Partial<ReturnType<Project['toSnapshot']>['workspaces'][number]> = {}
) {
  return {
    workspaceId: 'workspace-feature',
    workspaceKind: 'linked-worktree' as const,
    displayName: 'feature/sidebar',
    directory: '/state/worktrees/feature-sidebar',
    gitBranch: 'feature/sidebar',
    isCurrent: true,
    ...overrides
  }
}
