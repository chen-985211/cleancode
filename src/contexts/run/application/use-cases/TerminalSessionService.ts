import { TerminalSession } from '../../domain/aggregates/TerminalSession'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalProcessPort
} from '../ports/TerminalProcessPort'

export interface StartTerminalSessionCommand {
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workingDirectory: string
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

export class TerminalSessionService {
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly sessionIdsByTerminalBlock = new Map<string, string>()

  constructor(private readonly terminalProcessPort: TerminalProcessPort) {}

  async start(command: StartTerminalSessionCommand): Promise<TerminalSessionSnapshot> {
    const existingSessionId = this.sessionIdsByTerminalBlock.get(command.terminalBlockId)

    if (existingSessionId) {
      this.terminate(existingSessionId)
    }

    const session = TerminalSession.create({
      terminalBlockId: command.terminalBlockId,
      workspaceName: command.workspaceName,
      workingDirectory: command.workingDirectory
    })

    let processHandle

    try {
      processHandle = await this.terminalProcessPort.start({
        sessionId: session.id,
        workingDirectory: command.workingDirectory,
        shell: command.shell,
        columns: command.columns ?? 88,
        rows: command.rows ?? 24,
        onOutput: command.onOutput,
        onExit: (event) => {
          session.markExited({ exitCode: event.exitCode })
          this.sessionIdsByTerminalBlock.delete(command.terminalBlockId)
          command.onExit(event)
        }
      })
    } catch (error) {
      session.markFailed({ reason: getErrorMessage(error) })
      this.sessions.set(session.id, session)
      this.sessionIdsByTerminalBlock.set(command.terminalBlockId, session.id)

      return session.toSnapshot()
    }

    session.markRunning({ processId: processHandle.processId })
    this.sessions.set(session.id, session)
    this.sessionIdsByTerminalBlock.set(command.terminalBlockId, session.id)

    return session.toSnapshot()
  }

  write(sessionId: string, input: string): TerminalSessionSnapshot {
    const session = this.requireSession(sessionId)

    session.recordInput(input)
    this.terminalProcessPort.write(sessionId, input)

    return session.toSnapshot()
  }

  interrupt(sessionId: string): TerminalSessionSnapshot {
    const session = this.requireRunningSession(sessionId)

    this.terminalProcessPort.write(sessionId, '\x03')

    return session.toSnapshot()
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.terminalProcessPort.resize(sessionId, columns, rows)
  }

  terminate(sessionId: string): TerminalSessionSnapshot {
    const session = this.requireSession(sessionId)

    this.terminalProcessPort.stop(sessionId)
    session.markExited({ exitCode: null })
    this.sessionIdsByTerminalBlock.delete(session.terminalBlockId)

    return session.toSnapshot()
  }

  stopAll(): void {
    this.terminalProcessPort.disposeAll()

    for (const session of this.sessions.values()) {
      if (session.status === 'running') {
        session.markExited({ exitCode: null })
      }
    }

    this.sessionIdsByTerminalBlock.clear()
  }

  private requireSession(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId)

    if (!session) {
      throw createExpectedAppError('TERMINAL_SESSION_NOT_FOUND', 'Terminal session was not found.')
    }

    return session
  }

  private requireRunningSession(sessionId: string): TerminalSession {
    const session = this.requireSession(sessionId)

    if (session.status !== 'running') {
      throw createExpectedAppError(
        'TERMINAL_SESSION_NOT_RUNNING',
        'Terminal session is not running.'
      )
    }

    return session
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
