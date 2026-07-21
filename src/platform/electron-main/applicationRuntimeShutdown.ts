import { isAppError } from '../../shared-kernel/application/errors/AppError'
import type { LogEvent, Logger } from '../logging/Logger'

type CleanupStage = 'run-lifecycle' | 'terminal-workflows' | 'terminal-sessions' | 'agent-sessions'

interface CleanupFailure {
  readonly stage: CleanupStage
  readonly error: unknown
}

export interface DisposeApplicationRuntimeInput {
  readonly disposeRunLifecycle: () => Promise<void>
  readonly disposeTerminalWorkflows: () => Promise<void>
  readonly disposeTerminalSessions: () => Promise<void>
  readonly disposeAgentSessions: () => Promise<void>
  readonly logger: Logger
}

export async function disposeApplicationRuntime({
  disposeAgentSessions,
  disposeRunLifecycle,
  disposeTerminalWorkflows,
  disposeTerminalSessions,
  logger
}: DisposeApplicationRuntimeInput): Promise<void> {
  const [runFailures, agentResult] = await Promise.all([
    disposeRunRuntime(disposeRunLifecycle, disposeTerminalWorkflows, disposeTerminalSessions),
    settleCleanup(disposeAgentSessions)
  ])
  const failures = [...runFailures, ...collectCleanupFailures('agent-sessions', agentResult)]

  failures.forEach((failure, index) => {
    try {
      logger.error({
        details: {
          cleanupStage: failure.stage,
          failureCount: failures.length,
          failureIndex: index + 1
        },
        error: resolveLogError(failure.error),
        operation: 'disposeApplicationRuntime',
        outcome: 'failure',
        scope: 'platform.lifecycle'
      })
    } catch {
      // Shutdown must continue even if the diagnostic sink itself is unavailable.
    }
  })
}

async function disposeRunRuntime(
  disposeRunLifecycle: () => Promise<void>,
  disposeTerminalWorkflows: () => Promise<void>,
  disposeTerminalSessions: () => Promise<void>
): Promise<readonly CleanupFailure[]> {
  const lifecycleResult = await settleCleanup(disposeRunLifecycle)
  const workflowResult = await settleCleanup(disposeTerminalWorkflows)
  const terminalResult = await settleCleanup(disposeTerminalSessions)
  return [
    ...collectCleanupFailures('run-lifecycle', lifecycleResult),
    ...collectCleanupFailures('terminal-workflows', workflowResult),
    ...collectCleanupFailures('terminal-sessions', terminalResult)
  ]
}

async function settleCleanup(operation: () => Promise<void>): Promise<PromiseSettledResult<void>> {
  try {
    await operation()
    return { status: 'fulfilled', value: undefined }
  } catch (reason) {
    return { status: 'rejected', reason }
  }
}

function collectCleanupFailures(
  stage: CleanupStage,
  result: PromiseSettledResult<void>
): readonly CleanupFailure[] {
  if (result.status === 'fulfilled') return []
  return flattenCleanupFailure(stage, result.reason)
}

function flattenCleanupFailure(stage: CleanupStage, error: unknown): readonly CleanupFailure[] {
  if (error instanceof AggregateError) {
    return error.errors.flatMap((nestedError) => flattenCleanupFailure(stage, nestedError))
  }
  return [{ stage, error }]
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
