import type { BlockTemplateRepository } from '../ports/BlockTemplateRepository'

export interface DeleteBlockTemplateCommand {
  readonly templateId: string
}

export class DeleteBlockTemplateUseCase {
  constructor(private readonly repository: BlockTemplateRepository) {}

  async execute(command: DeleteBlockTemplateCommand): Promise<void> {
    await this.repository.transact((library) => library.remove(command.templateId))
  }
}
