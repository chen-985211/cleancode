import type { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'

export interface BlockGraphTransactionResult<TResult> {
  readonly graph: BlockGraphSnapshot
  readonly result: TResult
}

export interface BlockGraphRepository {
  initializeDefaultGraph(projectDirectory: string, graph: BlockGraph): Promise<BlockGraphSnapshot>
  findDefaultGraph(projectDirectory: string, workspaceName: string): Promise<BlockGraph | null>
  findDefaultGraphSnapshot(
    projectDirectory: string,
    workspaceName: string
  ): Promise<BlockGraphSnapshot | null>
  transactDefaultGraph<TResult>(
    projectDirectory: string,
    workspaceName: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ): Promise<BlockGraphTransactionResult<TResult> | null>
}
