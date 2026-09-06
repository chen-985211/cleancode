import type {
  WorkspaceContentResult,
  WorkspaceInitializationItem,
  WorkspaceInitializationSnapshot
} from '../../domain/aggregates/WorkspaceInitialization'

export type WorkspaceInitializationScope = Pick<
  WorkspaceInitializationSnapshot,
  'projectId' | 'projectDirectory' | 'workspaceId' | 'workspaceDirectory' | 'branchName'
>

export interface WorkspaceInitializationContentPort {
  isEmpty(scope: WorkspaceInitializationScope): Promise<boolean>
  prepareTemplate(
    scope: WorkspaceInitializationScope,
    item: WorkspaceInitializationItem
  ): Promise<string>
  createTemplate(
    scope: WorkspaceInitializationScope,
    item: WorkspaceInitializationItem
  ): Promise<WorkspaceContentResult>
  createAgent(
    scope: WorkspaceInitializationScope,
    item: WorkspaceInitializationItem
  ): Promise<WorkspaceContentResult>
  run(scope: WorkspaceInitializationScope, result: WorkspaceContentResult): Promise<string>
}
