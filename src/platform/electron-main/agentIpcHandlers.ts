import type {
  AgentGraphUpdatedEvent,
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot,
  AgentTerminalSourceTheme,
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentProviderPreferencesSnapshot } from '../../contexts/agent/domain/aggregates/AgentProviderPreferences'
import type { UpdateAgentProviderPreferencesCommand } from '../../contexts/agent/application/use-cases/UpdateAgentProviderPreferencesUseCase'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type {
  AgentProviderAvailability,
  AgentProviderDescriptor
} from '../../contexts/agent/application/ports/AgentProviderContribution'
import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
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
    readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
    readonly onRuntimeChanged: (event: AgentRuntimeChangedEvent) => void
    readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
    readonly persistenceMode?: 'ephemeral' | 'persistent'
    readonly projectDirectory: string
    readonly projectId: string
    readonly providerId?: string
    readonly restartMode?: 'new' | 'retry'
    readonly rows?: number
    readonly terminalSourceTheme: AgentTerminalSourceTheme
    readonly workspaceDirectory: string
    readonly workspaceName: string
  }) => Promise<AgentSessionSnapshot>
  readonly createWorkspaceAgent: (command: {
    readonly agentId: string
    readonly gitBranch: string | null
    readonly initialPosition: { readonly x: number; readonly y: number }
    readonly projectDirectory: string
    readonly projectId: string
    readonly providerId: string
    readonly workspaceDirectory: string
    readonly workspaceName: string
  }) => Promise<WorkspaceAgentSnapshot>
  readonly discoverCreatableAgentProviders: (options: {
    readonly refresh?: boolean
  }) => Promise<readonly CreatableAgentProviderSnapshot[]>
  readonly disposeAgentWorkspaceSession: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }) => Promise<void>
  readonly disposeProjectAgentSessions: (projectDirectory: string) => Promise<void>
  readonly inspectAgentProvider: (providerId: string) => Promise<AgentProviderAvailability>
  readonly getAgentProviderPreferences: () => Promise<AgentProviderPreferencesSnapshot>
  readonly listAgentProviders: () => readonly AgentProviderDescriptor[]
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly rejectAgentTool: (approvalId: string) => Promise<void>
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
  readonly updateAgentProviderPreferences: (
    command: UpdateAgentProviderPreferencesCommand
  ) => Promise<AgentProviderPreferencesSnapshot>
}

