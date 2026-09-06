import type { WorkspaceDefaults } from '../../domain/value-objects/WorkspaceDefaults'
import type { WorkspaceInitializationSnapshot } from '../../domain/aggregates/WorkspaceInitialization'

export interface WorkspaceInitializationRepository {
  getDefaults(projectId: string): Promise<WorkspaceDefaults>
  saveDefaults(projectId: string, defaults: WorkspaceDefaults): Promise<void>
  find(id: string): Promise<WorkspaceInitializationSnapshot | null>
  list(projectId: string, workspaceId?: string): Promise<readonly WorkspaceInitializationSnapshot[]>
  save(snapshot: WorkspaceInitializationSnapshot): Promise<void>
}
