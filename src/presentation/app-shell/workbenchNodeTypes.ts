import { AgentNode } from './AgentNode'
import { AgentApprovalIntentEdge } from './AgentApprovalIntentEdge'
import { TerminalGroupNode } from './TerminalGroupNode'
import { TerminalNode } from './TerminalNode'

export const workbenchNodeTypes = {
  agentConsole: AgentNode,
  terminal: TerminalNode,
  terminalGroup: TerminalGroupNode
}

export const workbenchEdgeTypes = {
  approvalIntent: AgentApprovalIntentEdge
}
