import type {
  AgentPeerCreatedSnapshot,
  CreatePeerAgentInput
} from '../dto/AgentCollaborationProtocol'

/** Requests native peer creation from the originating canvas, inside its authenticated scope. */
export interface AgentPeerCreationPort {
  create(input: CreatePeerAgentInput): Promise<AgentPeerCreatedSnapshot>
}
