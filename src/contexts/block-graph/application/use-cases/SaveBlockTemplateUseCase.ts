import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockTemplateScope } from '../../domain/aggregates/BlockTemplateTypes'
import { createBlockTemplate } from '../../domain/services/BlockTemplateProjection'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import type { BlockTemplateRepository } from '../ports/BlockTemplateRepository'

export interface SaveBlockTemplateCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly selectedBlockIds: readonly string[]
  readonly name: string
  readonly description: string
  readonly scope: BlockTemplateScope
}

interface SaveBlockTemplateDependencies {
  readonly createId: () => string
  readonly now: () => string
}

const defaultDependencies: SaveBlockTemplateDependencies = {
  createId: () =>
    globalThis.crypto?.randomUUID?.() ?? `block-template-${Date.now()}-${Math.random()}`,
  now: () => new Date().toISOString()
}

export class SaveBlockTemplateUseCase {
  constructor(
    private readonly graphRepository: BlockGraphRepository,
    private readonly templateRepository: BlockTemplateRepository,
    private readonly dependencies: SaveBlockTemplateDependencies = defaultDependencies
  ) {}

  async execute(command: SaveBlockTemplateCommand) {
    const graph = await this.graphRepository.findDefaultGraphSnapshot(
      command.projectDirectory,
      command.workspaceId
    )
    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }
    if (command.scope.type === 'project' && command.scope.projectId !== graph.projectId) {
      throw createExpectedAppError(
        'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID',
        'Project template scope does not match the source project.'
      )
    }

    const template = createBlockTemplate({
      createdAt: this.dependencies.now(),
      description: command.description,
      graph,
      id: this.dependencies.createId(),
      name: command.name,
      scope: command.scope,
      selectedBlockIds: command.selectedBlockIds
    })
    await this.templateRepository.transact((library) => library.add(template))

    return template
  }
}
