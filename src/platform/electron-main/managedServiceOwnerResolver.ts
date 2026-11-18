import type { FindDefaultGraphSnapshotUseCase } from '../../contexts/block-graph/application/use-cases/FindDefaultGraphSnapshotUseCase'
import type { FindProjectByDirectoryUseCase } from '../../contexts/project/application/use-cases/FindProjectByDirectoryUseCase'
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
  projects: Pick<FindProjectByDirectoryUseCase, 'execute'>,
  graphs: Pick<FindDefaultGraphSnapshotUseCase, 'execute'>
): ManagedServiceOwnerResolver {
  return async (owner) => {
    const project = await projects.execute({ directory: owner.projectDirectory })

    if (!project || project.id !== owner.projectId) {
      return null
    }

    const graph = await graphs.execute({
      projectDirectory: owner.projectDirectory,
      workspaceId: owner.workspaceId
    })
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
