import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'

export interface RuntimeApiOverrides {
  readonly listWorkbenches?: ReturnType<typeof vi.fn>
  readonly addProject?: ReturnType<typeof vi.fn>
  readonly removeProject?: ReturnType<typeof vi.fn>
  readonly createBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly switchBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly checkoutMainWorkspaceBranch?: ReturnType<typeof vi.fn>
}

export function createRuntimeApi(overrides: RuntimeApiOverrides = {}) {
  return {
    appName: 'cleancode',
    listWorkbenches: overrides.listWorkbenches ?? vi.fn(async () => []),
    addProject: overrides.addProject ?? vi.fn(),
    removeProject: overrides.removeProject ?? vi.fn(),
    createBranchWorkspace: overrides.createBranchWorkspace ?? vi.fn(),
    switchBranchWorkspace: overrides.switchBranchWorkspace ?? vi.fn(),
    checkoutMainWorkspaceBranch: overrides.checkoutMainWorkspaceBranch ?? vi.fn(),
    createTerminalBlock: vi.fn(),
    updateTerminalBlockMetadata: vi.fn(),
    resizeTerminalBlock: vi.fn(),
    updateGraphViewport: vi.fn(),
    moveBlock: vi.fn(),
    deleteBlock: vi.fn(),
    saveGraph: vi.fn(),
    startTerminal: vi.fn(),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    interruptTerminal: vi.fn(),
    terminateTerminal: vi.fn(),
    onTerminalOutput: vi.fn(() => vi.fn()),
    onTerminalExit: vi.fn(() => vi.fn())
  }
}

export interface CreateWorkbenchOptions {
  readonly workspaceName?: string
  readonly workspaceDirectory?: string
  readonly gitBranch?: string | null
  readonly workspaces?: WorkbenchSnapshot['project']['workspaces']
  readonly gitBranches?: WorkbenchSnapshot['gitBranches']
}

export function createWorkbenchSnapshot(
  directory: string,
  name: string,
  options: CreateWorkbenchOptions = {}
): WorkbenchSnapshot {
  const workspaceName = options.workspaceName ?? 'main'
  const workspaceDirectory = options.workspaceDirectory ?? directory
  const gitBranch = options.gitBranch ?? null

  return {
    project: {
      id: `project-${name}`,
      name,
      directory,
      workspaces: options.workspaces ?? [
        {
          name: workspaceName,
          directory: workspaceDirectory,
          gitBranch,
          isCurrent: true
        }
      ]
    },
    gitBranches:
      options.gitBranches ??
      (gitBranch
        ? [
            {
              name: gitBranch,
              isCurrent: true,
              isMainWorkspaceBranch: true,
              worktreeDirectory: workspaceDirectory,
              isSelectableInMainWorkspace: false
            }
          ]
        : []),
    graph: {
      id: `graph-${name}`,
      projectId: `project-${name}`,
      workspaceName,
      viewport: { x: 0, y: 0, zoom: 1 },
      blocks: []
    }
  }
}
