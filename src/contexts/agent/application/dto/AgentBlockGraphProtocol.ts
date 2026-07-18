import type { AgentTerminalExecutionConfigSnapshot } from './AgentTerminalWorkflowProtocol'

export interface AgentBlockPositionSnapshot {
  readonly x: number
  readonly y: number
}

export interface AgentTerminalBlockSizeSnapshot {
  readonly width: number
  readonly height: number
}

interface AgentCanvasViewportSnapshot {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

interface AgentTerminalBlockSnapshot {
  readonly id: string
  readonly type: 'terminal'
  readonly name: string
  readonly description: string
  readonly launchCommand: string
  readonly executionConfig?: AgentTerminalExecutionConfigSnapshot
  readonly position: AgentBlockPositionSnapshot
  readonly size: AgentTerminalBlockSizeSnapshot
}

interface AgentTerminalConnectionSnapshot {
  readonly id: string
  readonly sourceBlockId: string
  readonly targetBlockId: string
}

interface AgentTerminalGroupSnapshot {
  readonly id: string
  readonly type: 'terminal-group'
  readonly name: string
  readonly position: AgentBlockPositionSnapshot
  readonly size: AgentTerminalBlockSizeSnapshot
  readonly isCollapsed: boolean
  readonly memberBlockIds: readonly string[]
}

export interface AgentBlockGraphSnapshot {
  readonly id: string
  readonly projectId: string
  readonly workspaceName: string
  readonly viewport: AgentCanvasViewportSnapshot
  readonly blocks: readonly AgentTerminalBlockSnapshot[]
  readonly connections?: readonly AgentTerminalConnectionSnapshot[]
  readonly terminalGroups: readonly AgentTerminalGroupSnapshot[]
}
