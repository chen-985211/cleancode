import type { BlockGraphRepository } from '../../contexts/block-graph/application/ports/BlockGraphRepository'
import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import type {
  ManagedTerminalServiceOwner,
  TerminalRunIdentity
} from '../../contexts/run/application/dto/TerminalRunEvent'

export interface ManagedServiceOwnerReference extends TerminalRunIdentity {
  readonly projectDirectory: string
}

export type ManagedServiceOwnerResolver = (
  owner: ManagedServiceOwnerReference
) => Promise<ManagedTerminalServiceOwner | null>

export function createManagedServiceOwnerResolver(
  projects: ProjectRepository,
  graphs: BlockGraphRepository
): ManagedServiceOwnerResolver {
  return async (owner) => {
    const project = await projects.findByDirectory(owner.projectDirectory)

    if (!project || project.id !== owner.projectId) {
      return null
    }

    const graph = await graphs.findDefaultGraphSnapshot(owner.projectDirectory, owner.workspaceId)
    const workspace = project.workspaces.find(
      (candidate) => candidate.workspaceId === owner.workspaceId
    )
    const terminalName =
      graph?.projectId === owner.projectId && graph.workspaceId === owner.workspaceId
        ? graph.blocks.find((block) => block.id === owner.blockId)?.name
        : undefined

    return {
      identity: {
        projectId: owner.projectId,
        workspaceId: owner.workspaceId,
        blockId: owner.blockId,
        sessionId: owner.sessionId,
        runId: owner.runId,
        generation: owner.generation
      },
      projectName: project.name,
      workspaceId: owner.workspaceId,
      workspaceDisplayName: workspace?.displayName ?? owner.workspaceId,
      terminalName: terminalName ?? owner.blockId
    }
  }
}
