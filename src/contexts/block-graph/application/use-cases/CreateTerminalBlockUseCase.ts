import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot,
  TerminalLayoutRegion
} from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface CreateTerminalBlockCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly name: string
  readonly description: string
  readonly launchCommand?: string
  readonly position?: BlockPositionSnapshot
  readonly size?: TerminalBlockSizeSnapshot
  readonly canvasRegions?: readonly TerminalLayoutRegion[]
}

export class CreateTerminalBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: CreateTerminalBlockCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => {
        if (!command.position && !command.canvasRegions) {
          throw createExpectedAppError(
            'TERMINAL_LAYOUT_ANCHOR_REQUIRED',
            'Automatic terminal placement requires canvas regions.'
          )
        }

        const block = graph.createTerminalBlock({
          name: command.name,
          description: command.description,
          launchCommand: command.launchCommand,
          position: command.position ?? { x: 0, y: 0 },
          size: command.size
        })

        if (!command.position && command.canvasRegions) {
          graph.arrangeTerminalLayout({
            blockIds: [block.id],
            canvasRegions: command.canvasRegions
          })
        }

        return block
      }
    )

    return transaction.graph
  }
}
