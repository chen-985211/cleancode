import type { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'

export interface BlockGraphRepository {
  saveDefaultGraph(projectDirectory: string, graph: BlockGraph): Promise<void>
  findDefaultGraph(projectDirectory: string, workspaceName: string): Promise<BlockGraph | null>
  findDefaultGraphSnapshot(
    projectDirectory: string,
    workspaceName: string
  ): Promise<BlockGraphSnapshot | null>
}
