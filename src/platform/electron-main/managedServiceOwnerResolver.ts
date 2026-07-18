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

    const graph = await graphs.findDefaultGraphSnapshot(owner.projectDirectory, owner.workspaceName)
    const terminalName =
      graph?.projectId === owner.projectId && graph.workspaceName === owner.workspaceName
        ? graph.blocks.find((block) => block.id === owner.blockId)?.name
        : undefined

    return {
      identity: {
        projectId: owner.projectId,
        workspaceName: owner.workspaceName,
        blockId: owner.blockId,
        sessionId: owner.sessionId,
        runId: owner.runId,
        generation: owner.generation
      },
      projectName: project.name,
      workspaceName: owner.workspaceName,
      terminalName: terminalName ?? owner.blockId
    }
  }
}
