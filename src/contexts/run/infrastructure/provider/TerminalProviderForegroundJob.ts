import type {
  LaunchForegroundJobProcessCommand,
  TerminalProcessPort
} from '../../application/ports/TerminalProcessPort'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalProviderEvent } from './TerminalProviderProtocol'
import type { ProviderTerminalSession } from './TerminalProviderServerTypes'

interface LaunchTerminalProviderForegroundJobInput {
  readonly command: Omit<LaunchForegroundJobProcessCommand, 'onExit' | 'onStarted'>
  readonly processes: TerminalProcessPort
  readonly sessions: ReadonlyMap<string, ProviderTerminalSession>
  readonly broadcast: (event: TerminalProviderEvent) => void
}

export function launchTerminalProviderForegroundJob(
  input: LaunchTerminalProviderForegroundJobInput
): null {
  const session = input.sessions.get(input.command.sessionId)
  if (!session) {
    throw createExpectedAppError('TERMINAL_SESSION_NOT_FOUND', 'Terminal session was not found.')
  }
  if (session.snapshot.status !== 'running') {
    throw createExpectedAppError('TERMINAL_SESSION_NOT_RUNNING', 'Terminal session is not running.')
  }
  const launch = input.processes.launchForegroundJob
  if (!launch) {
    throw createExpectedAppError(
      'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
      'Terminal runtime does not support foreground jobs.'
    )
  }
  launch.call(input.processes, {
    ...input.command,
    onExit: ({ exitCode, generation, launchId, sessionId }) =>
      input.broadcast({
        type: 'event',
        event: 'foreground-job-exited',
        payload: { exitCode, generation, launchId, sessionId }
      }),
    onStarted: ({ generation, launchId, sessionId }) =>
      input.broadcast({
        type: 'event',
        event: 'foreground-job-started',
        payload: { generation, launchId, sessionId }
      })
  })
  return null
}
