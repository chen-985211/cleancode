import { agentToolDefinitions } from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'
import { parseAgentToolInput } from '../../../../src/contexts/agent/application/dto/AgentToolInputValidation'

describe('Agent collaboration protocol', () => {
  it.each([
    'list_agents',
    'list_agent_providers',
    'create_agent',
    'send_agent_message',
    'wait_agent_message'
  ])('publishes %s with an output schema', (name) => {
    expect(agentToolDefinitions.find((tool) => tool.name === name)?.outputSchema.type).toBe(
      'object'
    )
  })

  it('uses authenticated identity and rejects spoofed senders or workspace selectors', () => {
    const input = {
      messageId: 'review',
      toAgentId: 'codex',
      text: 'Review commit abc',
      kind: 'task'
    }
    expect(parseAgentToolInput('send_agent_message', input)).toEqual(input)
    expect(() =>
      parseAgentToolInput('send_agent_message', { ...input, fromAgentId: 'claude' })
    ).toThrow()
    expect(() => parseAgentToolInput('list_agents', { workspaceId: 'other' })).toThrow()
  })

  it('requires a stable creation id and bounded wait', () => {
    expect(() =>
      parseAgentToolInput('create_agent', { providerId: 'codex', initialTask: 'Review' })
    ).toThrow()
    expect(
      parseAgentToolInput('create_agent', {
        agentId: 'reviewer',
        providerId: 'codex',
        initialTask: 'Review'
      })
    ).toMatchObject({ agentId: 'reviewer' })
    expect(() => parseAgentToolInput('wait_agent_message', { timeoutMs: 60_000 })).toThrow()
  })
})
