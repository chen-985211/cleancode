import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentTerminalSourceTheme,
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { CodexCliInstallationSnapshot } from '../../contexts/agent/application/ports/CodexCliPort'
import type { AgentLayoutSnapshot } from '../../contexts/agent/domain/aggregates/AgentSession'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

interface IpcSender {
  isDestroyed(): boolean
  send(channel: string, event: unknown): void
}

export interface AgentIpcHandlersInput {
  readonly approveAgentTool: (approvalId: string) => Promise<AgentToolApprovalDecisionResult>
  readonly attachAgentSession: (command: {
    readonly agentId: string
    readonly columns?: number
    readonly gitBranch?: string | null
    readonly onExit: (event: AgentPtyExitEvent) => void
    readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
    readonly onOutput: (event: AgentPtyOutputEvent) => void
    readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
    readonly persistenceMode?: 'ephemeral' | 'persistent'
    readonly projectDirectory: string
    readonly projectId: string
    readonly restartMode?: 'new' | 'retry'
    readonly rows?: number
    readonly terminalSourceTheme: AgentTerminalSourceTheme
    readonly workspaceDirectory: string
    readonly workspaceName: string
  }) => Promise<AgentSessionSnapshot>
  readonly createWorkspaceAgent: (command: {
    readonly layout: AgentLayoutSnapshot
    readonly projectId: string
    readonly workspaceName: string
  }) => Promise<WorkspaceAgentSnapshot>
  readonly disposeAgentWorkspaceSession: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }) => Promise<void>
  readonly disposeProjectAgentSessions: (projectDirectory: string) => Promise<void>
  readonly inspectCodexCli: () => Promise<CodexCliInstallationSnapshot>
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly rejectAgentTool: (approvalId: string) => void
  readonly removeWorkspaceAgent: (command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }) => Promise<readonly WorkspaceAgentSnapshot[]>
  readonly renameWorkspaceAgent: (command: {
    readonly agentId: string
    readonly name: string
    readonly projectId: string
    readonly workspaceName: string
  }) => Promise<WorkspaceAgentSnapshot>
  readonly resizeAgentSession: (sessionId: string, columns: number, rows: number) => void
  readonly writeAgentSession: (sessionId: string, input: string) => void
  readonly updateWorkspaceAgentLayout: (command: {
    readonly agentId: string
    readonly layout: AgentLayoutSnapshot
    readonly projectId: string
    readonly workspaceName: string
  }) => Promise<WorkspaceAgentSnapshot>
  readonly updateWorkspaceAgentMcpCapability: (command: {
    readonly agentId: string
    readonly cleancodeMcpEnabled: boolean
    readonly projectId: string
    readonly workspaceName: string
  }) => Promise<UpdateWorkspaceAgentMcpCapabilityResult>
}

