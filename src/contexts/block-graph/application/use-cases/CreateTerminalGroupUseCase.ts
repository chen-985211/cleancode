import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface CreateTerminalGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly name: string
  readonly memberBlockIds: readonly string[]
}

export class CreateTerminalGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: CreateTerminalGroupCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    graph.createTerminalGroup({
      name: command.name,
      memberBlockIds: command.memberBlockIds
    })
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
