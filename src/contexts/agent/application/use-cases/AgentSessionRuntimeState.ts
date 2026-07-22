import type {
  AgentActivityStatus,
  AgentBindingRuntimeStatus,
  AgentGraphUpdatedEvent,
  AgentRuntimeChangedEvent,
  AgentRuntimeSnapshot,
  AgentSessionSnapshot,
  AgentTerminalSourceTheme,
  AgentMcpRuntimeStatus,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import type { AgentToolExecutionResult } from './ExecuteAgentToolUseCase'
import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  AgentMcpToolCallCommand
} from '../ports/AgentMcpServerPort'
import type {
  AgentRuntimeScopeValidationCommand,
  AgentRuntimeScopeValidationPort
} from '../ports/AgentRuntimeScopeValidationPort'
import {
  AgentConversationScope,
  type AgentConversationScopeSnapshot
} from '../../domain/value-objects/AgentConversationScope'
import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'
import type {
  AgentProviderContribution,
  AgentProviderMcpSupport
} from '../ports/AgentProviderContribution'
import type { AgentLaunchArtifactScope } from '../services/AgentLaunchArtifactScope'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  isOwnedAgentSession,
  type AgentSessionRuntimeOwner
} from './AgentSessionRuntimeCoordinator'

export interface AttachAgentSessionCommand extends AgentSessionCallbacks {
  readonly agentId: string
  readonly columns?: number
  readonly gitBranch?: string | null
  readonly persistenceMode?: 'ephemeral' | 'persistent'
  readonly providerId?: string
  readonly projectDirectory: string
  readonly projectId?: string
  readonly restartMode?: 'new' | 'retry'
  readonly rows?: number
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export interface AgentSessionCallbacks {
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onRuntimeChanged?: (event: AgentRuntimeChangedEvent) => void
  readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
}

export interface ManagedAgentSession {
  readonly agentId: string
  callbacks: AgentSessionCallbacks
  cleancodeMcpEnabled: boolean
  columns: number
  readonly gitBranch: string | null
  isTerminalRunning: boolean
  isStopping: boolean
  launchArtifacts: AgentLaunchArtifactScope | null
  mcpRegistration?: AgentMcpRegistration
  readonly mcpSupport: AgentProviderMcpSupport
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  providerLaunchGeneration: number
  providerSessionRef: ProviderSessionRefSnapshot | null
  rows: number
  runtime: AgentRuntimeSnapshot
  readonly shouldPersist: boolean
  readonly scope: AgentConversationScope
  sessionId: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export function createAgentSessionCallbacks(command: AgentSessionCallbacks): AgentSessionCallbacks {
  return {
    onGraphUpdated: command.onGraphUpdated,
    onRuntimeChanged: command.onRuntimeChanged,
    onToolApprovalRequested: command.onToolApprovalRequested
  }
}

export function createInitialAgentRuntime(
  input: {
    readonly binding?: AgentBindingRuntimeStatus
    readonly mcp?: AgentMcpRuntimeStatus
  } = {}
): AgentRuntimeSnapshot {
  return {
    activity: { status: 'unavailable' },
    binding: { status: input.binding ?? 'unbound' },
    launch: {
      exitCode: null,
      failureKind: null,
      generation: 0,
      launchId: null,
      status: 'not_started'
    },
    mcp: { status: input.mcp ?? 'disabled' },
    revision: 0,
    terminal: {
      exitCode: null,
      processId: null,
      status: 'not_started',
      viewIdentity: null
    }
  }
}

export function transitionAgentRuntime(
  session: ManagedAgentSession,
  transition: {
    readonly activity?: AgentActivityStatus
    readonly binding?: AgentBindingRuntimeStatus
    readonly launch?: Partial<AgentRuntimeSnapshot['launch']>
    readonly mcp?: AgentMcpRuntimeStatus
    readonly terminal?: Partial<AgentRuntimeSnapshot['terminal']>
  }
): boolean {
  const runtime = session.runtime
  const nextActivity = transition.activity ?? runtime.activity.status
  const nextBinding = transition.binding ?? runtime.binding.status
  const nextLaunch = { ...runtime.launch, ...transition.launch }
  const nextMcp = transition.mcp ?? runtime.mcp.status
  const nextTerminal = { ...runtime.terminal, ...transition.terminal }
  if (
    nextActivity === runtime.activity.status &&
    nextBinding === runtime.binding.status &&
    haveSameLaunchRuntime(nextLaunch, runtime.launch) &&
    nextMcp === runtime.mcp.status &&
    haveSameTerminalRuntime(nextTerminal, runtime.terminal)
  ) {
    return false
  }

  session.runtime = {
    activity: { status: nextActivity },
    binding: { status: nextBinding },
    launch: nextLaunch,
    mcp: { status: nextMcp },
    revision: runtime.revision + 1,
    terminal: nextTerminal
  }
  try {
    session.callbacks.onRuntimeChanged?.({
      agentId: session.agentId,
      runtime: session.runtime,
      sessionId: session.sessionId
    })
  } catch {
    // Runtime observers must not participate in terminal or Provider lifecycle control flow.
  }
  return true
}

function isActiveAgentLaunch(session: ManagedAgentSession): boolean {
  return (
    session.runtime.launch.status === 'launching' || session.runtime.launch.status === 'running'
  )
}

export function canLaunchAgentProvider(session: ManagedAgentSession, sessionId: string): boolean {
  return (
    session.sessionId === sessionId &&
    session.isTerminalRunning &&
    !session.isStopping &&
    session.runtime.terminal.status === 'running'
  )
}

function matchesAgentLaunch(
  session: ManagedAgentSession,
  identity: { readonly generation: number; readonly launchId: string }
): boolean {
  const current = session.runtime.launch
  return current.generation === identity.generation && current.launchId === identity.launchId
}

export function beginAgentTerminalRuntime(session: ManagedAgentSession): void {
  transitionAgentRuntime(session, {
    activity: 'unavailable',
    launch: {
      exitCode: null,
      failureKind: null,
      generation: 0,
      launchId: null,
      status: 'not_started'
    },
    terminal: {
      exitCode: null,
      processId: null,
      status: 'starting',
      viewIdentity: null
    }
  })
}

export function recordAgentTerminalRunning(
  session: ManagedAgentSession,
  sessionId: string,
  handle: {
    readonly processId: number
    readonly viewIdentity?: AgentRuntimeSnapshot['terminal']['viewIdentity']
  }
): boolean {
  if (session.sessionId !== sessionId) return false
  session.isTerminalRunning = true
  transitionAgentRuntime(session, {
    terminal: {
      processId: handle.processId,
      status: 'running',
      viewIdentity: handle.viewIdentity ?? null
    }
  })
  return true
}

export function recordAgentTerminalExit(
  session: ManagedAgentSession,
  sessionId: string,
  exitCode: number | null
): boolean {
  if (session.sessionId !== sessionId) return false
  const shouldCloseTools = !session.isStopping
  session.isTerminalRunning = false
  transitionAgentRuntime(session, {
    activity: 'unavailable',
    launch: isActiveAgentLaunch(session) ? { status: 'stopped' } : undefined,
    terminal: { exitCode, processId: null, status: 'exited', viewIdentity: null }
  })
  void disposeAgentLaunchArtifacts(session).catch(() => undefined)
  return shouldCloseTools
}

export function recordAgentTerminalStartFailure(session: ManagedAgentSession): void {
  session.isTerminalRunning = false
  transitionAgentRuntime(session, {
    activity: 'unavailable',
    terminal: { processId: null, status: 'failed', viewIdentity: null }
  })
}

export function recordAgentTerminalStopped(
  session: ManagedAgentSession,
  status: 'exited' | 'suspended'
): void {
  session.isTerminalRunning = false
  transitionAgentRuntime(session, {
    activity: 'unavailable',
    launch: isActiveAgentLaunch(session) ? { status: 'stopped' } : undefined,
    terminal: { exitCode: null, processId: null, status, viewIdentity: null }
  })
}

type AgentLaunchIdentity = { readonly generation: number; readonly launchId: string }
type AgentLaunchExit = AgentLaunchIdentity & { readonly exitCode: number | null }

export function createAgentLaunchRuntimeController(command: {
  readonly attempt: number
  readonly onUnexpectedExit: () => void
  readonly session: ManagedAgentSession
  readonly sessionId: string
}): {
  readonly bind: (identity: AgentLaunchIdentity) => void
  readonly onExit: (event: AgentLaunchExit) => void
  readonly onStarted: (event: AgentLaunchIdentity) => void
} {
  let identity: AgentLaunchIdentity | null = null
  const deferred: Array<
    | { readonly event: AgentLaunchExit; readonly type: 'exit' }
    | {
        readonly event: AgentLaunchIdentity
        readonly type: 'started'
      }
  > = []
  const isCurrentAttempt = (): boolean =>
    command.session.sessionId === command.sessionId &&
    command.session.providerLaunchGeneration === command.attempt

  const acceptStarted = (event: AgentLaunchIdentity): void => {
    if (!identity) {
      deferred.push({ event, type: 'started' })
      return
    }
    if (
      !isCurrentAttempt() ||
      command.session.isStopping ||
      command.session.runtime.launch.status !== 'launching' ||
      !haveSameLaunchIdentity(identity, event) ||
      !matchesAgentLaunch(command.session, event)
    )
      return
    transitionAgentRuntime(command.session, {
      launch: {
        exitCode: null,
        failureKind: null,
        ...event,
        status: isRequiredAgentMcpPending(command.session) ? 'launching' : 'running'
      }
    })
  }

  const acceptExit = (event: AgentLaunchExit): void => {
    if (!identity) {
      deferred.push({ event, type: 'exit' })
      return
    }
    if (
      !isCurrentAttempt() ||
      !haveSameLaunchIdentity(identity, event) ||
      !matchesAgentLaunch(command.session, event)
    )
      return
    void disposeAgentLaunchArtifacts(command.session).catch(() => undefined)
    if (command.session.isStopping || !isActiveAgentLaunch(command.session)) return
    transitionAgentRuntime(command.session, {
      activity: 'unavailable',
      launch: { exitCode: event.exitCode, failureKind: null, ...identity, status: 'exited' }
    })
    command.onUnexpectedExit()
  }

  return {
    bind: (launchIdentity) => {
      if (!isCurrentAttempt() || command.session.isStopping) return
      identity = launchIdentity
      transitionAgentRuntime(command.session, {
        launch: { ...launchIdentity, status: 'launching' }
      })
      for (const pending of deferred.splice(0)) {
        if (pending.type === 'started') acceptStarted(pending.event)
        else acceptExit(pending.event)
      }
    },
    onExit: acceptExit,
    onStarted: acceptStarted
  }
}

export async function disposeAgentLaunchArtifacts(session: ManagedAgentSession): Promise<void> {
  const artifacts = session.launchArtifacts
  if (!artifacts) return
  await artifacts.dispose()
  if (session.launchArtifacts === artifacts && artifacts.isDisposed) {
    session.launchArtifacts = null
  }
}

export async function disposeAllAgentSessionRuntimeResources(command: {
  readonly beginClosing: (session: ManagedAgentSession) => void
  readonly disposeMcpServer: () => void
  readonly disposeTerminalRuntime: () => Promise<void>
  readonly sessions: readonly ManagedAgentSession[]
  readonly settleTools: (session: ManagedAgentSession) => Promise<void>
  readonly waitForPersistence: () => Promise<void>
}): Promise<void> {
  const results: PromiseSettledResult<unknown>[] = []
  results.push(
    ...(await Promise.allSettled(
      command.sessions.map((session) => Promise.resolve().then(() => command.beginClosing(session)))
    )),
    ...(await Promise.allSettled(
      command.sessions.map((session) => Promise.resolve().then(() => command.settleTools(session)))
    ))
  )
  const terminalResult = await Promise.allSettled([
    Promise.resolve().then(command.disposeTerminalRuntime)
  ])
  results.push(...terminalResult)
  if (terminalResult[0]?.status === 'fulfilled') {
    for (const session of command.sessions) recordAgentTerminalStopped(session, 'exited')
  }
  results.push(
    ...(await Promise.allSettled(command.sessions.map(disposeAgentLaunchArtifacts))),
    ...(await Promise.allSettled([
      Promise.resolve().then(command.waitForPersistence),
      Promise.resolve().then(command.disposeMcpServer)
    ]))
  )
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more Agent session resources failed to dispose.')
  }
}

export async function validateAgentRuntimeScope(
  command: AttachAgentSessionCommand,
  scope: AgentConversationScope,
  validation: AgentRuntimeScopeValidationPort
): Promise<AgentConversationScopeSnapshot> {
  const snapshot = scope.toSnapshot()
  await assertAgentRuntimeScope(
    {
      agentId: command.agentId,
      gitBranch: snapshot.gitBranch,
      projectDirectory: command.projectDirectory,
      projectId: snapshot.projectId,
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName
    },
    validation
  )
  return snapshot
}

export async function validateAgentProviderAvailability(
  provider: AgentProviderContribution
): Promise<void> {
  const availability = await provider.detector.inspect()
  if (availability.status === 'installed') return
  throw createExpectedAppError(
    'AGENT_PROVIDER_UNAVAILABLE',
    `Agent Provider "${provider.descriptor.id}" is unavailable.`,
    {
      providerId: provider.descriptor.id,
      status: availability.status
    }
  )
}

export function validateManagedAgentRuntimeScope(
  session: ManagedAgentSession,
  validation: AgentRuntimeScopeValidationPort
): Promise<void> {
  return assertAgentRuntimeScope(
    {
      agentId: session.agentId,
      gitBranch: session.gitBranch,
      projectDirectory: session.projectDirectory,
      projectId: session.projectId,
      workspaceDirectory: session.workspaceDirectory,
      workspaceName: session.workspaceName
    },
    validation
  )
}

async function assertAgentRuntimeScope(
  command: AgentRuntimeScopeValidationCommand,
  validation: AgentRuntimeScopeValidationPort
): Promise<void> {
  const isValid = await validation.isValid(command)
  if (!isValid) {
    throw createExpectedAppError(
      'AGENT_SESSION_NOT_FOUND',
      'Agent runtime scope is no longer active.'
    )
  }
}

export async function registerAgentMcpEndpoint(
  session: ManagedAgentSession,
  mcpServerPort: AgentMcpServerPort,
  executeTool: (command: AgentMcpToolCallCommand) => Promise<AgentToolExecutionResult>
): Promise<void> {
  if (!session.cleancodeMcpEnabled || session.mcpSupport === 'unsupported') {
    transitionAgentRuntime(session, {
      mcp: session.cleancodeMcpEnabled ? 'unsupported' : 'disabled'
    })
    return
  }

  unregisterAgentMcpEndpoint(session)
  transitionAgentRuntime(session, { mcp: 'initializing' })
  let registration: AgentMcpRegistration | null = null
  let initialized = false
  const publishInitialized = (): void => {
    if (!registration || session.mcpRegistration !== registration) return
    transitionAgentRuntime(session, {
      launch:
        session.runtime.launch.status === 'launching' && session.runtime.launch.launchId !== null
          ? { status: 'running' }
          : undefined,
      mcp: 'ready'
    })
  }
  registration = await mcpServerPort.registerSession({
    executeTool,
    onInitialized: () => {
      initialized = true
      publishInitialized()
    },
    projectDirectory: session.projectDirectory,
    sessionId: session.sessionId,
    workspaceName: session.workspaceName
  })
  session.mcpRegistration = registration
  if (initialized) publishInitialized()
}

export function unregisterAgentMcpEndpoint(session: ManagedAgentSession): void {
  const registration = session.mcpRegistration
  session.mcpRegistration = undefined
  registration?.dispose()
  transitionAgentRuntime(session, { mcp: inactiveAgentMcpStatus(session) })
}

export function recordAgentSessionStartFailure(session: ManagedAgentSession): void {
  if (session.runtime.terminal.processId === null) {
    transitionAgentRuntime(session, {
      activity: 'unavailable',
      terminal: { status: 'failed', viewIdentity: null }
    })
  } else {
    transitionAgentRuntime(session, {
      activity: 'unavailable',
      launch: {
        failureKind: session.providerSessionRef ? 'restore' : 'start',
        status: 'failed'
      }
    })
  }
  unregisterAgentMcpEndpoint(session)
}

export function recordAgentSessionStopFailure(session: ManagedAgentSession): void {
  session.isStopping = false
  const terminalFailed = session.runtime.terminal.processId === null
  transitionAgentRuntime(session, {
    terminal: { status: terminalFailed ? 'failed' : 'running' }
  })
  if (terminalFailed) unregisterAgentMcpEndpoint(session)
}

export function recordAgentMcpRegistrationFailure(session: ManagedAgentSession): void {
  unregisterAgentMcpEndpoint(session)
  transitionAgentRuntime(session, { mcp: 'failed' })
}

export function findOwnedManagedAgentSession(
  sessions: Iterable<ManagedAgentSession>,
  owner: AgentSessionRuntimeOwner
): ManagedAgentSession | undefined {
  return [...sessions].find((session) => isOwnedAgentSession(owner, session))
}

export function requireManagedAgentSession(
  sessions: Iterable<ManagedAgentSession>,
  sessionId: string
): ManagedAgentSession {
  const session = [...sessions].find((candidate) => candidate.sessionId === sessionId)
  if (!session) {
    throw createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Agent session was not found.')
  }
  return session
}

export function toAgentSessionSnapshot(session: {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly providerSessionRef: ProviderSessionRefSnapshot | null
  readonly runtime: AgentRuntimeSnapshot
  readonly sessionId: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    agentId: session.agentId,
    gitBranch: session.gitBranch,
    projectDirectory: session.projectDirectory,
    projectId: session.projectId,
    providerId: session.providerId,
    providerSessionRef: session.providerSessionRef,
    runtime: session.runtime,
    sessionId: session.sessionId,
    terminalSourceTheme: session.terminalSourceTheme,
    workspaceDirectory: session.workspaceDirectory,
    workspaceName: session.workspaceName
  }
}

export function createAgentConversationScope(command: {
  readonly agentId: string
  readonly gitBranch?: string | null
  readonly projectDirectory: string
  readonly projectId?: string
  readonly workspaceName: string
}): AgentConversationScope {
  return AgentConversationScope.create({
    agentId: command.agentId,
    gitBranch: command.gitBranch ?? null,
    projectId: command.projectId ?? command.projectDirectory,
    workspaceName: command.workspaceName
  })
}

export function createAgentRuntimeSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-session-${Date.now()}-${Math.random()}`
}

function haveSameLaunchRuntime(
  first: AgentRuntimeSnapshot['launch'],
  second: AgentRuntimeSnapshot['launch']
): boolean {
  return (
    first.exitCode === second.exitCode &&
    first.failureKind === second.failureKind &&
    first.generation === second.generation &&
    first.launchId === second.launchId &&
    first.status === second.status
  )
}

function isRequiredAgentMcpPending(session: ManagedAgentSession): boolean {
  return (
    session.cleancodeMcpEnabled &&
    session.mcpSupport === 'required' &&
    session.runtime.mcp.status !== 'ready'
  )
}

function inactiveAgentMcpStatus(session: ManagedAgentSession): AgentMcpRuntimeStatus {
  if (!session.cleancodeMcpEnabled) return 'disabled'
  return session.mcpSupport === 'unsupported' ? 'unsupported' : 'inactive'
}

function haveSameLaunchIdentity(
  first: { readonly generation: number; readonly launchId: string },
  second: { readonly generation: number; readonly launchId: string }
): boolean {
  return first.generation === second.generation && first.launchId === second.launchId
}

function haveSameTerminalRuntime(
  first: AgentRuntimeSnapshot['terminal'],
  second: AgentRuntimeSnapshot['terminal']
): boolean {
  return (
    first.exitCode === second.exitCode &&
    first.processId === second.processId &&
    first.status === second.status &&
    haveSameTerminalViewIdentity(first.viewIdentity, second.viewIdentity)
  )
}

function haveSameTerminalViewIdentity(
  first: AgentRuntimeSnapshot['terminal']['viewIdentity'],
  second: AgentRuntimeSnapshot['terminal']['viewIdentity']
): boolean {
  if (first === null || second === null) return first === second
  return (
    first.blockId === second.blockId &&
    first.generation === second.generation &&
    first.owner.id === second.owner.id &&
    first.owner.kind === second.owner.kind &&
    first.projectId === second.projectId &&
    first.runId === second.runId &&
    first.sessionId === second.sessionId &&
    first.workspaceName === second.workspaceName
  )
}
