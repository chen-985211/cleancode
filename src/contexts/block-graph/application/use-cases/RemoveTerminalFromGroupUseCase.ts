import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface RemoveTerminalFromGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly terminalGroupId: string
  readonly blockId: string
}

export class RemoveTerminalFromGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: RemoveTerminalFromGroupCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.removeTerminalFromGroup(command.terminalGroupId, command.blockId)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
