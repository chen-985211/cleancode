export interface BlockPositionSnapshot {
  readonly x: number
  readonly y: number
}

export interface TerminalBlockSizeSnapshot {
  readonly width: number
  readonly height: number
}

export interface TerminalGroupSizeSnapshot {
  readonly width: number
  readonly height: number
}

export interface CanvasViewportSnapshot {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export interface TerminalTaskExecutionConfigSnapshot {
  readonly mode: 'task'
  readonly successExitCodes: readonly number[]
  readonly timeoutMs: number | null
}

interface TerminalOutputReadinessSnapshot {
  readonly type: 'output'
  readonly text: string
}

interface TerminalTcpReadinessSnapshot {
  readonly type: 'tcp'
  readonly port: number
}

type TerminalServiceReadinessSnapshot =
  TerminalOutputReadinessSnapshot | TerminalTcpReadinessSnapshot

interface TerminalServiceExecutionConfigSnapshot {
  readonly mode: 'service'
  readonly readiness: TerminalServiceReadinessSnapshot
  readonly readinessTimeoutMs: number
}

export type TerminalExecutionConfigSnapshot =
  TerminalTaskExecutionConfigSnapshot | TerminalServiceExecutionConfigSnapshot

export interface TerminalConnectionSnapshot {
  readonly id: string
  readonly sourceBlockId: string
  readonly targetBlockId: string
}

export interface TerminalBlockSnapshot {
  readonly id: string
  readonly type: 'terminal'
  readonly name: string
  readonly description: string
  readonly launchCommand: string
  readonly executionConfig?: TerminalExecutionConfigSnapshot
  readonly position: BlockPositionSnapshot
  readonly size: TerminalBlockSizeSnapshot
}

export interface TerminalGroupSnapshot {
  readonly id: string
  readonly type: 'terminal-group'
  readonly name: string
  readonly position: BlockPositionSnapshot
  readonly size: TerminalGroupSizeSnapshot
  readonly isCollapsed: boolean
  readonly memberBlockIds: readonly string[]
}

export interface BlockGraphSnapshot {
  readonly id: string
  readonly projectId: string
  readonly workspaceName: string
  readonly viewport: CanvasViewportSnapshot
  readonly blocks: readonly TerminalBlockSnapshot[]
  readonly connections?: readonly TerminalConnectionSnapshot[]
  readonly terminalGroups: readonly TerminalGroupSnapshot[]
}

export type RestorableTerminalBlockSnapshot = Omit<
  TerminalBlockSnapshot,
  'executionConfig' | 'launchCommand' | 'size'
> & {
  readonly executionConfig?: TerminalExecutionConfigSnapshot
  readonly launchCommand?: string
  readonly size?: Partial<TerminalBlockSizeSnapshot>
}

export type RestorableBlockGraphSnapshot = Omit<
  BlockGraphSnapshot,
  'blocks' | 'connections' | 'terminalGroups' | 'viewport'
> & {
  readonly blocks: readonly RestorableTerminalBlockSnapshot[]
  readonly connections?: readonly Partial<TerminalConnectionSnapshot>[]
  readonly viewport?: Partial<CanvasViewportSnapshot>
  readonly terminalGroups?: readonly Partial<TerminalGroupSnapshot>[]
}

export interface CreateDefaultGraphInput {
  readonly id?: string
  readonly projectId: string
  readonly workspaceName: string
}

export interface CreateTerminalBlockInput {
  readonly id?: string
  readonly name: string
  readonly description: string
  readonly launchCommand?: string
  readonly position: BlockPositionSnapshot
  readonly size?: Partial<TerminalBlockSizeSnapshot>
}

export interface UpdateTerminalBlockMetadataInput {
  readonly name: string
  readonly description: string
  readonly launchCommand: string
}

export interface ConnectTerminalBlocksInput {
  readonly id?: string
  readonly sourceBlockId: string
  readonly targetBlockId: string
}

export type UpdateTerminalExecutionConfigInput = TerminalExecutionConfigSnapshot

export interface ResizeTerminalBlockInput {
  readonly position: BlockPositionSnapshot
  readonly size: Partial<TerminalBlockSizeSnapshot>
}

export interface CreateTerminalGroupInput {
  readonly id?: string
  readonly name: string
  readonly memberBlockIds: readonly string[]
}

export interface UpdateTerminalGroupMetadataInput {
  readonly name: string
}

export const defaultCanvasViewport: CanvasViewportSnapshot = {
  x: 0,
  y: 0,
  zoom: 1
}

export const minimumCanvasZoom = 0.35
export const maximumCanvasZoom = 1.6

export const defaultTerminalBlockSize: TerminalBlockSizeSnapshot = {
  width: 560,
  height: 360
}

export const minimumTerminalBlockSize: TerminalBlockSizeSnapshot = {
  width: 360,
  height: 240
}

export const defaultTerminalExecutionConfig: TerminalTaskExecutionConfigSnapshot = {
  mode: 'task',
  successExitCodes: [0],
  timeoutMs: null
}
