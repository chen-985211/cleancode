import type { BuildTerminalWorkflowPlanUseCase } from '../../../block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase'
import type { WorkflowRunPlanSnapshot } from '../../application/dto/WorkflowRunSnapshot'
import type {
  BuildTerminalWorkflowPlanQuery,
  TerminalWorkflowPlanPort
} from '../../application/ports/TerminalWorkflowPlanPort'
import { validateServicePortIntent } from '../../domain/value-objects/ServicePortIntent'

export class BlockGraphTerminalWorkflowPlanAdapter implements TerminalWorkflowPlanPort {
  constructor(private readonly buildWorkflowPlan: BuildTerminalWorkflowPlanUseCase) {}

  async buildPlan(query: BuildTerminalWorkflowPlanQuery): Promise<WorkflowRunPlanSnapshot> {
    const source = await this.buildWorkflowPlan.execute(query)
    return Object.freeze({
      graphId: source.graphId,
      workspaceId: source.workspaceId,
      nodes: Object.freeze(
        source.nodes.map((node) =>
          Object.freeze({
            blockId: node.blockId,
            name: node.name,
            launchCommand: node.launchCommand,
            dependencyBlockIds: Object.freeze([...node.dependencyBlockIds]),
            executionConfig:
              node.executionConfig.mode === 'task'
                ? Object.freeze({
                    mode: 'task' as const,
                    successExitCodes: Object.freeze([...node.executionConfig.successExitCodes]),
                    timeoutMs: node.executionConfig.timeoutMs
                  })
                : Object.freeze({
                    mode: 'service' as const,
                    ...(node.executionConfig.port
                      ? { port: validateServicePortIntent(node.executionConfig.port) }
                      : {}),
                    readiness: Object.freeze({ ...node.executionConfig.readiness }),
                    readinessTimeoutMs: node.executionConfig.readinessTimeoutMs
                  })
          })
        )
      )
    }) satisfies WorkflowRunPlanSnapshot
  }
}
