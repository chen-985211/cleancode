import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { buildTerminalLaunchPlan } from '../../domain/services/TerminalWorkflowPlan'
import type { TerminalLaunchPlanSnapshot } from '../dto/TerminalLaunchPlanSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface GetTerminalLaunchPlanQuery {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
}

export class GetTerminalLaunchPlanUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(query: GetTerminalLaunchPlanQuery): Promise<TerminalLaunchPlanSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      query.projectDirectory,
      query.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    return buildTerminalLaunchPlan(graph.toSnapshot(), query.blockId)
  }
}
