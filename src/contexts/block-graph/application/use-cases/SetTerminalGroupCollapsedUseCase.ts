import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface SetTerminalGroupCollapsedCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly terminalGroupId: string
  readonly isCollapsed: boolean
}

export class SetTerminalGroupCollapsedUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: SetTerminalGroupCollapsedCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.setTerminalGroupCollapsed(command.terminalGroupId, command.isCollapsed)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
