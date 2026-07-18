import type { GetTerminalLaunchPlanUseCase } from '../../../block-graph/application/use-cases/GetTerminalLaunchPlanUseCase'
import type {
  TerminalLaunchPlanPort,
  TerminalLaunchPlanSnapshot
} from '../../application/ports/TerminalLaunchPlanPort'
import { validateServicePortIntent } from '../../domain/value-objects/ServicePortIntent'

export class BlockGraphTerminalLaunchPlanAdapter implements TerminalLaunchPlanPort {
  constructor(private readonly getTerminalLaunchPlan: GetTerminalLaunchPlanUseCase) {}

  async getPlan(query: Parameters<TerminalLaunchPlanPort['getPlan']>[0]) {
    const source = await this.getTerminalLaunchPlan.execute(query)
    const executionConfig =
      source.executionConfig.mode === 'task'
        ? Object.freeze({
            mode: 'task' as const,
            successExitCodes: Object.freeze([...source.executionConfig.successExitCodes]),
            timeoutMs: source.executionConfig.timeoutMs
          })
        : Object.freeze({
            mode: 'service' as const,
            ...(source.executionConfig.port
              ? { port: validateServicePortIntent(source.executionConfig.port) }
              : {}),
            readiness: Object.freeze({ ...source.executionConfig.readiness }),
            readinessTimeoutMs: source.executionConfig.readinessTimeoutMs
          })

    return Object.freeze({
      blockId: source.blockId,
      launchCommand: source.launchCommand,
      executionConfig
    }) satisfies TerminalLaunchPlanSnapshot
  }
}
