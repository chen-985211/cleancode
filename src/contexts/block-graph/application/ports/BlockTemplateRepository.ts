import type { BlockTemplateLibrary } from '../../domain/aggregates/BlockTemplateLibrary'
import type { BlockTemplateLibrarySnapshot } from '../../domain/aggregates/BlockTemplateTypes'

interface BlockTemplateTransactionResult<TResult> {
  readonly library: BlockTemplateLibrarySnapshot
  readonly result: TResult
}

export interface BlockTemplateRepository {
  get(): Promise<BlockTemplateLibrarySnapshot>
  transact<TResult>(
    transaction: (library: BlockTemplateLibrary) => TResult | Promise<TResult>
  ): Promise<BlockTemplateTransactionResult<TResult>>
}
