import type { TerminalWorkflowRuntimePort } from '../../application/ports/TerminalWorkflowRuntimePort'
import type { StartWorkflowRuntimeCommand } from '../../application/ports/TerminalWorkflowRuntimePort'
import type { TerminalSessionService } from '../../application/use-cases/TerminalSessionService'

export class TerminalSessionWorkflowRuntimeAdapter implements TerminalWorkflowRuntimePort {
  constructor(private readonly terminalSessions: TerminalSessionService) {}

  async startCommand(command: StartWorkflowRuntimeCommand) {
    return this.startSession(command, command.launchCommand)
  }

  async stop(sessionId: string): Promise<void> {
    await this.terminalSessions.terminate(sessionId)
  }

  async stopPreservingHistory(sessionId: string) {
    const session = await this.terminalSessions.stopPreservingHistory(sessionId)
    return session
      ? {
          scope: session,
          sessionId: session.id,
          exitCode: session.exitCode
        }
      : null
  }

  private async startSession(command: StartWorkflowRuntimeCommand, launchCommand: string) {
    const session = await this.terminalSessions.start({
      projectId: command.projectId,
      projectDirectory: command.projectDirectory,
      terminalBlockId: command.blockId,
      workspaceId: command.workspaceId,
      workspaceDirectory: command.workspaceDirectory,
      gitBranch: command.gitBranch,
      workingDirectory: command.workingDirectory,
      terminalSourceTheme: command.terminalSourceTheme,
      runId: command.runId,
      launchCommand,
      sessionKind: 'workflow',
      shell: command.shell,
      columns: command.columns,
      rows: command.rows,
      onOutput: command.onOutput,
      onExit: command.onExit
    })

    if (session.status === 'failed') {
      throw new Error(session.failureReason ?? 'Terminal process failed to start.')
    }

    return session
  }
}