export function registerAgentIpcHandlers(input: AgentIpcHandlersInput): void {
  registerIpcHandler<void, AgentProviderPreferencesSnapshot>({
    channel: 'cleancode:get-agent-provider-preferences',
    handler: () => input.getAgentProviderPreferences(),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'getAgentProviderPreferences',
    scope: 'agent'
  })

  registerIpcHandler<unknown, AgentProviderPreferencesSnapshot>({
    channel: 'cleancode:update-agent-provider-preferences',
    handler: (command) =>
      input.updateAgentProviderPreferences(readAgentProviderPreferencesPatch(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateAgentProviderPreferences',
    scope: 'agent',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    { readonly refresh?: boolean } | undefined,
    readonly CreatableAgentProviderSnapshot[]
  >({
    channel: 'cleancode:discover-creatable-agent-providers',
    handler: (command) => input.discoverCreatableAgentProviders(readDiscoveryOptions(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'discoverCreatableAgentProviders',
    scope: 'agent'
  })

  registerIpcHandler<{ readonly providerId: string }, AgentProviderAvailability>({
    channel: 'cleancode:inspect-agent-provider',
    handler: (command) => input.inspectAgentProvider(readProviderId(command.providerId)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'inspectAgentProvider',
    scope: 'agent'
  })

  registerIpcHandler<void, readonly AgentProviderDescriptor[]>({
    channel: 'cleancode:list-agent-providers',
    handler: () => input.listAgentProviders(),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listAgentProviders',
    scope: 'agent'
  })

  registerIpcHandler<
    {
      readonly agentId: string
      readonly columns?: number
      readonly gitBranch?: string | null
      readonly projectDirectory: string
      readonly projectId: string
      readonly providerId?: string
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
        onGraphUpdated: (graphEvent) =>
          sendIfAlive(sender, 'cleancode:agent-graph-updated', graphEvent),
        onRuntimeChanged: (runtimeEvent) =>
          sendIfAlive(sender, 'cleancode:agent-runtime-changed', runtimeEvent),
        onToolApprovalRequested: (approvalEvent) =>
          sendIfAlive(sender, 'cleancode:agent-tool-approval-requested', approvalEvent),
        persistenceMode: command.persistenceMode,
        projectDirectory: command.projectDirectory,
        projectId: command.projectId,
        providerId: command.providerId,
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
      readonly agentId: string
      readonly gitBranch: string | null
      readonly initialPosition: { readonly x: number; readonly y: number }
      readonly projectDirectory: string
      readonly projectId: string
      readonly providerId: string
      readonly workspaceDirectory: string
      readonly workspaceName: string
    },
    WorkspaceAgentSnapshot
  >({
    channel: 'cleancode:create-workspace-agent',
    handler: (command) => input.createWorkspaceAgent(readCreateWorkspaceAgentCommand(command)),
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

function readProviderId(value: unknown): string {
  if (typeof value === 'string' && value.trim() === value && value.length > 0) return value
  throw createExpectedAppError(
    'INVALID_IPC_COMMAND',
    'Invalid IPC command: providerId must be a non-empty string.'
  )
}

function readCreateWorkspaceAgentCommand(command: unknown): {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly initialPosition: { readonly x: number; readonly y: number }
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly workspaceDirectory: string
  readonly workspaceName: string
} {
  if (!isRecord(command)) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid Agent creation command.')
  }
  return {
    agentId: readRequiredString(command.agentId, 'agentId'),
    gitBranch:
      command.gitBranch === null ? null : readRequiredString(command.gitBranch, 'gitBranch'),
    initialPosition: readAgentInitialPosition(command.initialPosition),
    projectDirectory: readRequiredString(command.projectDirectory, 'projectDirectory'),
    projectId: readRequiredString(command.projectId, 'projectId'),
    providerId: readProviderId(command.providerId),
    workspaceDirectory: readRequiredString(command.workspaceDirectory, 'workspaceDirectory'),
    workspaceName: readRequiredString(command.workspaceName, 'workspaceName')
  }
}

function readAgentInitialPosition(value: unknown): { readonly x: number; readonly y: number } {
  if (isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.y)) {
    return {
      x: value.x as number,
      y: value.y as number
    }
  }

  throw createExpectedAppError(
    'INVALID_IPC_COMMAND',
    'Invalid IPC command: initialPosition must contain finite x and y coordinates.'
  )
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value === 'string' && value.trim() === value && value.length > 0) return value
  throw createExpectedAppError(
    'INVALID_IPC_COMMAND',
    `Invalid IPC command: ${fieldName} must be a non-empty string.`
  )
}

function readDiscoveryOptions(value: unknown): { readonly refresh?: boolean } {
  if (value === undefined) return {}
  if (!isRecord(value) || (value.refresh !== undefined && typeof value.refresh !== 'boolean')) {
    throw createExpectedAppError(
      'INVALID_IPC_COMMAND',
      'Invalid IPC command: refresh must be a boolean.'
    )
  }
  return value.refresh === undefined ? {} : { refresh: value.refresh }
}

function readAgentProviderPreferencesPatch(value: unknown): UpdateAgentProviderPreferencesCommand {
  if (!isRecord(value)) {
    throw createExpectedAppError(
      'INVALID_IPC_COMMAND',
      'Invalid IPC command: Agent Provider preferences patch is required.'
    )
  }
  const patch: UpdateAgentProviderPreferencesCommand = {}
  if ('defaultCleancodeMcpEnabled' in value) {
    if (typeof value.defaultCleancodeMcpEnabled !== 'boolean') {
      throw invalidPreferencesPatch('defaultCleancodeMcpEnabled must be a boolean.')
    }
    Object.assign(patch, { defaultCleancodeMcpEnabled: value.defaultCleancodeMcpEnabled })
  }
  if ('defaultProviderId' in value) {
    if (value.defaultProviderId !== null && typeof value.defaultProviderId !== 'string') {
      throw invalidPreferencesPatch('defaultProviderId must be a string or null.')
    }
    Object.assign(patch, { defaultProviderId: value.defaultProviderId })
  }
  if ('disabledProviderIds' in value) {
    if (
      !Array.isArray(value.disabledProviderIds) ||
      !value.disabledProviderIds.every((providerId) => typeof providerId === 'string')
    ) {
      throw invalidPreferencesPatch('disabledProviderIds must be a string array.')
    }
    Object.assign(patch, { disabledProviderIds: value.disabledProviderIds })
  }
  if ('permissionMode' in value) {
    if (value.permissionMode !== 'yolo' && value.permissionMode !== 'manual') {
      throw invalidPreferencesPatch('permissionMode must be yolo or manual.')
    }
    Object.assign(patch, { permissionMode: value.permissionMode })
  }
  if ('providerOverrides' in value) {
    Object.assign(patch, { providerOverrides: readProviderOverrides(value.providerOverrides) })
  }
  return patch
}

function readProviderOverrides(value: unknown) {
  if (!isRecord(value)) throw invalidPreferencesPatch('providerOverrides must be an object.')
  return Object.fromEntries(
    Object.entries(value).map(([providerId, override]) => {
      if (!isRecord(override)) {
        throw invalidPreferencesPatch(`Provider override "${providerId}" must be an object.`)
      }
      if (
        typeof override.argumentsText !== 'string' ||
        !isStringRecord(override.environment) ||
        (override.executable !== undefined && typeof override.executable !== 'string')
      ) {
        throw invalidPreferencesPatch(`Provider override "${providerId}" is invalid.`)
      }
      return [
        providerId,
        {
          argumentsText: override.argumentsText,
          environment: override.environment,
          ...(override.executable === undefined ? {} : { executable: override.executable })
        }
      ]
    })
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
}

function invalidPreferencesPatch(message: string) {
  return createExpectedAppError('INVALID_IPC_COMMAND', `Invalid IPC command: ${message}`)
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
