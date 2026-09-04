import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentTerminalRuntimePort,
  OpenAgentTerminalCommand
} from '../../application/ports/AgentTerminalRuntimePort'
import type { TerminalSessionService } from '../../../run/application/use-cases/TerminalSessionService'
import type { TerminalSessionSnapshot } from '../../../run/application/dto/TerminalSessionSnapshot'

export class RunAgentTerminalRuntimeAdapter implements AgentTerminalRuntimePort {
  private readonly terminals = new Map<string, TerminalSessionSnapshot>()
  private readonly titleObservers = new Map<string, { readonly accept: (title: string) => void }>()
  private readonly environment: NodeJS.ProcessEnv
  private readonly platform: NodeJS.Platform

  constructor(
    private readonly terminalSessions: TerminalSessionService,
    options: { readonly environment?: NodeJS.ProcessEnv; readonly platform?: NodeJS.Platform } = {}
  ) {
    this.environment = options.environment ?? process.env
    this.platform = options.platform ?? process.platform
  }

  async open(command: OpenAgentTerminalCommand) {
    const existing = this.terminals.get(command.sessionId)
    if (existing) await this.terminalSessions.terminate(existing.sessionId)

    const terminal = await this.terminalSessions.start({
      columns: command.columns,
      environment: this.posixPath ? { PATH: this.posixPath } : {},
      gitBranch: command.gitBranch,
      onExit: (event) => {
        if (this.terminals.get(command.sessionId)?.sessionId !== event.sessionId) return
        this.terminals.delete(command.sessionId)
        command.onTerminalExit(event.exitCode)
      },
      onOutput: () => undefined,
      onTitleChanged: (title) => this.titleObservers.get(command.sessionId)?.accept(title),
      owner: { id: command.agentId, kind: 'agent' },
      projectDirectory: command.projectDirectory,
      projectId: command.projectId,
      rows: command.rows,
      runId: `agent-terminal:${command.sessionId}`,
      sessionKind: 'interactive',
      terminalBlockId: command.agentId,
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: command.workspaceDirectory,
      workspaceId: command.workspaceId,
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
        workspaceId: terminal.workspaceId
      }
    }
  }

  launch(command: Parameters<AgentTerminalRuntimePort['launch']>[0]) {
    const terminal = this.requireTerminal(command.sessionId)
    const observer = command.plan.onTerminalTitleChanged
      ? { accept: command.plan.onTerminalTitleChanged }
      : null
    if (observer) this.titleObservers.set(command.sessionId, observer)
    else this.titleObservers.delete(command.sessionId)
    try {
      const job = this.terminalSessions.launchForegroundJob({
        args: command.plan.args,
        environment: command.plan.env,
        executable: command.plan.executable,
        fallbackPath: this.posixPath,
        onExit: (event) => {
          if (observer && this.titleObservers.get(command.sessionId) === observer) {
            this.titleObservers.delete(command.sessionId)
          }
          command.onExit(event)
        },
        onStarted: (event) => command.onStarted?.(event),
        sessionId: terminal.sessionId
      })
      return { generation: job.generation, launchId: job.launchId }
    } catch (error) {
      if (observer && this.titleObservers.get(command.sessionId) === observer) {
        this.titleObservers.delete(command.sessionId)
      }
      throw error
    }
  }

  write(sessionId: string, input: string): void {
    this.terminalSessions.write(this.requireTerminal(sessionId).sessionId, input)
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.terminalSessions.resize(this.requireTerminal(sessionId).sessionId, columns, rows)
  }

  async stop(sessionId: string): Promise<void> {
    this.titleObservers.delete(sessionId)
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
    this.titleObservers.clear()
  }

  private get posixPath(): string | undefined {
    // Read each time: Electron can refresh detection after the detached Run
    // provider or interactive shell starts. Foreground jobs retain shell priority.
    return this.platform === 'win32' ? undefined : this.environment.PATH || undefined
  }

  private requireTerminal(sessionId: string): TerminalSessionSnapshot {
    const terminal = this.terminals.get(sessionId)
    if (!terminal) {
      throw createExpectedAppError('TERMINAL_SESSION_NOT_FOUND', 'Agent terminal was not found.')
    }
    return terminal
  }
}
