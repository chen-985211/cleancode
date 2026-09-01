import { findWorkspaceByDirectory } from '../../../src/presentation/app-shell/workspaceDirectoryMatching'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'

describe('workspace directory matching', () => {
  it('matches the deepest workspace containing the terminal working directory', () => {
    const workspaces: WorkbenchSnapshot['project']['workspaces'] = [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      },
      {
        workspaceId: 'feature/sidebar',
        workspaceKind: 'linked-worktree',
        displayName: 'feature/sidebar',
        directory: '/work/app/worktrees/feature-sidebar',
        gitBranch: 'feature/sidebar',
        isCurrent: false
      }
    ]

    expect(findWorkspaceByDirectory(workspaces, '/work/app/worktrees/feature-sidebar/src')).toEqual(
      workspaces[1]
    )
  })

  it('does not match sibling directories with the same prefix', () => {
    const workspaces: WorkbenchSnapshot['project']['workspaces'] = [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      }
    ]

    expect(findWorkspaceByDirectory(workspaces, '/work/app-other')).toBeNull()
  })
})
