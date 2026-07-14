import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalExecutionConfigSnapshot } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface UpdateTerminalExecutionConfigCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
  readonly executionConfig: TerminalExecutionConfigSnapshot
}

export class UpdateTerminalExecutionConfigUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: UpdateTerminalExecutionConfigCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.updateTerminalExecutionConfig(command.blockId, command.executionConfig)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
