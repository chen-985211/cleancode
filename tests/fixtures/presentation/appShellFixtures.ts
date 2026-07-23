import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types'
import type { CreatableAgentProviderSnapshot } from '../../../src/contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type {
  AgentRuntimeSnapshot,
  AgentSessionSnapshot
} from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'

const defaultAgentProviderDescriptor: AgentProviderDescriptor = {
  capabilities: {
    activityTracking: false,
    cleancodeMcp: 'required',
    launchInstructions: true,
    resume: true,
    sessionIdentityCapture: true,
    sessionRefCodec: true
  },
  displayName: 'Codex',
  icon: {
    paths: [{ d: 'M2 2h20v20H2z' }],
    viewBox: '0 0 24 24'
  },
  id: 'codex'
}

export interface RuntimeApiOverrides {
  readonly listWorkbenches?: ReturnType<typeof vi.fn>
  readonly addProject?: ReturnType<typeof vi.fn>
  readonly removeProject?: ReturnType<typeof vi.fn>
  readonly reorderProject?: ReturnType<typeof vi.fn>
  readonly archiveBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly createBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly switchBranchWorkspace?: ReturnType<typeof vi.fn>
  readonly checkoutMainWorkspaceBranch?: ReturnType<typeof vi.fn>
  readonly synchronizeProjectGitState?: ReturnType<typeof vi.fn>
  readonly inspectCodexCli?: ReturnType<typeof vi.fn>
  readonly inspectAgentProvider?: ReturnType<typeof vi.fn>
  readonly listAgentProviders?: ReturnType<typeof vi.fn>
  readonly discoverCreatableAgentProviders?: ReturnType<typeof vi.fn>
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
  readonly onAgentRuntimeChanged?: ReturnType<typeof vi.fn>
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
  const inspectCodexCli =
    overrides.inspectCodexCli ??
    vi.fn(async () => ({
      installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
      reason: 'not_found' as const,
      status: 'missing',
      version: null
    }))
  return {
    appName: 'cleancode',
    listWorkbenches: overrides.listWorkbenches ?? vi.fn(async () => []),
    addProject: overrides.addProject ?? vi.fn(),
    removeProject: overrides.removeProject ?? vi.fn(),
    reorderProject: overrides.reorderProject ?? vi.fn(),
    archiveBranchWorkspace: overrides.archiveBranchWorkspace ?? vi.fn(),
    createBranchWorkspace: overrides.createBranchWorkspace ?? vi.fn(),
    switchBranchWorkspace: overrides.switchBranchWorkspace ?? vi.fn(),
    checkoutMainWorkspaceBranch: overrides.checkoutMainWorkspaceBranch ?? vi.fn(),
    synchronizeProjectGitState: overrides.synchronizeProjectGitState ?? vi.fn(async () => null),
    inspectAgentProvider:
      overrides.inspectAgentProvider ??
      vi.fn(async (command: { readonly providerId: string }) =>
        command.providerId === 'codex'
          ? {
              ...(await (inspectCodexCli as () => Promise<Record<string, unknown>>)()),
              providerId: 'codex'
            }
          : {
              providerId: command.providerId,
              status: 'installed' as const,
              version: 'test'
            }
      ),
    listAgentProviders:
      overrides.listAgentProviders ?? vi.fn(async () => [defaultAgentProviderDescriptor]),
    discoverCreatableAgentProviders:
      overrides.discoverCreatableAgentProviders ??
      vi.fn(async (): Promise<readonly CreatableAgentProviderSnapshot[]> => [
        {
          availability: {
            providerId: 'codex',
            status: 'installed',
            version: 'test'
          },
          descriptor: defaultAgentProviderDescriptor
        }
      ]),
    attachAgentSession:
      overrides.attachAgentSession ??
      vi.fn(async (command) =>
        createAgentSessionSnapshot({
          agentId: command.agentId,
          gitBranch: command.gitBranch ?? null,
          projectDirectory: command.projectDirectory,
          projectId: command.projectId,
          providerId: command.providerId ?? 'codex',
          sessionId: `agent-${command.workspaceName}`,
          terminalSourceTheme: command.terminalSourceTheme,
          workspaceDirectory: command.workspaceDirectory,
          workspaceName: command.workspaceName
        })
      ),
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
    onAgentRuntimeChanged: overrides.onAgentRuntimeChanged ?? vi.fn(() => vi.fn()),
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

export function createAgentSessionSnapshot(
  input: Partial<Omit<AgentSessionSnapshot, 'runtime'>> & {
    readonly runtime?: AgentRuntimeSnapshot
  } = {}
): AgentSessionSnapshot {
  return {
    agentId: input.agentId ?? 'agent-1',
    gitBranch: input.gitBranch ?? null,
    projectDirectory: input.projectDirectory ?? '/repo/app',
    projectId: input.projectId ?? 'project-1',
    providerId: input.providerId ?? 'codex',
    providerSessionRef: input.providerSessionRef ?? null,
    runtime: input.runtime ?? {
      activity: { status: 'unavailable' },
      binding: { status: 'unbound' },
      launch: {
        exitCode: null,
        failureKind: null,
        generation: 1,
        launchId: 'launch-1',
        status: 'running'
      },
      mcp: { status: 'ready' },
      revision: 1,
      terminal: {
        exitCode: null,
        processId: 1,
        status: 'running',
        viewIdentity: null
      }
    },
    sessionId: input.sessionId ?? 'agent-session-1',
    terminalSourceTheme: input.terminalSourceTheme ?? 'dark',
    workspaceDirectory: input.workspaceDirectory ?? '/repo/app',
    workspaceName: input.workspaceName ?? 'main'
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
              isSelectableInMainWorkspace: false,
              isLocked: false,
              lockReason: null
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
