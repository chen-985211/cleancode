import type { AgentActivityTerminalScope } from '../../contexts/agent/application/dto/AgentActivityProtocol'
import type { PrepareTerminalAgentActivityEnvironmentCommand } from '../../contexts/agent/infrastructure/terminal-activity/TerminalAgentActivityEnvironmentService'
import type {
  PreparedTerminalLaunchEnvironment,
  TerminalLaunchEnvironmentPreparationPort
} from '../../contexts/run/application/ports/TerminalLaunchEnvironmentPreparationPort'
import type { Logger } from '../logging/Logger'

interface TerminalAgentActivityEnvironmentPort {
  prepare(
    command: PrepareTerminalAgentActivityEnvironmentCommand
  ): Promise<PreparedTerminalLaunchEnvironment>
}

export class TerminalAgentActivityIntegrationAdapter implements TerminalLaunchEnvironmentPreparationPort {
  constructor(
    private readonly input: {
      readonly environment: TerminalAgentActivityEnvironmentPort
      readonly logger: Logger
    }
  ) {}

  async prepare(
    command: Parameters<TerminalLaunchEnvironmentPreparationPort['prepare']>[0]
  ): Promise<PreparedTerminalLaunchEnvironment> {
    try {
      return await this.input.environment.prepare({
        environment: command.environment,
        launchCommand: command.launchCommand,
        shell: command.shell,
        terminal: toAgentTerminalScope(command.scope)
      })
    } catch (error) {
      try {
        this.input.logger.warn({
          error: { message: error instanceof Error ? error.message : String(error) },
          operation: 'prepareTerminalAgentActivity',
          outcome: 'failure',
          scope: 'agent.terminal-activity'
        })
      } catch {
        // Optional telemetry must remain fail-open even when diagnostics are unavailable.
      }
      return {
        environment: command.environment,
        launchCommand: command.launchCommand,
        shell: command.shell
      }
    }
  }
}

function toAgentTerminalScope(
  scope: Parameters<TerminalLaunchEnvironmentPreparationPort['prepare']>[0]['scope']
): AgentActivityTerminalScope {
  return {
    ...scope,
    owner: scope.owner ? { ...scope.owner } : undefined
  }
}
