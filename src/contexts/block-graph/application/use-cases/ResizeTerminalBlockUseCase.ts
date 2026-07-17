import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot
} from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface ResizeTerminalBlockCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
  readonly position: BlockPositionSnapshot
  readonly size: TerminalBlockSizeSnapshot
}

export class ResizeTerminalBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: ResizeTerminalBlockCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) =>
        graph.resizeTerminalBlock(command.blockId, {
          position: command.position,
          size: command.size
        })
    )

    return transaction.graph
  }
}
