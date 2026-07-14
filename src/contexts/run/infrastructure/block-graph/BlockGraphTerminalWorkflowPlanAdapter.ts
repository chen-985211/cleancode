import type { BuildTerminalWorkflowPlanUseCase } from '../../../block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase'
import type { WorkflowRunPlanSnapshot } from '../../application/dto/WorkflowRunSnapshot'
import type {
  BuildTerminalWorkflowPlanQuery,
  TerminalWorkflowPlanPort
} from '../../application/ports/TerminalWorkflowPlanPort'

export class BlockGraphTerminalWorkflowPlanAdapter implements TerminalWorkflowPlanPort {
  constructor(private readonly buildWorkflowPlan: BuildTerminalWorkflowPlanUseCase) {}

  async buildPlan(query: BuildTerminalWorkflowPlanQuery): Promise<WorkflowRunPlanSnapshot> {
    return this.buildWorkflowPlan.execute(query)
  }
}
