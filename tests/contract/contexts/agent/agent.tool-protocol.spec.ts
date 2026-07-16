import {
  agentToolDefinitions,
  cleancodeMcpDeveloperInstructions,
  cleancodeMcpInstructions
} from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'

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

  it('disambiguates unqualified terminal requests as cleancode canvas work', () => {
    const priorityInstructions = cleancodeMcpInstructions.slice(0, 512)

    expect(priorityInstructions).toContain('inspect_graph')
    expect(priorityInstructions).toContain('终端')
    expect(priorityInstructions).toContain('整理终端')
    expect(priorityInstructions).toContain('终端布局')
    expect(priorityInstructions).toContain('终端组合')
    expect(priorityInstructions).toContain('终端源码')
    expect(priorityInstructions).toContain('Terminal component')
    expect(priorityInstructions).toContain('xterm')
    expect(priorityInstructions).toContain('PTY')
  })

  it('requires enabled Codex sessions to complete startup terminal groups through canvas tools', () => {
    expect(cleancodeMcpDeveloperInstructions).toContain('启动项目的终端组合')
    expect(cleancodeMcpDeveloperInstructions).toContain('inspect_graph')
    expect(cleancodeMcpDeveloperInstructions).toContain('create_block')
    expect(cleancodeMcpDeveloperInstructions).toContain('create_terminal_group')
    expect(cleancodeMcpDeveloperInstructions).toContain('shell processes')
    expect(cleancodeMcpDeveloperInstructions).toMatch(/do not claim/i)
    expect(cleancodeMcpDeveloperInstructions).toContain('source-code implementation')
  })

  it('describes Codex MCP pre-approval without weakening other permission boundaries', () => {
    expect(cleancodeMcpInstructions).toContain('pre-approved at the Codex MCP layer')
    expect(cleancodeMcpInstructions).toContain('global Codex sandbox or approval policy')
    expect(cleancodeMcpInstructions).toContain('other MCP servers')
    expect(cleancodeMcpInstructions).toContain(
      'Deletion tools still require independent CleanCode UI approval'
    )
  })

  it('advertises accurate MCP safety annotations for every canvas tool', () => {
    expect(
      Object.fromEntries(agentToolDefinitions.map((tool) => [tool.name, tool.annotations] as const))
    ).toEqual({
      create_block: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      create_terminal_group: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      delete_block: {
        destructiveHint: true,
        openWorldHint: false,
        readOnlyHint: false
      },
      delete_terminal_group: {
        destructiveHint: true,
        openWorldHint: false,
        readOnlyHint: false
      },
      inspect_graph: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true
      },
      update_block: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      update_terminal_group: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      }
    })
  })
})
