import { AgentSessionService } from '../../contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionOperations } from '../../contexts/agent/application/use-cases/AgentToolApprovalCoordinator'
import type { AgentSessionRepository } from '../../contexts/agent/application/ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../../contexts/agent/application/ports/AgentProviderRegistryPort'
import type { AgentRuntimeScopeValidationPort } from '../../contexts/agent/application/ports/AgentRuntimeScopeValidationPort'
import type { AgentProviderPreferencesRepository } from '../../contexts/agent/application/ports/AgentProviderPreferencesRepository'
import type { AgentProviderAvailabilityService } from '../../contexts/agent/application/services/AgentProviderAvailabilityService'
import type { AgentActivityRegistry } from '../../contexts/agent/application/services/AgentActivityRegistry'
import type { AgentMessageMailbox } from '../../contexts/agent/application/services/AgentMessageMailbox'
import type { TerminalSessionService } from '../../contexts/run/application/use-cases/TerminalSessionService'
import { NodeAgentExecutionDirectoryAdapter } from '../../contexts/agent/infrastructure/filesystem/NodeAgentExecutionDirectoryAdapter'
import { CleancodeMcpHttpServer } from '../../contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import { RunAgentTerminalRuntimeAdapter } from '../../contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter'

export function createAgentSessionRuntime(input: {
  readonly terminalSessions: TerminalSessionService
  readonly tools: AgentToolExecutionOperations
  readonly repository: AgentSessionRepository
  readonly providers: AgentProviderRegistryPort
  readonly defaultProviderId: string
  readonly scopeValidation: AgentRuntimeScopeValidationPort
  readonly availability: AgentProviderAvailabilityService
  readonly preferences: AgentProviderPreferencesRepository
  readonly activity: AgentActivityRegistry
  readonly mailbox: AgentMessageMailbox
}): AgentSessionService {
  return new AgentSessionService(
    new RunAgentTerminalRuntimeAdapter(input.terminalSessions),
    new CleancodeMcpHttpServer(),
    input.tools,
    input.repository,
    input.providers,
    input.defaultProviderId,
    input.scopeValidation,
    input.availability,
    input.preferences,
    input.activity,
    input.mailbox,
    new NodeAgentExecutionDirectoryAdapter()
  )
}
