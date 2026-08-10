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
  haveSameLaunchIdentity,
  haveSameLaunchRuntime,
  haveSameTerminalRuntime
} from './AgentRuntimeFacetEquality'
import {
  AgentConversationScope,
  type AgentConversationScopeSnapshot
} from '../../domain/value-objects/AgentConversationScope'
import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'
import type { AgentProviderContribution } from '../ports/AgentProviderContribution'
import type { AgentLaunchArtifactScope } from '../services/AgentLaunchArtifactScope'
import type { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  isOwnedAgentSession,
  type AgentSessionRuntimeOwner
} from './AgentSessionRuntimeCoordinator'

const agentMcpInitializationTimeoutMs = 30_000

interface ManagedAgentMcpRegistration extends AgentMcpRegistration {
  beginInitializationTimeout(): void
}

export interface AttachAgentSessionCommand extends AgentSessionCallbacks {
  readonly agentId: string
  readonly agentName?: string
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
  readonly workspaceId: string
}

export interface AgentSessionCallbacks {
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onRuntimeChanged?: (event: AgentRuntimeChangedEvent) => void
  readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
}

export interface ManagedAgentSession {
  readonly agentId: string
  agentName?: string
  callbacks: AgentSessionCallbacks
  cleancodeMcpEnabled: boolean
  columns: number
  readonly gitBranch: string | null
  isTerminalRunning: boolean
  isStopping: boolean
  launchArtifacts: AgentLaunchArtifactScope | null
  mcpRegistration?: ManagedAgentMcpRegistration
  readonly mcpSupported: boolean
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
  readonly workspaceId: string
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
      stopReason: null,
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
      stopReason: null,
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
      stopReason: null,
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
    terminal: {
      exitCode,
      processId: null,
      status: 'exited',
      stopReason: shouldCloseTools ? 'unexpected' : 'requested',
      viewIdentity: null
    }
  })
  void disposeAgentLaunchArtifacts(session).catch(() => undefined)
  return shouldCloseTools
}

export function recordAgentTerminalStartFailure(session: ManagedAgentSession): void {
  session.isTerminalRunning = false
  transitionAgentRuntime(session, {
    activity: 'unavailable',
    terminal: { processId: null, status: 'failed', stopReason: null, viewIdentity: null }
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
    terminal: {
      exitCode: null,
      processId: null,
      status,
      stopReason: 'requested',
      viewIdentity: null
    }
  })
}

type AgentLaunchIdentity = { readonly generation: number; readonly launchId: string }
type AgentLaunchExit = AgentLaunchIdentity & { readonly exitCode: number | null }

export function createAgentLaunchRuntimeController(command: {
  readonly attempt: number
  readonly onStartedAccepted?: () => void
  readonly onUnexpectedExit: () => void
  readonly session: ManagedAgentSession
  readonly sessionId: string
}): {
  readonly bind: (identity: AgentLaunchIdentity) => void
  readonly onExit: (event: AgentLaunchExit) => void
  readonly onStarted: (event: AgentLaunchIdentity) => void
} {
  let identity: AgentLaunchIdentity | null = null
  let hasAcceptedStarted = false
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
      hasAcceptedStarted ||
      command.session.isStopping ||
      command.session.runtime.launch.status !== 'launching' ||
      !haveSameLaunchIdentity(identity, event) ||
      !matchesAgentLaunch(command.session, event)
    )
      return
    hasAcceptedStarted = true
    transitionAgentRuntime(command.session, {
      launch: {
        exitCode: null,
        failureKind: null,
        ...event,
        status: 'running'
      }
    })
    command.onStartedAccepted?.()
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
  readonly requestProviderShutdown: (session: ManagedAgentSession) => Promise<void>
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
    )),
    ...(await Promise.allSettled(
      command.sessions.map((session) =>
        Promise.resolve().then(() => command.requestProviderShutdown(session))
      )
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
      projectDirectory: command.projectDirectory,
      projectId: snapshot.projectId,
      workspaceDirectory: command.workspaceDirectory,
      workspaceId: command.workspaceId
    },
    validation
  )
  return snapshot
}

export async function validateAgentProviderAvailability(
  provider: AgentProviderContribution,
  availabilityService?: AgentProviderAvailabilityService,
  refresh = true
): Promise<void> {
  const availability = availabilityService
    ? await availabilityService.inspect(provider.descriptor.id, { refresh })
    : await provider.detector.inspect()
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
      projectDirectory: session.projectDirectory,
      projectId: session.projectId,
      workspaceDirectory: session.workspaceDirectory,
      workspaceId: session.workspaceId
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
  if (!session.cleancodeMcpEnabled || !session.mcpSupported) {
    transitionAgentRuntime(session, {
      mcp: session.cleancodeMcpEnabled ? 'unsupported' : 'disabled'
    })
    return
  }

  unregisterAgentMcpEndpoint(session)
  transitionAgentRuntime(session, { mcp: 'initializing' })
  let registration: ManagedAgentMcpRegistration | null = null
  let initializationTimeout: ReturnType<typeof setTimeout> | null = null
  let initialized = false
  const clearInitializationTimeout = (): void => {
    if (initializationTimeout === null) return
    clearTimeout(initializationTimeout)
    initializationTimeout = null
  }
  const publishInitialized = (): void => {
    if (!registration || session.mcpRegistration !== registration) return
    clearInitializationTimeout()
    transitionAgentRuntime(session, {
      mcp: 'ready'
    })
  }
  const providerRegistration = await mcpServerPort.registerSession({
    executeTool,
    onInitialized: () => {
      initialized = true
      publishInitialized()
    },
    projectDirectory: session.projectDirectory,
    sessionId: session.sessionId,
    workspaceId: session.workspaceId
  })
  registration = {
    beginInitializationTimeout() {
      if (
        initialized ||
        initializationTimeout !== null ||
        session.mcpRegistration !== registration
      ) {
        return
      }
      initializationTimeout = setTimeout(() => {
        initializationTimeout = null
        if (initialized || session.mcpRegistration !== registration) return
        transitionAgentRuntime(session, { mcp: 'degraded' })
      }, agentMcpInitializationTimeoutMs)
    },
    bearerToken: providerRegistration.bearerToken,
    dispose() {
      clearInitializationTimeout()
      providerRegistration.dispose()
    },
    url: providerRegistration.url
  }
  session.mcpRegistration = registration
  if (initialized) {
    publishInitialized()
  }
}

export function beginAgentMcpInitializationTimeout(session: ManagedAgentSession): void {
  session.mcpRegistration?.beginInitializationTimeout()
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
      terminal: { status: 'failed', stopReason: null, viewIdentity: null }
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
    terminal: { status: terminalFailed ? 'failed' : 'running', stopReason: null }
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
  readonly workspaceId: string
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
    workspaceId: session.workspaceId
  }
}

export function createAgentConversationScope(command: {
  readonly agentId: string
  readonly projectDirectory: string
  readonly projectId?: string
  readonly workspaceId: string
}): AgentConversationScope {
  return AgentConversationScope.create({
    agentId: command.agentId,
    projectId: command.projectId ?? command.projectDirectory,
    workspaceId: command.workspaceId
  })
}

export function createAgentRuntimeSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-session-${Date.now()}-${Math.random()}`
}

function inactiveAgentMcpStatus(session: ManagedAgentSession): AgentMcpRuntimeStatus {
  if (!session.cleancodeMcpEnabled) return 'disabled'
  return session.mcpSupported ? 'inactive' : 'unsupported'
}
