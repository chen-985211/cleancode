import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface CreateTerminalGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly name: string
  readonly memberBlockIds: readonly string[]
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
          memberBlockIds: command.memberBlockIds
        })
    )

    return transaction.graph
  }
}
