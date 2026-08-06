import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface CreateTerminalGroupCommand {
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
      (graph) =>
        graph.createTerminalGroup({
          name: command.name,
          memberBlockIds: command.memberBlockIds,
          position: command.position
        })
    )

    return transaction.graph
  }
}
