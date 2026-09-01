import { AgentNode } from './agent/AgentNode'
import { AgentApprovalIntentEdge } from './agent/AgentApprovalIntentEdge'
import { TerminalGroupNode } from './terminal-group/TerminalGroupNode'
import { TerminalNode } from './terminal/TerminalNode'

export const workbenchNodeTypes = {
  agentConsole: AgentNode,
  terminal: TerminalNode,
  terminalGroup: TerminalGroupNode
}

export const workbenchEdgeTypes = {
  approvalIntent: AgentApprovalIntentEdge
}
