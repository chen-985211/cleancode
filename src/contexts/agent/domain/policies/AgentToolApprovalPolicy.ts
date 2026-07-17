import type { AgentToolName } from '../value-objects/AgentToolName'

const destructiveAgentToolNames = new Set<AgentToolName>([
  'delete_block',
  'delete_terminal_group',
  'disconnect_terminal_blocks'
])

export class AgentToolApprovalPolicy {
  requiresApproval(toolName: AgentToolName): boolean {
    return destructiveAgentToolNames.has(toolName)
  }
}
