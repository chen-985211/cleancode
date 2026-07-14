import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  buildTerminalWorkflowPlan,
  type TerminalWorkflowPlanScope,
  type TerminalWorkflowPlanSnapshot
} from '../../domain/services/TerminalWorkflowPlan'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface BuildTerminalWorkflowPlanQuery {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly scope: TerminalWorkflowPlanScope
}

export class BuildTerminalWorkflowPlanUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(query: BuildTerminalWorkflowPlanQuery): Promise<TerminalWorkflowPlanSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      query.projectDirectory,
      query.workspaceName
    )

    if (!graph) {
      throw createExpectedAppError('BLOCK_GRAPH_NOT_FOUND', 'Default block graph was not created.')
    }

    return buildTerminalWorkflowPlan(graph.toSnapshot(), query.scope)
  }
}
