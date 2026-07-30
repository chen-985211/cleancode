import type { BlockTemplateRepository } from '../ports/BlockTemplateRepository'

export interface UpdateBlockTemplateCommand {
  readonly templateId: string
  readonly name: string
  readonly description: string
}

export class UpdateBlockTemplateUseCase {
  constructor(
    private readonly repository: BlockTemplateRepository,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async execute(command: UpdateBlockTemplateCommand) {
    const transaction = await this.repository.transact((library) =>
      library.updateMetadata(command.templateId, {
        description: command.description,
        name: command.name,
        updatedAt: this.now()
      })
    )
    return transaction.result
  }
}
