import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface DissolveTerminalGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly terminalGroupId: string
}

export class DissolveTerminalGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: DissolveTerminalGroupCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.dissolveTerminalGroup(command.terminalGroupId)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
