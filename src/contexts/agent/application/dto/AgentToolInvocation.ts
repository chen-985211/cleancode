import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type { AgentPeerCreationPort } from '../ports/AgentPeerCreationPort'

export interface ExecuteAgentToolCommand {
  readonly peerCreation?: AgentPeerCreationPort
  readonly signal?: AbortSignal
  readonly agentId: string
  readonly approved?: boolean
  readonly input: unknown
  readonly projectDirectory: string
  readonly projectId: string
  readonly sessionId: string
  readonly toolCallId: string
  readonly toolName: AgentToolName
  readonly workspaceId: string
}
