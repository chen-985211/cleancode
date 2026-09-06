import type {
  AgentCollaborationOutput,
  CreatePeerAgentInput
} from '../dto/AgentCollaborationProtocol'
import type { AgentMessageInput } from '../../domain/entities/AgentMessageLog'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import type { AgentProviderAvailabilityService } from './AgentProviderAvailabilityService'
import type { AgentProviderPreferencesRepository } from '../ports/AgentProviderPreferencesRepository'
import { AgentMessageMailbox, type WaitAgentMessageInput } from './AgentMessageMailbox'
import type { ExecuteAgentToolCommand } from '../dto/AgentToolInvocation'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export class AgentCollaborationTools {
  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly providers: AgentProviderRegistryPort,
    private readonly availability: AgentProviderAvailabilityService,
    private readonly preferences: AgentProviderPreferencesRepository,
    private readonly mailbox = new AgentMessageMailbox()
  ) {}

  async execute(command: ExecuteAgentToolCommand): Promise<AgentCollaborationOutput> {
    const agents =
      (await this.repository.findWorkspace(command.projectId, command.workspaceId)) ?? []
    const self = agents.find((agent) => agent.id === command.agentId)
    if (!self?.cleancodeMcpEnabled)
      throw unavailable('The calling Agent is no longer enabled in this workspace.')

    switch (command.toolName) {
      case 'list_agents':
        return {
          type: 'agents',
          selfAgentId: self.id,
          agents: agents.map((agent) => ({
            agentId: agent.id,
            name: agent.name,
            providerId: agent.providerId,
            mcpEnabled: agent.cleancodeMcpEnabled,
            deliveryStatus: this.mailbox.deliveryStatus({ ...command, agentId: agent.id }),
            waitingForMessage: this.mailbox.isWaiting({ ...command, agentId: agent.id })
          }))
        }
      case 'list_agent_providers': {
        const preferences = await this.preferences.load()
        const providers = await this.availability.discoverCreatableProviders({ refresh: true })
        return {
          type: 'agent_providers',
          providers: providers
            .filter(
              ({ descriptor }) =>
                descriptor.capabilities.cleancodeMcp &&
                !preferences.disabledProviderIds.includes(descriptor.id)
            )
            .map(({ descriptor }) => ({ providerId: descriptor.id, name: descriptor.displayName }))
        }
      }
      case 'create_agent': {
        const input = command.input as CreatePeerAgentInput
        const provider = this.providers.require(input.providerId)
        if (!provider.descriptor.capabilities.cleancodeMcp || !command.peerCreation) {
          throw unavailable('Native peer creation is unavailable for this Provider or canvas.')
        }
        if (!(await this.preferences.load()).defaultCleancodeMcpEnabled) {
          throw unavailable(
            'Enable CleanCode MCP for new Agents before creating a collaborating peer.'
          )
        }
        const created = await command.peerCreation.create(input)
        this.mailbox.send(command, {
          messageId: created.initialMessageId,
          toAgentId: created.agentId,
          kind: 'task',
          text: input.initialTask
        })
        return {
          type: 'agent_created',
          ...created,
          deliveryStatus: this.mailbox.deliveryStatus({ ...command, agentId: created.agentId })
        }
      }
      case 'send_agent_message': {
        const input = command.input as AgentMessageInput
        const recipient = agents.find((agent) => agent.id === input.toAgentId)
        if (!recipient?.cleancodeMcpEnabled)
          throw unavailable('The recipient does not exist here or has CleanCode MCP disabled.')
        return {
          type: 'agent_message_sent',
          message: this.mailbox.send(command, input),
          deliveryStatus: this.mailbox.deliveryStatus({ ...command, agentId: input.toAgentId })
        }
      }
      case 'wait_agent_message': {
        const waiting = this.mailbox.wait(
          command,
          command.input as WaitAgentMessageInput,
          command.signal
        )
        return { type: 'agent_message_wait', result: await waiting }
      }
      default:
        throw unavailable('Unknown collaboration tool.')
    }
  }
}

function unavailable(message: string) {
  return createExpectedAppError('AGENT_TOOL_UNAVAILABLE', message)
}
