import type {
  WorkspaceExternalOpenCapabilitiesSnapshot,
  WorkspaceExternalOpenTarget
} from '../dto/WorkspaceExternalOpen'

export interface WorkspaceExternalOpenPort {
  getCapabilities(): Promise<WorkspaceExternalOpenCapabilitiesSnapshot>
  open(input: {
    readonly directory: string
    readonly target: WorkspaceExternalOpenTarget
  }): Promise<void>
}
