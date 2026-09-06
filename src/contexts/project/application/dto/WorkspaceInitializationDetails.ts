import type { WorkspaceAgentSnapshot } from '../../../agent/application/dto/WorkspaceAgentSnapshot'
import type { BlockGraphSnapshot } from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type { BlockTemplateSnapshot } from '../../../block-graph/application/dto/BlockTemplateSnapshot'
import type { WorkspaceInitializationSnapshot } from '../../domain/aggregates/WorkspaceInitialization'

export type { WorkspaceInitializationSnapshot } from '../../domain/aggregates/WorkspaceInitialization'
export type { WorkspaceDefaults } from '../../domain/value-objects/WorkspaceDefaults'

export interface WorkspaceInitializationDetails {
  readonly initialization: WorkspaceInitializationSnapshot
  readonly templates: readonly {
    readonly itemId: string
    readonly template: BlockTemplateSnapshot
  }[]
}

export interface WorkspaceInitializationResult {
  readonly initialization: WorkspaceInitializationSnapshot
  readonly graph: BlockGraphSnapshot
  readonly agents: readonly WorkspaceAgentSnapshot[]
}

export { MAX_WORKSPACE_DEFAULT_AGENTS } from '../../domain/value-objects/WorkspaceDefaults'
