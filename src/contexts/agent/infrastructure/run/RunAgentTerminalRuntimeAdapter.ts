import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentTerminalRuntimePort,
  OpenAgentTerminalCommand
} from '../../application/ports/AgentTerminalRuntimePort'
import type { TerminalSessionService } from '../../../run/application/use-cases/TerminalSessionService'
import type { TerminalSessionSnapshot } from '../../../run/application/dto/TerminalSessionSnapshot'

export class RunAgentTerminalRuntimeAdapter implements AgentTerminalRuntimePort {
  private readonly terminals = new Map<string, TerminalSessionSnapshot>()

  constructor(private readonly terminalSessions: TerminalSessionService) {}

  async open(command: OpenAgentTerminalCommand) {
    const existing = this.terminals.get(command.sessionId)
    if (existing) await this.terminalSessions.terminate(existing.sessionId)

    const terminal = await this.terminalSessions.start({
      columns: command.columns,
      gitBranch: command.gitBranch,
      onExit: (event) => {
        if (this.terminals.get(command.sessionId)?.sessionId !== event.sessionId) return
        this.terminals.delete(command.sessionId)
        command.onTerminalExit(event.exitCode)
      },
      onOutput: () => undefined,
      owner: { id: command.agentId, kind: 'agent' },
      projectDirectory: command.projectDirectory,
      projectId: command.projectId,
      rows: command.rows,
      runId: `agent-terminal:${command.sessionId}`,
      sessionKind: 'interactive',
      terminalBlockId: command.agentId,
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName,
      workingDirectory: command.workspaceDirectory
    })
    if (terminal.status !== 'running' || terminal.processId === null) {
      throw createExpectedAppError(
        'TERMINAL_RUNTIME_NOT_READY',
        terminal.failureReason ?? 'Agent terminal failed to start.'
      )
    }
    this.terminals.set(command.sessionId, terminal)
    return {
      processId: terminal.processId,
      terminalId: terminal.sessionId,
      viewIdentity: {
        blockId: terminal.blockId,
        generation: terminal.generation,
        owner: { id: command.agentId, kind: 'agent' as const },
        projectId: terminal.projectId,
        runId: terminal.runId,
        sessionId: terminal.sessionId,
        workspaceName: terminal.workspaceName
      }
    }
  }

  launch(command: Parameters<AgentTerminalRuntimePort['launch']>[0]) {
    const terminal = this.requireTerminal(command.sessionId)
    const job = this.terminalSessions.launchForegroundJob({
      args: command.plan.args,
      environment: command.plan.env,
      executable: command.plan.executable,
      onExit: (event) => command.onExit(event),
      onStarted: (event) => command.onStarted?.(event),
      sessionId: terminal.sessionId
    })
    return { generation: job.generation, launchId: job.launchId }
  }

  write(sessionId: string, input: string): void {
    this.terminalSessions.write(this.requireTerminal(sessionId).sessionId, input)
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.terminalSessions.resize(this.requireTerminal(sessionId).sessionId, columns, rows)
  }

  async stop(sessionId: string): Promise<void> {
    const terminal = this.terminals.get(sessionId)
    if (!terminal) return
    await this.terminalSessions.terminate(terminal.sessionId)
    if (this.terminals.get(sessionId)?.sessionId === terminal.sessionId) {
      this.terminals.delete(sessionId)
    }
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.terminals.keys()].map((sessionId) => this.stop(sessionId)))
  }

  releaseApplicationShutdown(): void {
    this.terminals.clear()
  }

  private requireTerminal(sessionId: string): TerminalSessionSnapshot {
    const terminal = this.terminals.get(sessionId)
    if (!terminal) {
      throw createExpectedAppError('TERMINAL_SESSION_NOT_FOUND', 'Agent terminal was not found.')
    }
    return terminal
  }
}
