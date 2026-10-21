import { AgentNode } from './agent/AgentNode'
import { AgentApprovalIntentEdge } from './agent/AgentApprovalIntentEdge'
import { TerminalGroupNode } from './terminal-group/TerminalGroupNode'
import { TerminalNode } from './terminal/TerminalNode'
import { TerminalDependencyEdge } from './terminal/TerminalDependencyEdge'

export const workbenchNodeTypes = {
  agentConsole: AgentNode,
  terminal: TerminalNode,
  terminalGroup: TerminalGroupNode
}

export const workbenchEdgeTypes = {
  terminalDependency: TerminalDependencyEdge,
  approvalIntent: AgentApprovalIntentEdge
}
