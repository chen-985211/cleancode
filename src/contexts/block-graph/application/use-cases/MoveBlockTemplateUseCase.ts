import type { BlockTemplateScope } from '../../domain/aggregates/BlockTemplateTypes'
import type { BlockTemplateRepository } from '../ports/BlockTemplateRepository'

export interface MoveBlockTemplateCommand {
  readonly templateId: string
  readonly scope: BlockTemplateScope
}

export class MoveBlockTemplateUseCase {
  constructor(
    private readonly repository: BlockTemplateRepository,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async execute(command: MoveBlockTemplateCommand) {
    const transaction = await this.repository.transact((library) =>
      library.move(command.templateId, {
        scope: command.scope,
        updatedAt: this.now()
      })
    )
    return transaction.result
  }
}
