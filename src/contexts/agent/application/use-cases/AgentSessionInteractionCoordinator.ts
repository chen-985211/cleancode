import type { AgentTerminalRuntimePort } from '../ports/AgentTerminalRuntimePort'
import type { ManagedAgentActivityRegistry } from './ManagedAgentActivityRegistry'
import type { ManagedAgentSession } from './AgentSessionRuntimeState'

export interface WriteCommand {
  readonly input: string
  readonly sessionId: string
}

export interface ResizeCommand {
  readonly columns: number
  readonly rows: number
  readonly sessionId: string
}

export interface MetadataCommand {
  readonly agentId: string
  readonly agentName: string
  readonly sessionId: string
}

export class Coordinator {
  constructor(
    private readonly terminalRuntime: AgentTerminalRuntimePort,
    private readonly managedActivity: ManagedAgentActivityRegistry,
    private readonly findSessionById: (sessionId: string) => ManagedAgentSession | undefined
  ) {}

  write(command: WriteCommand): void {
    this.terminalRuntime.write(command.sessionId, command.input)
  }

  resize(command: ResizeCommand): void {
    const session = this.findSessionById(command.sessionId)
    if (!session) return
    session.columns = command.columns
    session.rows = command.rows
    this.terminalRuntime.resize(command.sessionId, command.columns, command.rows)
  }

  updateMetadata(command: MetadataCommand): boolean {
    const session = this.findSessionById(command.sessionId)
    if (!session || session.agentId !== command.agentId) return false
    this.updateAgentName(session, command.agentName)
    return true
  }

  updateAgentName(session: ManagedAgentSession, agentName: string): void {
    if (session.agentName === agentName) return
    session.agentName = agentName
    this.managedActivity.updateAgentName(session)
  }
}
