import type {
  TerminalRunOwner,
  TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'
import {
  createExpectedAppError,
  isAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalModelPort } from '../ports/TerminalModelPort'
import type { TerminalProcessPort } from '../ports/TerminalProcessPort'
import type { TerminalModelDiagnosticsSnapshot } from '../dto/TerminalModelSnapshot'
import type { TerminalLinkIdentity } from '../dto/TerminalLink'
import type { TerminalSession } from '../../domain/aggregates/TerminalSession'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { resolveTerminalOwnerRef } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { TerminalPrivateOutputControl } from '../dto/TerminalPrivateOutputControl'
import type { TerminalLaunchEnvironmentPreparationPort } from '../ports/TerminalLaunchEnvironmentPreparationPort'
import type { TerminalSessionLifecycleObserverPort } from '../ports/TerminalSessionLifecycleObserverPort'
import type { StartTerminalSessionCommand } from './TerminalSessionCommands'

export interface TerminalSessionTerminationOperation {
  readonly promise: Promise<TerminalSessionSnapshot>
  readonly preserveHistory: boolean
}

export function acceptTerminalFallbackOutput(
  sequences: Map<string, number>,
  sessionId: string,
  data: string
) {
  const sequence = (sequences.get(sessionId) ?? 0) + 1
  sequences.set(sessionId, sequence)
  return { data, sequence }
}

export function enqueueTerminalSlotOperation<T>(
  tails: Map<string, Promise<void>>,
  slotKey: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = tails.get(slotKey) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(operation)
  const tail = result.then(
    () => undefined,
    () => undefined
  )
  tails.set(slotKey, tail)
  void tail.finally(() => {
    if (tails.get(slotKey) === tail) tails.delete(slotKey)
  })
  return result
}

export function getTerminalSessionErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function listTerminalSessionSnapshots(
  sessions: ReadonlyMap<string, TerminalSession>,
  sessionIds: readonly string[] = [...sessions.keys()]
): TerminalSessionSnapshot[] {
  return sessionIds.flatMap((sessionId) => {
    const session = sessions.get(sessionId)
    return session ? [session.toSnapshot()] : []
  })
}

export async function readBestEffortWorkingDirectory(
  session: TerminalSession,
  processes: TerminalProcessPort,
  models: TerminalModelPort | undefined
): Promise<string> {
  let workingDirectory = models?.readWorkingDirectory(session.scope) ?? session.workingDirectory
  try {
    const observed = await processes.readWorkingDirectory(session.id)
    if (observed) {
      workingDirectory = observed
      models?.updateWorkingDirectory(session.scope, observed)
    }
  } catch {
    // CWD inspection is auxiliary; retain the event-fed model cache on failure.
  }
  return workingDirectory
}

export function observeTerminalEnded(
  observer: TerminalSessionLifecycleObserverPort | undefined,
  scope: Parameters<TerminalSessionLifecycleObserverPort['terminalEnded']>[0]
): void {
  try {
    observer?.terminalEnded(scope)
  } catch {
    // An optional projection cannot alter the terminal lifecycle fact it observes.
  }
}

export function observeTerminalOutputAccepted(
  observer: TerminalSessionLifecycleObserverPort | undefined,
  scope: TerminalRunScope,
  sequence: number
): void {
  try {
    observer?.terminalOutputAccepted?.(scope, sequence)
  } catch {
    // An optional projection cannot alter accepted output or its downstream delivery.
  }
}

export async function prepareTerminalSessionLaunch(input: {
  readonly command: StartTerminalSessionCommand
  readonly launchEnvironmentPreparation?: TerminalLaunchEnvironmentPreparationPort
  readonly scope: TerminalRunOwner & {
    readonly generation: number
    readonly runId: string
    readonly sessionId: string
  }
  readonly sessionKind: TerminalSessionSnapshot['kind']
  readonly terminalSourceTheme: TerminalSourceTheme
}): Promise<{
  readonly environment: Readonly<Record<string, string>> | undefined
  readonly launchCommand: string | undefined
  readonly privateOutputControl: TerminalPrivateOutputControl | undefined
  readonly shell: string | undefined
}> {
  let launchCommand = input.command.launchCommand
  let environment = input.command.environment
  let privateOutputControl: TerminalPrivateOutputControl | undefined
  let shell = input.command.shell

  if (input.command.prepareLaunch) {
    const prepared = await input.command.prepareLaunch(input.scope)
    launchCommand = prepared.launchCommand
    environment = prepared.environment
  }
  if (input.command.agentActivityIntegration && input.launchEnvironmentPreparation) {
    const prepared = await input.launchEnvironmentPreparation.prepare({
      environment,
      launchCommand,
      launchMode: input.command.launchMode,
      shell,
      scope: input.scope,
      sessionKind: input.sessionKind,
      terminalSourceTheme: input.terminalSourceTheme,
      workingDirectory: input.command.workingDirectory
    })
    launchCommand = prepared.launchCommand
    environment = prepared.environment
    privateOutputControl = prepared.privateOutputControl
    shell = prepared.shell ?? shell
  }

  return { environment, launchCommand, privateOutputControl, shell }
}

export function throwTerminalSessionCleanupFailures(
  results: readonly PromiseSettledResult<void>[]
): void {
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (failures.length === 0) return
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, 'Multiple terminal session resources failed to dispose.')
}

