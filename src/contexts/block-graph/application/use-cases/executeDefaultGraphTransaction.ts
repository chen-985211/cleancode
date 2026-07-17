import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type {
  BlockGraphRepository,
  BlockGraphTransactionResult
} from '../ports/BlockGraphRepository'

interface DefaultGraphTransactionScope {
  readonly projectDirectory: string
  readonly workspaceName: string
}

export async function executeDefaultGraphTransaction<TResult>(
  repository: BlockGraphRepository,
  scope: DefaultGraphTransactionScope,
  transaction: (graph: BlockGraph) => TResult
): Promise<BlockGraphTransactionResult<TResult>> {
  const result = await repository.transactDefaultGraph(
    scope.projectDirectory,
    scope.workspaceName,
    transaction
  )

  if (!result) {
    throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
  }

  return result
}
