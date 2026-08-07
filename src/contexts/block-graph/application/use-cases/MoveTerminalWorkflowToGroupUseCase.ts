import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { TerminalLayoutRegion } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { assertTerminalGroupMembershipMoveFitsCanvas } from '../../domain/services/TerminalGroupCanvasPolicy'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface MoveTerminalWorkflowToGroupCommand {
  readonly canvasRegions?: readonly TerminalLayoutRegion[]
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly targetTerminalGroupId: string | null
  readonly position?: { readonly x: number; readonly y: number }
}

export class MoveTerminalWorkflowToGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: MoveTerminalWorkflowToGroupCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => {
        const before = graph.toSnapshot()
        graph.moveTerminalWorkflowToGroup(
          command.blockId,
          command.targetTerminalGroupId,
          command.position
        )
        if (command.canvasRegions) {
          assertTerminalGroupMembershipMoveFitsCanvas({
            after: graph.toSnapshot(),
            before,
            canvasRegions: command.canvasRegions,
            targetTerminalGroupId: command.targetTerminalGroupId
          })
        }
      }
    )

    return transaction.graph
  }
}
