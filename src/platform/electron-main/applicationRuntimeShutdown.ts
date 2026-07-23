import { isAppError } from '../../shared-kernel/application/errors/AppError'
import type { LogEvent, Logger } from '../logging/Logger'

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
const DEFAULT_TERMINAL_SESSION_RESERVE_MS = 2_000

type CleanupStage =
  | 'run-lifecycle'
  | 'terminal-views'
  | 'agent-sessions-prepare'
  | 'terminal-workflows-prepare'
  | 'terminal-sessions'
  | 'agent-sessions-complete'
  | 'terminal-workflows-complete'

interface CleanupStageResult {
  readonly stage: CleanupStage
  readonly durationMs: number
  readonly outcome: 'success' | 'failure' | 'timeout'
  readonly errors: readonly unknown[]
}

export interface DisposeApplicationRuntimeInput {
  readonly completeAgentSessions: () => Promise<void>
  readonly completeTerminalWorkflows: () => Promise<void>
  readonly disposeRunLifecycle: () => Promise<void>
  readonly disposeTerminalViews: () => Promise<void>
  readonly disposeTerminalSessions: () => Promise<void>
  readonly logger: Logger
  readonly prepareAgentSessions: () => Promise<void>
  readonly prepareTerminalWorkflows: () => Promise<void>
}

export interface DisposeApplicationRuntimeOptions {
  readonly correlationId?: string
  readonly terminalSessionReserveMs?: number
  readonly timeoutMs?: number
}

export interface ApplicationRuntimeShutdownCoordinator {
  dispose(): Promise<void>
}

export function createApplicationRuntimeShutdownCoordinator(
  input: DisposeApplicationRuntimeInput,
  options: DisposeApplicationRuntimeOptions = {}
): ApplicationRuntimeShutdownCoordinator {
  let shutdown: Promise<void> | undefined

  return {
    dispose() {
      shutdown ??= performApplicationRuntimeShutdown(input, options)
      return shutdown
    }
  }
}

export function disposeApplicationRuntime(
  input: DisposeApplicationRuntimeInput,
  options: DisposeApplicationRuntimeOptions = {}
): Promise<void> {
  return createApplicationRuntimeShutdownCoordinator(input, options).dispose()
}

async function performApplicationRuntimeShutdown(
  {
    completeAgentSessions,
    completeTerminalWorkflows,
    disposeRunLifecycle,
    disposeTerminalViews,
    disposeTerminalSessions,
    logger,
    prepareAgentSessions,
    prepareTerminalWorkflows
  }: DisposeApplicationRuntimeInput,
  options: DisposeApplicationRuntimeOptions
): Promise<void> {
  const startedAt = performance.now()
  const timeoutMs = resolveDuration(options.timeoutMs, DEFAULT_SHUTDOWN_TIMEOUT_MS)
  const terminalSessionReserveMs = Math.min(
    timeoutMs,
    resolveDuration(
      options.terminalSessionReserveMs,
      Math.min(DEFAULT_TERMINAL_SESSION_RESERVE_MS, timeoutMs * 0.4)
    )
  )
  const shutdownDeadline = startedAt + timeoutMs
  const preTerminalDeadline = shutdownDeadline - terminalSessionReserveMs
  const correlationId = options.correlationId ?? createShutdownCorrelationId()
  const lifecycleResult = await runCleanupStage(
    'run-lifecycle',
    disposeRunLifecycle,
    preTerminalDeadline
  )
  const viewResult = await runCleanupStage(
    'terminal-views',
    disposeTerminalViews,
    preTerminalDeadline
  )
  const [agentPrepareResult, workflowPrepareResult] = await Promise.all([
    runCleanupStage('agent-sessions-prepare', prepareAgentSessions, preTerminalDeadline),
    runCleanupStage('terminal-workflows-prepare', prepareTerminalWorkflows, preTerminalDeadline)
  ])
  const terminalResult = await runCleanupStage(
    'terminal-sessions',
    disposeTerminalSessions,
    shutdownDeadline
  )
  const [agentCompleteResult, workflowCompleteResult] = await Promise.all([
    runCleanupStage('agent-sessions-complete', completeAgentSessions, shutdownDeadline),
    runCleanupStage('terminal-workflows-complete', completeTerminalWorkflows, shutdownDeadline)
  ])

  logCleanupResults(
    logger,
    [
      lifecycleResult,
      viewResult,
      agentPrepareResult,
      workflowPrepareResult,
      terminalResult,
      agentCompleteResult,
      workflowCompleteResult
    ],
    correlationId
  )
}

