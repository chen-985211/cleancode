import type { TerminalRemovalTargetSnapshot } from '../../domain/aggregates/BlockGraphTypes'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import {
  noopTerminalRunLifecyclePort,
  type TerminalRunLifecycleLease,
  type TerminalRunLifecyclePort
} from '../ports/TerminalRunLifecyclePort'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface DeleteTerminalScopeCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly target: TerminalRemovalTargetSnapshot
}

export class DeleteTerminalScopeUseCase {
  constructor(
    private readonly graphRepository: BlockGraphRepository,
    private readonly terminalRunLifecycle: TerminalRunLifecyclePort = noopTerminalRunLifecyclePort
  ) {}

  async execute(command: DeleteTerminalScopeCommand): Promise<BlockGraphSnapshot> {
    const leaseState: { current: TerminalRunLifecycleLease | null } = { current: null }
    let disposalConfirmed = false
    let transactionCommitted = false

    try {
      const transaction = await executeDefaultGraphTransaction(
        this.graphRepository,
        command,
        async (graph) => {
          const blockIds = graph.resolveTerminalRemovalBlockIds(command.target)
          leaseState.current = await this.terminalRunLifecycle.acquireTerminalDeletion({
            blockIds,
            projectDirectory: command.projectDirectory,
            projectId: graph.projectId,
            workspaceId: command.workspaceId
          })
          await leaseState.current.hardDispose()
          disposalConfirmed = true
          graph.deleteBlocks(blockIds)
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
