import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface DisconnectTerminalBlocksCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly connectionId: string
}

export class DisconnectTerminalBlocksUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: DisconnectTerminalBlocksCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.disconnectTerminalBlocks(command.connectionId)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
