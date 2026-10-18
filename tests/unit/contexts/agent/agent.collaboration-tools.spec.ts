import { AgentCollaborationTools } from '../../../../src/contexts/agent/application/services/AgentCollaborationTools'
import { AgentMessageMailbox } from '../../../../src/contexts/agent/application/services/AgentMessageMailbox'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import type { ExecuteAgentToolCommand } from '../../../../src/contexts/agent/application/dto/AgentToolInvocation'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import {
  AgentProviderPreferences,
  type AgentProviderPreferencesSnapshot
} from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { RecordingAgentProviderRegistry } from '../../../fixtures/agentTerminalRuntime'

const caller = {
  agentId: 'author',
  projectId: 'project',
  workspaceId: 'workspace',
  sessionId: 'original-launch'
}
const input = { agentId: 'reviewer', providerId: 'codex', initialTask: 'Review this change.' }
const recipient = { ...caller, agentId: input.agentId, sessionId: 'new-launch' }
const categoryCases = [
  { canvas: true, collaboration: true },
  { canvas: false, collaboration: true },
  { canvas: true, collaboration: false },
  { canvas: false, collaboration: false }
]

describe('collaborating Agent creation admission', () => {
  describe.each([true, false])('new Agent MCP default: %s', (defaultCleancodeMcpEnabled) => {
    it.each(categoryCases)(
      'only creates and queues an initial task when the recipient can receive it: %j',
      async (mcpToolCategories) => {
        const fixture = createFixture({ defaultCleancodeMcpEnabled, mcpToolCategories })
        const command = fixture.createCommand()
        if (defaultCleancodeMcpEnabled && mcpToolCategories.collaboration) {
          await expect(fixture.tools.execute(command)).resolves.toMatchObject({
            type: 'agent_created',
            agentId: input.agentId,
            initialMessageId: 'initial:reviewer'
          })
          expect(fixture.create).toHaveBeenCalledExactlyOnceWith(input)
          await expect(fixture.mailbox.wait(recipient, {})).resolves.toMatchObject({
            status: 'message',
            message: {
              messageId: 'initial:reviewer',
              fromAgentId: caller.agentId,
              toAgentId: input.agentId,
              kind: 'task',
              text: input.initialTask
            }
          })
        } else {
          await expect(fixture.tools.execute(command)).rejects.toMatchObject({
            code: 'AGENT_TOOL_UNAVAILABLE'
          })
          expect(fixture.create).not.toHaveBeenCalled()
          await expect(fixture.mailbox.wait(recipient, {})).resolves.toEqual({ status: 'empty' })
        }
      }
    )
  })

  it('rejects peer creation from an old launch after collaboration is disabled, then permits retry when re-enabled', async () => {
    const fixture = createFixture()
    fixture.setPreferences({
      mcpToolCategories: { canvas: true, collaboration: false }
    })

    await expect(
      fixture.tools.execute({ ...fixture.createCommand(), input: {}, toolName: 'list_agents' })
    ).resolves.toMatchObject({ type: 'agents', selfAgentId: caller.agentId })
    await expect(fixture.tools.execute(fixture.createCommand())).rejects.toMatchObject({
      code: 'AGENT_TOOL_UNAVAILABLE'
    })
    expect(fixture.create).not.toHaveBeenCalled()
    await expect(fixture.mailbox.wait(recipient, {})).resolves.toEqual({ status: 'empty' })

    fixture.setPreferences({
      mcpToolCategories: { canvas: false, collaboration: true }
    })
    await expect(fixture.tools.execute(fixture.createCommand())).resolves.toMatchObject({
      type: 'agent_created',
      agentId: input.agentId
    })
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith(input)
    await expect(fixture.mailbox.wait(recipient, {})).resolves.toMatchObject({
      status: 'message',
      message: { messageId: 'initial:reviewer', text: input.initialTask }
    })
    await expect(
      fixture.mailbox.wait(recipient, { acknowledgeMessageId: 'initial:reviewer' })
    ).resolves.toEqual({ status: 'empty' })
  })
})

function createFixture(patch: Partial<AgentProviderPreferencesSnapshot> = {}) {
  let preferences = { ...AgentProviderPreferences.create().toSnapshot(), ...patch }
  const author = AgentSession.create({
    ...caller,
    providerId: 'codex',
    name: 'Author',
    cleancodeMcpEnabled: true,
    layout: { position: { x: 0, y: 0 }, size: { width: 720, height: 460 } }
  })
  const repository: AgentSessionRepository = {
    find: async () => author,
    findAgent: async () => author,
    findWorkspace: async () => [author],
    save: async () => undefined,
    delete: async () => undefined,
    deleteAgent: async () => undefined,
    deleteProject: async () => undefined
  }
  const providers = new RecordingAgentProviderRegistry()
  const mailbox = new AgentMessageMailbox()
  const tools = new AgentCollaborationTools(
    repository,
    providers,
    new AgentProviderAvailabilityService(providers),
    { load: async () => preferences, save: async () => undefined },
    mailbox
  )
  const create = vi.fn(async () => ({
    agentId: input.agentId,
    providerId: input.providerId,
    initialMessageId: 'initial:reviewer',
    launchStatus: 'pending' as const
  }))
  return {
    tools,
    mailbox,
    create,
    createCommand: (): ExecuteAgentToolCommand => ({
      ...caller,
      projectDirectory: '/project',
      toolCallId: 'create-peer',
      toolName: 'create_agent',
      input,
      peerCreation: { create }
    }),
    setPreferences: (next: Partial<typeof preferences>) => {
      preferences = { ...preferences, ...next }
    }
  }
}
