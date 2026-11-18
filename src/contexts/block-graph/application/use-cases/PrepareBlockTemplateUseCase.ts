import { createBlockGraphError } from '../errors/BlockGraphErrors'
import type { BlockTemplateRepository } from '../ports/BlockTemplateRepository'
import type { BlockTemplateSnapshot } from '../dto/BlockTemplateSnapshot'
import { BlockTemplateLibrary } from '../../domain/aggregates/BlockTemplateLibrary'

export class PrepareBlockTemplateUseCase {
  constructor(
    private readonly templates: BlockTemplateRepository,
    private readonly prepared: BlockTemplateRepository
  ) {}
  async execute(command: {
    readonly operationId: string
    readonly templateId: string
    readonly projectId: string
  }): Promise<BlockTemplateSnapshot> {
    const transaction = await this.prepared.transact(async (library) => {
      const existing = library.find(command.operationId)
      const source =
        existing ??
        BlockTemplateLibrary.restore(await this.templates.get()).find(command.templateId)
      if (!source)
        throw createBlockGraphError(
          'BLOCK_TEMPLATE_NOT_FOUND',
          'Selected workspace template was not found.'
        )
      if (source.scope.type === 'project' && source.scope.projectId !== command.projectId) {
        throw createBlockGraphError(
          'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID',
          'Workspace template belongs to another project.'
        )
      }
      if (existing) return existing
      const snapshot = { ...source, id: command.operationId }
      library.add(snapshot)
      return snapshot
    })
    return transaction.result
  }
  async find(operationId: string): Promise<BlockTemplateSnapshot | null> {
    return BlockTemplateLibrary.restore(await this.prepared.get()).find(operationId) ?? null
  }
}
