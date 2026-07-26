import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import {
  noopTerminalRunLifecyclePort,
  type TerminalRunLifecycleLease,
  type TerminalRunLifecyclePort
} from '../ports/TerminalRunLifecyclePort'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface DeleteBlockCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
}

export class DeleteBlockUseCase {
  constructor(
    private readonly graphRepository: BlockGraphRepository,
    private readonly terminalRunLifecycle: TerminalRunLifecyclePort = noopTerminalRunLifecyclePort
  ) {}

  async execute(command: DeleteBlockCommand): Promise<BlockGraphSnapshot> {
    const leaseState: { current: TerminalRunLifecycleLease | null } = { current: null }
    let disposalConfirmed = false
    let transactionCommitted = false

    try {
      const transaction = await executeDefaultGraphTransaction(
        this.graphRepository,
        command,
        async (graph) => {
          graph.ensureTerminalBlockExists(command.blockId)
          leaseState.current = await this.terminalRunLifecycle.acquireTerminalDeletion({
            blockId: command.blockId,
            projectDirectory: command.projectDirectory,
            projectId: graph.projectId,
            workspaceId: command.workspaceId
          })
          await leaseState.current.hardDispose()
          disposalConfirmed = true
          graph.deleteBlock(command.blockId)
        }
      )

      transactionCommitted = true
      return transaction.graph
    } finally {
      if (leaseState.current) {
        if (transactionCommitted) leaseState.current.resolve()
        else if (disposalConfirmed) leaseState.current.release()
        else leaseState.current.quarantine()
      }
    }
  }
}
