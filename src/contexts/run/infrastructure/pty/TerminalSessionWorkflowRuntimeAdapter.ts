import type { TerminalWorkflowRuntimePort } from '../../application/ports/TerminalWorkflowRuntimePort'
import type { StartWorkflowRuntimeCommand } from '../../application/ports/TerminalWorkflowRuntimePort'
import type { TerminalSessionService } from '../../application/use-cases/TerminalSessionService'

export class TerminalSessionWorkflowRuntimeAdapter implements TerminalWorkflowRuntimePort {
  constructor(private readonly terminalSessions: TerminalSessionService) {}

  async startCommand(command: StartWorkflowRuntimeCommand) {
    return this.startSession(command, command.launchCommand)
  }

  async startInteractive(command: StartWorkflowRuntimeCommand) {
    return this.startSession(command, undefined)
  }

  async stop(sessionId: string): Promise<void> {
    await this.terminalSessions.terminate(sessionId)
  }

  private async startSession(
    command: StartWorkflowRuntimeCommand,
    launchCommand: string | undefined
  ) {
    const session = await this.terminalSessions.start({
      projectId: command.projectId,
      projectDirectory: command.projectDirectory,
      terminalBlockId: command.blockId,
      workspaceName: command.workspaceName,
      workspaceDirectory: command.workspaceDirectory,
      gitBranch: command.gitBranch,
      workingDirectory: command.workingDirectory,
      runId: command.runId,
      launchCommand,
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
