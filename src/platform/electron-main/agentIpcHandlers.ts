import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentToolApprovalRequest
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { CodexCliInstallationSnapshot } from '../../contexts/agent/application/ports/CodexCliPort'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

interface IpcSender {
  isDestroyed(): boolean
  send(channel: string, event: unknown): void
}

export interface AgentIpcHandlersInput {
  readonly approveAgentTool: (approvalId: string) => void
  readonly attachAgentSession: (command: {
    readonly columns?: number
    readonly onExit: (event: AgentPtyExitEvent) => void
    readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
    readonly onOutput: (event: AgentPtyOutputEvent) => void
    readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
    readonly projectDirectory: string
    readonly rows?: number
    readonly workspaceDirectory: string
    readonly workspaceName: string
  }) => Promise<AgentSessionSnapshot>
  readonly disposeAgentWorkspaceSession: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }) => void
  readonly disposeProjectAgentSessions: (projectDirectory: string) => void
  readonly inspectCodexCli: () => Promise<CodexCliInstallationSnapshot>
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly rejectAgentTool: (approvalId: string) => void
  readonly resizeAgentSession: (sessionId: string, columns: number, rows: number) => void
  readonly writeAgentSession: (sessionId: string, input: string) => void
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
      readonly columns?: number
      readonly projectDirectory: string
      readonly rows?: number
      readonly workspaceDirectory: string
      readonly workspaceName: string
    },
    AgentSessionSnapshot
  >({
    channel: 'cleancode:attach-agent-session',
    handler: (command, event) => {
      const sender = readIpcSender(event)

      return input.attachAgentSession({
        columns: command.columns,
        onExit: (exitEvent) => sendIfAlive(sender, 'cleancode:agent-pty-exit', exitEvent),
        onGraphUpdated: (graphEvent) =>
          sendIfAlive(sender, 'cleancode:agent-graph-updated', graphEvent),
        onOutput: (outputEvent) => sendIfAlive(sender, 'cleancode:agent-pty-output', outputEvent),
        onToolApprovalRequested: (approvalEvent) =>
          sendIfAlive(sender, 'cleancode:agent-tool-approval-requested', approvalEvent),
        projectDirectory: command.projectDirectory,
        rows: command.rows,
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'attachAgentSession',
    scope: 'agent'
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

  registerIpcHandler<{ readonly approvalId: string }, void>({
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