export function registerAgentIpcHandlers(input: AgentIpcHandlersInput): void {
  registerIpcHandler<void, CodexCliInstallationSnapshot>({
    channel: 'cleancode:inspect-codex-cli',
    handler: () => input.inspectCodexCli(),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'inspectCodexCli',
    scope: 'agent'
  })

  registerIpcHandler<
    {
      readonly agentId: string
      readonly columns?: number
      readonly gitBranch?: string | null
      readonly projectDirectory: string
      readonly projectId: string
      readonly persistenceMode?: 'ephemeral' | 'persistent'
      readonly restartMode?: 'new' | 'retry'
      readonly rows?: number
      readonly terminalSourceTheme: AgentTerminalSourceTheme
      readonly workspaceDirectory: string
      readonly workspaceName: string
    },
    AgentSessionSnapshot
  >({
    channel: 'cleancode:attach-agent-session',
    handler: (command, event) => {
      const terminalSourceTheme = readAgentTerminalSourceTheme(command.terminalSourceTheme)
      const sender = readIpcSender(event)

      return input.attachAgentSession({
        agentId: command.agentId,
        columns: command.columns,
        gitBranch: command.gitBranch,
        onExit: (exitEvent) => sendIfAlive(sender, 'cleancode:agent-pty-exit', exitEvent),
        onGraphUpdated: (graphEvent) =>
          sendIfAlive(sender, 'cleancode:agent-graph-updated', graphEvent),
        onOutput: (outputEvent) => sendIfAlive(sender, 'cleancode:agent-pty-output', outputEvent),
        onToolApprovalRequested: (approvalEvent) =>
          sendIfAlive(sender, 'cleancode:agent-tool-approval-requested', approvalEvent),
        persistenceMode: command.persistenceMode,
        projectDirectory: command.projectDirectory,
        projectId: command.projectId,
        restartMode: command.restartMode,
        rows: command.rows,
        terminalSourceTheme,
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'attachAgentSession',
    scope: 'agent'
  })

  registerIpcHandler<
    {
      readonly layout: AgentLayoutSnapshot
      readonly projectId: string
      readonly workspaceName: string
    },
    WorkspaceAgentSnapshot
  >({
    channel: 'cleancode:create-workspace-agent',
    handler: (command) => input.createWorkspaceAgent(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'createWorkspaceAgent',
    scope: 'agent',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly agentId: string
      readonly name: string
      readonly projectId: string
      readonly workspaceName: string
    },
    WorkspaceAgentSnapshot
  >({
    channel: 'cleancode:rename-workspace-agent',
    handler: (command) => input.renameWorkspaceAgent(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'renameWorkspaceAgent',
    scope: 'agent',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly agentId: string
      readonly layout: AgentLayoutSnapshot
      readonly projectId: string
      readonly workspaceName: string
    },
    WorkspaceAgentSnapshot
  >({
    channel: 'cleancode:update-workspace-agent-layout',
    handler: (command) => input.updateWorkspaceAgentLayout(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateWorkspaceAgentLayout',
    scope: 'agent'
  })

  registerIpcHandler<
    {
      readonly agentId: string
      readonly cleancodeMcpEnabled: boolean
      readonly projectId: string
      readonly workspaceName: string
    },
    UpdateWorkspaceAgentMcpCapabilityResult
  >({
    channel: 'cleancode:update-workspace-agent-mcp-capability',
    handler: (command) => {
      if (typeof command.cleancodeMcpEnabled !== 'boolean') {
        throw createExpectedAppError(
          'INVALID_IPC_COMMAND',
          'Invalid IPC command: cleancodeMcpEnabled must be a boolean.'
        )
      }
      return input.updateWorkspaceAgentMcpCapability(command)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateWorkspaceAgentMcpCapability',
    scope: 'agent',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly agentId: string
      readonly projectId: string
      readonly workspaceName: string
    },
    readonly WorkspaceAgentSnapshot[]
  >({
    channel: 'cleancode:remove-workspace-agent',
    handler: (command) => input.removeWorkspaceAgent(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'removeWorkspaceAgent',
    scope: 'agent',
    successLogLevel: 'info'
  })

  registerIpcHandler<{ readonly sessionId: string; readonly input: string }, void>({
    channel: 'cleancode:write-agent-session',
    handler: (command) => input.writeAgentSession(command.sessionId, command.input),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'writeAgentSession',
    scope: 'agent'
  })

  registerIpcHandler<
    { readonly sessionId: string; readonly columns: number; readonly rows: number },
    void
  >({
    channel: 'cleancode:resize-agent-session',
    handler: (command) =>
      input.resizeAgentSession(command.sessionId, command.columns, command.rows),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'resizeAgentSession',
    scope: 'agent'
  })

  registerIpcHandler<{ readonly projectDirectory: string; readonly workspaceName: string }, void>({
    channel: 'cleancode:dispose-agent-workspace-session',
    handler: (command) => input.disposeAgentWorkspaceSession(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'disposeAgentWorkspaceSession',
    scope: 'agent'
  })

  registerIpcHandler<{ readonly projectDirectory: string }, void>({
    channel: 'cleancode:dispose-project-agent-sessions',
    handler: (command) => input.disposeProjectAgentSessions(command.projectDirectory),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'disposeProjectAgentSessions',
    scope: 'agent'
  })

  registerIpcHandler<{ readonly approvalId: string }, AgentToolApprovalDecisionResult>({
    channel: 'cleancode:approve-agent-tool',
    handler: (command) => input.approveAgentTool(command.approvalId),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'approveAgentTool',
    scope: 'agent',
    successLogLevel: 'info'
  })

  registerIpcHandler<{ readonly approvalId: string }, void>({
    channel: 'cleancode:reject-agent-tool',
    handler: (command) => input.rejectAgentTool(command.approvalId),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'rejectAgentTool',
    scope: 'agent'
  })
}

function readAgentTerminalSourceTheme(value: unknown): AgentTerminalSourceTheme {
  if (value === 'dark' || value === 'light') {
    return value
  }

  throw createExpectedAppError(
    'INVALID_IPC_COMMAND',
    'Invalid IPC command: terminalSourceTheme must be light or dark.'
  )
}

function sendIfAlive(sender: IpcSender, channel: string, event: unknown): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, event)
  }
}

function readIpcSender(event: unknown): IpcSender {
  if (!isRecord(event) || !isRecord(event.sender)) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid IPC command: sender is required.')
  }

  const sender = event.sender

  if (typeof sender.isDestroyed !== 'function' || typeof sender.send !== 'function') {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid IPC command: sender is invalid.')
  }

  return sender as unknown as IpcSender
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
