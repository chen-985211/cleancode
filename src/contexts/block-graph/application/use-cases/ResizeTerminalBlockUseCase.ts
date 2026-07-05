import type { BlockGraphSnapshot, TerminalBlockSizeSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface ResizeTerminalBlockCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
  readonly size: TerminalBlockSizeSnapshot
}

export class ResizeTerminalBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: ResizeTerminalBlockCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw new Error('Default block graph was not created.')
    }

    graph.resizeTerminalBlock(command.blockId, command.size)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
