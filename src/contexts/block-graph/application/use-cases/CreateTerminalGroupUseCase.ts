import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { TerminalLayoutRegion } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { resolveEmptyTerminalGroupCanvasPosition } from '../../domain/services/TerminalGroupCanvasPolicy'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface CreateTerminalGroupCommand {
  readonly canvasRegions?: readonly TerminalLayoutRegion[]
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly name: string
  readonly memberBlockIds?: readonly string[]
  readonly position?: { readonly x: number; readonly y: number }
}

export class CreateTerminalGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: CreateTerminalGroupCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => {
        const position =
          command.position ??
          (command.canvasRegions && (command.memberBlockIds?.length ?? 0) === 0
            ? resolveEmptyTerminalGroupCanvasPosition(graph.toSnapshot(), command.canvasRegions)
            : undefined)

        return graph.createTerminalGroup({
          name: command.name,
          memberBlockIds: command.memberBlockIds,
          position
        })
      }
    )

    return transaction.graph
  }
}