export async function settleTerminalViewRelease(operation: () => Promise<void>): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (
      isAppError(error) &&
      (error.code === 'RUN_SCOPE_STALE' ||
        error.code === 'TERMINAL_RUNTIME_NOT_READY' ||
        error.code === 'TERMINAL_SESSION_NOT_FOUND')
    ) {
      return
    }
    throw error
  }
}

export function requireTerminalModelPort(port: TerminalModelPort | undefined): TerminalModelPort {
  if (!port) {
    throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
  }
  return port
}

export function readTerminalModelDiagnostics(
  port: TerminalModelPort | undefined
): TerminalModelDiagnosticsSnapshot {
  return (
    port?.getDiagnostics() ?? {
      modelCount: 0,
      attachedViewCount: 0,
      pendingOutputBytes: 0,
      lastRestoreDurationMs: 0
    }
  )
}

export function createTerminalSessionOwner(command: {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly terminalBlockId: string
  readonly owner?: TerminalRunOwner['owner']
}): TerminalRunOwner {
  return {
    projectId: command.projectId,
    projectDirectory: command.projectDirectory,
    workspaceId: command.workspaceId,
    workspaceDirectory: command.workspaceDirectory,
    gitBranch: command.gitBranch,
    blockId: command.terminalBlockId,
    owner: command.owner ?? { id: command.terminalBlockId, kind: 'block' }
  }
}

export function createTerminalSessionId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random()}`
}

export function assertCurrentTerminalViewIdentity(
  command: TerminalLinkIdentity,
  session: TerminalSession,
  state: {
    readonly currentSessionId: string | undefined
    readonly latestGeneration: number | undefined
    readonly restorableSessionId: string | undefined
  }
): void {
  const commandOwner = command.owner ?? { id: command.blockId, kind: 'block' as const }
  const sessionOwner = resolveTerminalOwnerRef(session.scope)
  const matchesIdentity =
    session.scope.projectId === command.projectId &&
    session.scope.workspaceId === command.workspaceId &&
    session.scope.blockId === command.blockId &&
    session.scope.sessionId === command.sessionId &&
    session.scope.runId === command.runId &&
    session.scope.generation === command.generation
  const isCurrentOrNaturallyExited =
    state.currentSessionId === session.id ||
    (state.currentSessionId === undefined &&
      session.status === 'exited' &&
      state.restorableSessionId === session.id)
  const matchesCurrentRuntime =
    matchesIdentity &&
    commandOwner.kind === sessionOwner.kind &&
    commandOwner.id === sessionOwner.id &&
    state.latestGeneration === command.generation &&
    isCurrentOrNaturallyExited

  if (
    !matchesCurrentRuntime ||
    (session.status !== 'idle' && session.status !== 'running' && session.status !== 'exited')
  ) {
    throw createExpectedAppError(
      'RUN_SCOPE_STALE',
      'Terminal view no longer matches the current runtime scope.'
    )
  }

  if (session.status === 'idle') {
    throw createExpectedAppError(
      'TERMINAL_RUNTIME_NOT_READY',
      'Terminal runtime is still starting.'
    )
  }
}