async function runCleanupStage(
  stage: CleanupStage,
  operation: () => Promise<void>,
  deadline: number
): Promise<CleanupStageResult> {
  const startedAt = performance.now()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const operationResult = Promise.resolve()
    .then(operation)
    .then<CleanupStageResult, CleanupStageResult>(
      () => ({
        durationMs: resolveElapsedDuration(startedAt),
        errors: [],
        outcome: 'success',
        stage
      }),
      (error: unknown) => ({
        durationMs: resolveElapsedDuration(startedAt),
        errors: flattenCleanupErrors(error),
        outcome: 'failure',
        stage
      })
    )
  const timeoutResult = new Promise<CleanupStageResult>((resolve) => {
    timeoutHandle = setTimeout(
      () => {
        resolve({
          durationMs: resolveElapsedDuration(startedAt),
          errors: [],
          outcome: 'timeout',
          stage
        })
      },
      Math.max(0, deadline - performance.now())
    )
  })
  const result = await Promise.race([operationResult, timeoutResult])

  if (timeoutHandle !== undefined) {
    clearTimeout(timeoutHandle)
  }
  return result
}

function logCleanupResults(
  logger: Logger,
  results: readonly CleanupStageResult[],
  correlationId: string
): void {
  const failureCount = results.reduce(
    (count, result) =>
      count +
      (result.outcome === 'timeout' ? 1 : result.outcome === 'failure' ? result.errors.length : 0),
    0
  )
  let failureIndex = 0

  for (const result of results) {
    if (result.outcome === 'success') {
      continue
    }

    if (result.outcome === 'timeout') {
      failureIndex += 1
      safeLog(logger, 'warn', {
        correlationId,
        details: {
          cleanupStage: result.stage,
          failureCount,
          failureIndex,
          timedOut: true
        },
        durationMs: result.durationMs,
        error: {
          code: 'COMMAND_TIMED_OUT',
          isExpected: true,
          message: `Application cleanup stage "${result.stage}" exceeded its shutdown budget.`
        },
        operation: 'disposeApplicationRuntime',
        outcome: 'failure',
        scope: 'platform.lifecycle'
      })
      continue
    }

    for (const error of result.errors) {
      failureIndex += 1
      safeLog(logger, 'error', {
        correlationId,
        details: {
          cleanupStage: result.stage,
          failureCount,
          failureIndex,
          timedOut: false
        },
        durationMs: result.durationMs,
        error: resolveLogError(error),
        operation: 'disposeApplicationRuntime',
        outcome: 'failure',
        scope: 'platform.lifecycle'
      })
    }
  }
}

function safeLog(
  logger: Logger,
  level: 'error' | 'warn',
  event: Omit<LogEvent, 'level' | 'timestamp'>
): void {
  try {
    logger[level](event)
  } catch {
    // Shutdown must continue even if the diagnostic sink itself is unavailable.
  }
}

function flattenCleanupErrors(error: unknown): readonly unknown[] {
  if (error instanceof AggregateError) {
    return error.errors.flatMap((nestedError) => flattenCleanupErrors(nestedError))
  }
  return [error]
}

function resolveDuration(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, value) : fallback
}

function resolveElapsedDuration(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt)
}

function createShutdownCorrelationId(): string {
  return `application-shutdown-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function resolveLogError(error: unknown): NonNullable<LogEvent['error']> {
  if (isAppError(error)) {
    return {
      code: error.code,
      isExpected: error.isExpected,
      message: error.message,
      stack: error.isExpected ? undefined : error.stack
    }
  }
  if (error instanceof Error) {
    return {
      code: 'UNEXPECTED_ERROR',
      isExpected: false,
      message: error.message,
      stack: error.stack
    }
  }
  return {
    code: 'UNEXPECTED_ERROR',
    isExpected: false,
    message: String(error)
  }
}
