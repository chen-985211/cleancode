import type {
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot,
  TerminalExecutionConfigSnapshot
} from './BlockGraphTypes'

export type BlockTemplateType = 'terminal' | 'workflow' | 'combination'

export type BlockTemplateScope =
  { readonly type: 'project'; readonly projectId: string } | { readonly type: 'global' }

export interface BlockTemplateNodeSnapshot {
  readonly templateNodeId: string
  readonly name: string
  readonly description: string
  readonly launchCommand: string
  readonly executionConfig: TerminalExecutionConfigSnapshot
  readonly position: BlockPositionSnapshot
  readonly size: TerminalBlockSizeSnapshot
}

export interface BlockTemplateConnectionSnapshot {
  readonly sourceTemplateNodeId: string
  readonly targetTemplateNodeId: string
}

interface BlockTemplateBaseSnapshot {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly scope: BlockTemplateScope
  readonly createdAt: string
  readonly updatedAt: string
  readonly nodes: readonly BlockTemplateNodeSnapshot[]
  readonly connections: readonly BlockTemplateConnectionSnapshot[]
}

interface TerminalBlockTemplateSnapshot extends BlockTemplateBaseSnapshot {
  readonly type: 'terminal'
}

interface TerminalWorkflowTemplateSnapshot extends BlockTemplateBaseSnapshot {
  readonly type: 'workflow'
}

interface TerminalCombinationTemplateSnapshot extends BlockTemplateBaseSnapshot {
  readonly type: 'combination'
}

export type BlockTemplateSnapshot =
  | TerminalBlockTemplateSnapshot
  | TerminalWorkflowTemplateSnapshot
  | TerminalCombinationTemplateSnapshot

type BlockTemplateExecutionScope =
  | { readonly type: 'block-set'; readonly blockIds: readonly string[] }
  | { readonly type: 'terminal-group'; readonly terminalGroupId: string }

export interface InstantiatedBlockTemplateSnapshot {
  readonly blockIds: readonly string[]
  readonly terminalGroupId: string | null
  readonly executionScope: BlockTemplateExecutionScope
}

export interface BlockTemplateLibrarySnapshot {
  readonly version: 1
  readonly templates: readonly BlockTemplateSnapshot[]
}
