import { agentToolDefinitions } from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'
import { createAgentMcpConfiguration } from '../../../../src/contexts/agent/application/dto/AgentMcpConfiguration'
import { CleancodeAgentJsonRpcToolBridge } from '../../../../src/contexts/agent/infrastructure/rpc/CleancodeAgentJsonRpcToolBridge'

const collaborationNames = [
  'list_agents',
  'list_agent_providers',
  'create_agent',
  'send_agent_message',
  'wait_agent_message'
]

describe('CleanCode MCP category configuration', () => {
  it.each([
    { canvas: true, collaboration: true },
    { canvas: false, collaboration: true },
    { canvas: true, collaboration: false },
    { canvas: false, collaboration: false }
  ])(
    'uses the same category snapshot for discovery, instructions and invocation: %j',
    async (toolCategories) => {
      const configuration = createAgentMcpConfiguration(toolCategories)
      const executeMcpTool = vi.fn()
      const bridge = new CleancodeAgentJsonRpcToolBridge({
        executeMcpTool,
        projectDirectory: '/project',
        sessionId: 'session',
        workspaceId: 'workspace',
        configuration
      })
      const expected = agentToolDefinitions.filter((tool) =>
        collaborationNames.includes(tool.name)
          ? toolCategories.collaboration
          : toolCategories.canvas
      )
      expect(configuration.tools.map((tool) => tool.name)).toEqual(
        expected.map((tool) => tool.name)
      )
      expect(await bridge.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toMatchObject({
        result: { tools: expected.map((tool) => expect.objectContaining({ name: tool.name })) }
      })
      const initialized = await bridge.handle({ jsonrpc: '2.0', id: 2, method: 'initialize' })
      expect(initialized).toMatchObject({ result: { instructions: configuration.instructions } })
      for (const instructions of [
        configuration.instructions,
        configuration.developerInstructions
      ]) {
        expect(instructions.includes('inspect_graph')).toBe(toolCategories.canvas)
        expect(instructions.includes('wait_agent_message')).toBe(toolCategories.collaboration)
      }
      for (const tool of agentToolDefinitions.filter((tool) => !expected.includes(tool))) {
        expect(
          await bridge.handle({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: tool.name }
          })
        ).toMatchObject({ error: { code: -32602 } })
      }
      expect(executeMcpTool).not.toHaveBeenCalled()
      executeMcpTool.mockRejectedValue(new Error('execution boundary reached'))
      for (const tool of expected) {
        await bridge.handle({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: tool.name }
        })
      }
      expect(executeMcpTool.mock.calls.map(([command]) => command.toolName)).toEqual(
        expected.map((tool) => tool.name)
      )
    }
  )
})
