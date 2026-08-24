import type { WorkspaceExternalOpenCapabilitiesSnapshot } from '../dto/WorkspaceExternalOpen'
import type { WorkspaceExternalOpenPort } from '../ports/WorkspaceExternalOpenPort'

export class GetWorkspaceExternalOpenCapabilitiesUseCase {
  constructor(private readonly externalOpen: WorkspaceExternalOpenPort) {}

  execute(): Promise<WorkspaceExternalOpenCapabilitiesSnapshot> {
    return this.externalOpen.getCapabilities()
  }
}
