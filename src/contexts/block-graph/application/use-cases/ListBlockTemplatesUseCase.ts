import { BlockTemplateLibrary } from '../../domain/aggregates/BlockTemplateLibrary'
import type { BlockTemplateScope } from '../../domain/aggregates/BlockTemplateTypes'
import type { BlockTemplateRepository } from '../ports/BlockTemplateRepository'

export interface ListBlockTemplatesQuery {
  readonly scope: BlockTemplateScope
}

export class ListBlockTemplatesUseCase {
  constructor(private readonly repository: BlockTemplateRepository) {}

  async execute(query: ListBlockTemplatesQuery) {
    return BlockTemplateLibrary.restore(await this.repository.get()).list(query.scope)
  }
}
