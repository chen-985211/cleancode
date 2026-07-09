import { agentToolDefinitions } from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'

describe('agent tool protocol', () => {
  it('exposes only first-phase cleancode block graph tools', () => {
    expect(agentToolDefinitions.map((tool) => tool.name)).toEqual([
      'inspect_graph',
      'create_block',
      'update_block',
      'delete_block',
      'create_terminal_group',
      'update_terminal_group',
      'delete_terminal_group'
    ])
    expect(
      agentToolDefinitions.filter((tool) => tool.requiresApproval).map((tool) => tool.name)
    ).toEqual(['delete_block', 'delete_terminal_group'])
    expect(agentToolDefinitions.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining([
        'list_project_files',
        'read_project_file',
        'run_shell_command',
        'start_terminal',
        'write_terminal',
        'read_terminal_output',
        'stop_terminal'
      ])
    )
  })

  it('describes canvas tools with strict schemas for Codex tool planning', () => {
    const createBlock = agentToolDefinitions.find((tool) => tool.name === 'create_block')
    const createGroup = agentToolDefinitions.find((tool) => tool.name === 'create_terminal_group')

    expect(createBlock).toEqual(
      expect.objectContaining({
        description: expect.stringContaining('cleancode canvas'),
        inputSchema: expect.objectContaining({
          additionalProperties: false,
          required: ['type', 'name', 'position']
        })
      })
    )
    expect(createGroup).toEqual(
      expect.objectContaining({
        description: expect.stringContaining('existing terminal blocks'),
        inputSchema: expect.objectContaining({
          additionalProperties: false,
          required: ['name', 'memberBlockIds']
        })
      })
    )
  })
})
