import type { TerminalExecutionConfigSnapshot } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface UpdateTerminalDefinitionCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly name: string
  readonly description: string
  readonly launchCommand: string
  readonly executionConfig: TerminalExecutionConfigSnapshot
}

export class UpdateTerminalDefinitionUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: UpdateTerminalDefinitionCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) =>
        graph.updateTerminalDefinition(command.blockId, {
          description: command.description,
          executionConfig: command.executionConfig,
          launchCommand: command.launchCommand,
          name: command.name
        })
    )

    return transaction.graph
  }
}
