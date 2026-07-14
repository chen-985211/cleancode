import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface ConnectTerminalBlocksCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly sourceBlockId: string
  readonly targetBlockId: string
}

export class ConnectTerminalBlocksUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: ConnectTerminalBlocksCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.connectTerminalBlocks({
      sourceBlockId: command.sourceBlockId,
      targetBlockId: command.targetBlockId
    })
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
