import { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

describe('project branch workspaces', () => {
  it('binds the main workspace to a real git branch while keeping the user-facing main name', () => {
    const project = Project.create({
      id: 'project-1',
      directory: '/work/app',
      name: 'app'
    }).bindMainWorkspaceToGit({
      directory: '/work/app',
      gitBranch: 'trunk'
    })

    expect(project.currentWorkspace).toEqual({
      name: 'main',
      directory: '/work/app',
      gitBranch: 'trunk',
      isCurrent: true
    })
  })

  it('adds a git branch workspace and makes it the only current workspace', () => {
    const project = Project.create({
      id: 'project-1',
      directory: '/work/app',
      name: 'app'
    })
      .bindMainWorkspaceToGit({
        directory: '/work/app',
        gitBranch: 'main'
      })
      .addBranchWorkspace({
        name: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar'
      })

    expect(project.currentWorkspace.name).toBe('feature/sidebar')
    expect(project.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: false
      },
      {
        name: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar',
        isCurrent: true
      }
    ])
  })

  it('switches the current workspace without changing git bindings', () => {
    const project = Project.create({
      id: 'project-1',
      directory: '/work/app',
      name: 'app'
    })
      .bindMainWorkspaceToGit({
        directory: '/work/app',
        gitBranch: 'main'
      })
      .addBranchWorkspace({
        name: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar'
      })
      .switchCurrentWorkspace('main')

    expect(project.currentWorkspace.name).toBe('main')
    expect(project.workspaces.filter((workspace) => workspace.isCurrent)).toHaveLength(1)
    expect(
      project.workspaces.find((workspace) => workspace.name === 'feature/sidebar')
    ).toMatchObject({
      gitBranch: 'feature/sidebar',
      isCurrent: false
    })
  })

  it('archives a non-current git branch workspace while keeping the current workspace', () => {
    const project = Project.create({
      id: 'project-1',
      directory: '/work/app',
      name: 'app'
    })
      .bindMainWorkspaceToGit({
        directory: '/work/app',
        gitBranch: 'main'
      })
      .addBranchWorkspace({
        name: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar'
      })
      .switchCurrentWorkspace('main')
      .archiveBranchWorkspace('feature/sidebar')

    expect(project.currentWorkspace.name).toBe('main')
    expect(project.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      }
    ])
  })

  it('archives the current git branch workspace by selecting main as the fallback workspace', () => {
    const project = Project.create({
      id: 'project-1',
      directory: '/work/app',
      name: 'app'
    })
      .bindMainWorkspaceToGit({
        directory: '/work/app',
        gitBranch: 'main'
      })
      .addBranchWorkspace({
        name: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar'
      })
      .archiveBranchWorkspace('feature/sidebar')

    expect(project.currentWorkspace).toEqual({
      name: 'main',
      directory: '/work/app',
      gitBranch: 'main',
      isCurrent: true
    })
    expect(project.workspaces.map((workspace) => workspace.name)).toEqual(['main'])
  })

  it('rejects archiving the main workspace', () => {
    const project = Project.create({
      id: 'project-1',
      directory: '/work/app',
      name: 'app'
    })

    expect(() => project.archiveBranchWorkspace('main')).toThrow(
      'Main workspace cannot be archived.'
    )
  })

  it('rejects duplicate branch workspaces', () => {
    const project = Project.create({
      id: 'project-1',
      directory: '/work/app',
      name: 'app'
    }).addBranchWorkspace({
      name: 'feature/sidebar',
      directory: '/state/worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    })

    expect(() =>
      project.addBranchWorkspace({
        name: 'feature/sidebar',
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
      workspaces: [
        {
          name: 'main',
          directory: '/work/app',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          name: 'feature/sidebar',
          directory: '/state/worktrees/feature-sidebar',
          gitBranch: 'feature/sidebar',
          isCurrent: true
        }
      ]
    })

    expect(project.workspaces.filter((workspace) => workspace.isCurrent)).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      }
    ])
  })

  it('syncs existing git worktrees without selecting them over the current workspace', () => {
    const project = Project.fromSnapshot({
      id: 'project-1',
      directory: '/work/app',
      name: 'app',
      workspaces: [
        {
          name: 'main',
          directory: '/work/app',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          name: 'feature/sidebar',
          directory: '/old/worktree',
          gitBranch: 'feature/sidebar',
          isCurrent: true
        }
      ]
    }).syncGitBranchWorkspaces({
      mainDirectory: '/work/app',
      mainGitBranch: 'trunk',
      worktrees: [
        {
          branchName: 'feature/sidebar',
          directory: '/state/worktrees/feature-sidebar'
        },
        {
          branchName: 'feature/api',
          directory: '/state/worktrees/feature-api'
        }
      ]
    })

    expect(project.workspaces).toEqual([
      {
        name: 'main',
        directory: '/work/app',
        gitBranch: 'trunk',
        isCurrent: false
      },
      {
        name: 'feature/sidebar',
        directory: '/state/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar',
        isCurrent: true
      },
      {
        name: 'feature/api',
        directory: '/state/worktrees/feature-api',
        gitBranch: 'feature/api',
        isCurrent: false
      }
    ])
  })
})
