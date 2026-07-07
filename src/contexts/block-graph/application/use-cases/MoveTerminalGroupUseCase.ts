import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraphSnapshot, BlockPositionSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface MoveTerminalGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly terminalGroupId: string
  readonly position: BlockPositionSnapshot
}

export class MoveTerminalGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: MoveTerminalGroupCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.moveTerminalGroup(command.terminalGroupId, command.position)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
