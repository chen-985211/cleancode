import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'

export interface RuntimeApiOverrides {
  readonly listWorkbenches?: ReturnType<typeof vi.fn>
  readonly addProject?: ReturnType<typeof vi.fn>
  readonly removeProject?: ReturnType<typeof vi.fn>
  readonly archiveBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly createBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly switchBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly checkoutMainWorkspaceBranch?: ReturnType<typeof vi.fn>
  readonly synchronizeProjectGitState?: ReturnType<typeof vi.fn>
  readonly inspectCodexCli?: ReturnType<typeof vi.fn>
  readonly attachAgentSession?: ReturnType<typeof vi.fn>
  readonly createWorkspaceAgent?: ReturnType<typeof vi.fn>
  readonly renameWorkspaceAgent?: ReturnType<typeof vi.fn>
  readonly updateWorkspaceAgentLayout?: ReturnType<typeof vi.fn>
  readonly updateWorkspaceAgentMcpCapability?: ReturnType<typeof vi.fn>
  readonly removeWorkspaceAgent?: ReturnType<typeof vi.fn>
  readonly writeAgentSession?: ReturnType<typeof vi.fn>
  readonly resizeAgentSession?: ReturnType<typeof vi.fn>
  readonly disposeAgentWorkspaceSession?: ReturnType<typeof vi.fn>
  readonly disposeProjectAgentSessions?: ReturnType<typeof vi.fn>
  readonly approveAgentTool?: ReturnType<typeof vi.fn>
  readonly rejectAgentTool?: ReturnType<typeof vi.fn>
  readonly onAgentPtyOutput?: ReturnType<typeof vi.fn>
  readonly onAgentPtyExit?: ReturnType<typeof vi.fn>
  readonly onAgentGraphUpdated?: ReturnType<typeof vi.fn>
  readonly onAgentToolApprovalRequested?: ReturnType<typeof vi.fn>
  readonly createTerminalBlock?: ReturnType<typeof vi.fn>
  readonly resizeTerminalBlock?: ReturnType<typeof vi.fn>
  readonly updateTerminalBlockMetadata?: ReturnType<typeof vi.fn>
  readonly startTerminal?: ReturnType<typeof vi.fn>
  readonly writeTerminal?: ReturnType<typeof vi.fn>
  readonly terminateTerminal?: ReturnType<typeof vi.fn>
  readonly listTerminalWorkingDirectories?: ReturnType<typeof vi.fn>
  readonly onTerminalOutput?: ReturnType<typeof vi.fn>
  readonly onTerminalExit?: ReturnType<typeof vi.fn>
}

export function createRuntimeApi(overrides: RuntimeApiOverrides = {}) {
  return {
    appName: 'cleancode',
    listWorkbenches: overrides.listWorkbenches ?? vi.fn(async () => []),
    addProject: overrides.addProject ?? vi.fn(),
    removeProject: overrides.removeProject ?? vi.fn(),
    archiveBranchWorkspace: overrides.archiveBranchWorkspace ?? vi.fn(),
    createBranchWorkspace: overrides.createBranchWorkspace ?? vi.fn(),
    switchBranchWorkspace: overrides.switchBranchWorkspace ?? vi.fn(),
    checkoutMainWorkspaceBranch: overrides.checkoutMainWorkspaceBranch ?? vi.fn(),
    synchronizeProjectGitState: overrides.synchronizeProjectGitState ?? vi.fn(async () => null),
    inspectCodexCli:
      overrides.inspectCodexCli ??
      vi.fn(async () => ({
        installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
        status: 'missing',
        version: null
      })),
    attachAgentSession:
      overrides.attachAgentSession ??
      vi.fn(async (command) => ({
        agentId: command.agentId,
        codexThreadId: null,
        gitBranch: command.gitBranch ?? null,
        processId: 1,
        projectDirectory: command.projectDirectory,
        projectId: command.projectId,
        sessionId: `agent-${command.workspaceName}`,
        status: 'running',
        terminalSourceTheme: command.terminalSourceTheme,
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })),
    createWorkspaceAgent: overrides.createWorkspaceAgent ?? vi.fn(),
    renameWorkspaceAgent: overrides.renameWorkspaceAgent ?? vi.fn(),
    updateWorkspaceAgentLayout: overrides.updateWorkspaceAgentLayout ?? vi.fn(),
    updateWorkspaceAgentMcpCapability: overrides.updateWorkspaceAgentMcpCapability ?? vi.fn(),
    removeWorkspaceAgent: overrides.removeWorkspaceAgent ?? vi.fn(),
    writeAgentSession: overrides.writeAgentSession ?? vi.fn(async () => undefined),
    resizeAgentSession: overrides.resizeAgentSession ?? vi.fn(async () => undefined),
    disposeAgentWorkspaceSession:
      overrides.disposeAgentWorkspaceSession ?? vi.fn(async () => undefined),
    disposeProjectAgentSessions:
      overrides.disposeProjectAgentSessions ?? vi.fn(async () => undefined),
    approveAgentTool:
      overrides.approveAgentTool ?? vi.fn(async () => ({ status: 'not_found' as const })),
    rejectAgentTool: overrides.rejectAgentTool ?? vi.fn(async () => undefined),
    onAgentPtyOutput: overrides.onAgentPtyOutput ?? vi.fn(() => vi.fn()),
    onAgentPtyExit: overrides.onAgentPtyExit ?? vi.fn(() => vi.fn()),
    onAgentGraphUpdated: overrides.onAgentGraphUpdated ?? vi.fn(() => vi.fn()),
    onAgentToolApprovalRequested: overrides.onAgentToolApprovalRequested ?? vi.fn(() => vi.fn()),
    createTerminalBlock: overrides.createTerminalBlock ?? vi.fn(),
    createTerminalGroup: vi.fn(),
    updateTerminalBlockMetadata: overrides.updateTerminalBlockMetadata ?? vi.fn(),
    updateTerminalGroupMetadata: vi.fn(),
    setTerminalGroupCollapsed: vi.fn(),
    addTerminalToGroup: vi.fn(),
    removeTerminalFromGroup: vi.fn(),
    dissolveTerminalGroup: vi.fn(),
    resizeTerminalBlock: overrides.resizeTerminalBlock ?? vi.fn(),
    updateGraphViewport: vi.fn(),
    moveBlock: vi.fn(),
    moveTerminalGroup: vi.fn(),
    deleteBlock: vi.fn(),
    saveGraph: vi.fn(),
    startTerminal: overrides.startTerminal ?? vi.fn(),
    writeTerminal: overrides.writeTerminal ?? vi.fn(),
    resizeTerminal: vi.fn(),
    interruptTerminal: vi.fn(),
    listTerminalWorkingDirectories:
      overrides.listTerminalWorkingDirectories ?? vi.fn(async () => []),
    terminateTerminal: overrides.terminateTerminal ?? vi.fn(),
    onTerminalOutput: overrides.onTerminalOutput ?? vi.fn(() => vi.fn()),
    onTerminalExit: overrides.onTerminalExit ?? vi.fn(() => vi.fn())
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
      blocks: [],
      terminalGroups: []
    }
  }
}
