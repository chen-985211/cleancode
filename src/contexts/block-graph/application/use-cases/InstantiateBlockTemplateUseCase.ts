import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockPositionSnapshot } from '../../domain/aggregates/BlockGraphTypes'
import { BlockTemplateLibrary } from '../../domain/aggregates/BlockTemplateLibrary'
import type {
  BlockTemplateSnapshot,
  InstantiatedBlockTemplateSnapshot
} from '../../domain/aggregates/BlockTemplateTypes'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import type { BlockTemplateRepository } from '../ports/BlockTemplateRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface InstantiateBlockTemplateCommand {
  readonly operationId?: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly templateId: string
  readonly origin: BlockPositionSnapshot
}

export interface InstantiateBlockTemplateResult {
  readonly graph: BlockGraphSnapshot
  readonly instance: InstantiatedBlockTemplateSnapshot
  readonly template: BlockTemplateSnapshot
}

export class InstantiateBlockTemplateUseCase {
  constructor(
    private readonly graphRepository: BlockGraphRepository,
    private readonly templateRepository: BlockTemplateRepository
  ) {}

  async execute(
    command: InstantiateBlockTemplateCommand,
    frozenTemplate?: BlockTemplateSnapshot
  ): Promise<InstantiateBlockTemplateResult> {
    const template =
      frozenTemplate ??
      BlockTemplateLibrary.restore(await this.templateRepository.get()).find(command.templateId)
    if (!template) {
      throw createExpectedAppError('BLOCK_TEMPLATE_NOT_FOUND', 'Block template was not found.')
    }
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => {
        if (template.scope.type === 'project' && template.scope.projectId !== graph.projectId) {
          throw createExpectedAppError(
            'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID',
            'Project template cannot be applied to another project.'
          )
        }

        if (template.id !== command.templateId) {
          throw createExpectedAppError(
            'WORKSPACE_INITIALIZATION_CONFLICT',
            'Template operation conflicts with its recorded content.'
          )
        }
        return graph.instantiateBlockTemplate(template, command.origin, command.operationId)
      }
    )

    return {
      graph: transaction.graph,
      instance: transaction.result,
      template
    }
  }
}
