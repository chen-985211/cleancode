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
  readonly workspaceName: string
  readonly name: string
  readonly description: string
  readonly launchCommand?: string
  readonly position?: BlockPositionSnapshot
  readonly size?: TerminalBlockSizeSnapshot
  readonly reservedRegions?: readonly TerminalLayoutRegion[]
  readonly anchorRegion?: TerminalLayoutRegion
}

export class CreateTerminalBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: CreateTerminalBlockCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => {
        if (!command.position && !command.anchorRegion) {
          throw createExpectedAppError(
            'TERMINAL_LAYOUT_ANCHOR_REQUIRED',
            'Automatic terminal placement requires an anchor region.'
          )
        }

        const block = graph.createTerminalBlock({
          name: command.name,
          description: command.description,
          launchCommand: command.launchCommand,
          position: command.position ?? { x: 0, y: 0 },
          size: command.size
        })

        if (!command.position && command.anchorRegion) {
          graph.arrangeTerminalLayout({
            anchorRegion: command.anchorRegion,
            blockIds: [block.id],
            reservedRegions: command.reservedRegions ?? []
          })
        }

        return block
      }
    )

    return transaction.graph
  }
}
