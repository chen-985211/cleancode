import type { AgentConsoleFlowNode } from './agentConsoleFlowNode'
import type { TerminalFlowNode } from './terminalFlowNode'
import type { TerminalGroupFlowNode } from './terminalGroupFlowNode'

export type WorkbenchFlowNode = AgentConsoleFlowNode | TerminalFlowNode | TerminalGroupFlowNode
export type MinimapFlowNode = WorkbenchFlowNode
