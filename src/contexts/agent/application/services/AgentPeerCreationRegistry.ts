import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type {
  AgentPeerCreatedSnapshot,
  CreatePeerAgentInput
} from '../dto/AgentCollaborationProtocol'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

interface AgentIdentity {
  readonly agentId: string
  readonly projectId: string
  readonly workspaceId: string
}

interface CreationIntent {
  readonly creatorId: string
  readonly input: CreatePeerAgentInput
  admitted: boolean
  created: boolean
  launchStatus: AgentPeerCreatedSnapshot['launchStatus']
  pending?: Promise<AgentPeerCreatedSnapshot>
}

export class AgentPeerCreationRegistry {
  private readonly intents = new Map<string, CreationIntent>()

  constructor(private readonly repository: Pick<AgentSessionRepository, 'findAgent'>) {}

  async create(
    caller: AgentIdentity,
    input: CreatePeerAgentInput,
    createOnCanvas: () => Promise<void>
  ): Promise<AgentPeerCreatedSnapshot> {
    if (
      !input.agentId.trim() ||
      input.agentId.length > 96 ||
      !input.initialTask.trim() ||
      input.initialTask.length > 32_768
    ) {
      throw conflict('Creation id or task is empty or exceeds its limit.')
    }
    const key = identityKey({ ...caller, agentId: input.agentId })
    let intent = this.intents.get(key)
    if (
      intent &&
      (intent.creatorId !== caller.agentId ||
        intent.input.providerId !== input.providerId ||
        intent.input.initialTask !== input.initialTask)
    ) {
      throw conflict(
        'This Agent id belongs to another creation intent. Reuse the original parameters.'
      )
    }
    if (!intent) {
      if (this.intents.size >= 256)
        throw conflict('Peer creation limit reached for this application process.')
      intent = {
        creatorId: caller.agentId,
        input: { ...input },
        admitted: false,
        created: false,
        launchStatus: 'pending'
      }
      this.intents.set(key, intent)
    }
    if (intent.pending) return intent.pending
    if (intent.created) {
      await this.requireCreatedAgent(caller, input)
      return snapshot(intent)
    }
    const current = intent
    const pending = (async () => {
      if (!current.admitted) {
        if (await this.repository.findAgent(caller.projectId, caller.workspaceId, input.agentId)) {
          this.intents.delete(key)
          throw conflict(
            'This Agent already exists. Select it with list_agents and send a message.'
          )
        }
        current.admitted = true
      }
      await createOnCanvas()
      await this.requireCreatedAgent(caller, input)
      current.created = true
      return snapshot(current)
    })()
    current.pending = pending
    try {
      return await pending
    } finally {
      current.pending = undefined
    }
  }

  markStarted(identity: AgentIdentity): void {
    const intent = this.intents.get(identityKey(identity))
    if (intent?.admitted) intent.launchStatus = 'running'
  }

  markStopped(identity: AgentIdentity, status: 'failed' | 'stopped'): void {
    const intent = this.intents.get(identityKey(identity))
    if (intent?.admitted) intent.launchStatus = status
  }

  private async requireCreatedAgent(
    caller: AgentIdentity,
    input: CreatePeerAgentInput
  ): Promise<void> {
    const agent = await this.repository.findAgent(
      caller.projectId,
      caller.workspaceId,
      input.agentId
    )
    if (!agent || agent.providerId !== input.providerId) {
      throw conflict(
        'The created Agent no longer exists in this workspace. Discover current Agents before creating a new identity.'
      )
    }
  }
}

function identityKey(identity: AgentIdentity): string {
  return JSON.stringify([identity.projectId, identity.workspaceId, identity.agentId])
}

function snapshot(intent: CreationIntent): AgentPeerCreatedSnapshot {
  return {
    agentId: intent.input.agentId,
    initialMessageId: `initial:${intent.input.agentId}`,
    providerId: intent.input.providerId,
    launchStatus: intent.launchStatus
  }
}

function conflict(message: string) {
  return createExpectedAppError('AGENT_CREATION_CONFLICT', message)
}
