import {
  agentToolDefinitions,
  cleancodeMcpDeveloperInstructions,
  cleancodeMcpInstructions
} from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'
import type { AgentToolJsonSchema } from '../../../../src/contexts/agent/application/dto/AgentToolJsonSchema'

describe('agent tool protocol', () => {
  it('exposes the complete first-phase cleancode workflow authoring tool catalog', () => {
    expect(agentToolDefinitions.map((tool) => tool.name)).toEqual([
      'inspect_graph',
      'create_block',
      'update_block',
      'delete_block',
      'create_terminal_group',
      'update_terminal_group',
      'delete_terminal_group',
      'update_terminal_execution_config',
      'connect_terminal_blocks',
      'disconnect_terminal_blocks',
      'inspect_terminal_workflow_plan'
    ])
    expect(
      agentToolDefinitions.filter((tool) => tool.requiresApproval).map((tool) => tool.name)
    ).toEqual(['delete_block', 'delete_terminal_group', 'disconnect_terminal_blocks'])
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

  it('declares strict discriminated workflow authoring input schemas', () => {
    const updateExecutionConfig = requireTool('update_terminal_execution_config')
    const connectTerminals = requireTool('connect_terminal_blocks')
    const disconnectTerminals = requireTool('disconnect_terminal_blocks')
    const inspectPlan = requireTool('inspect_terminal_workflow_plan')

    expect(updateExecutionConfig.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['blockId', 'executionConfig'],
      type: 'object'
    })
    expect(readSchemaProperty(updateExecutionConfig.inputSchema, 'executionConfig')).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({
          additionalProperties: false,
          required: ['mode', 'successExitCodes', 'timeoutMs']
        }),
        expect.objectContaining({
          additionalProperties: false,
          required: ['mode', 'readiness', 'readinessTimeoutMs']
        })
      ])
    })
    expect(connectTerminals.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['sourceBlockId', 'targetBlockId']
    })
    expect(disconnectTerminals.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['connectionId']
    })
    expect(readSchemaProperty(inspectPlan.inputSchema, 'scope')).toMatchObject({
      oneOf: [
        expect.objectContaining({ additionalProperties: false, required: ['type'] }),
        expect.objectContaining({
          additionalProperties: false,
          required: ['type', 'blockId']
        })
      ]
    })
  })

  it('declares an output schema for every structured tool result', () => {
    for (const tool of agentToolDefinitions) {
      expect(tool.outputSchema).toMatchObject({
        type: 'object',
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            additionalProperties: false,
            required: expect.arrayContaining(['status', 'toolCallId'])
          }),
          expect.objectContaining({
            additionalProperties: false,
            required: ['status', 'toolCallId', 'error']
          })
        ])
      })
    }

    expect(requireTool('inspect_graph').outputSchema).toEqual(
      expect.objectContaining({ oneOf: expect.arrayContaining([completedGraphResultSchema]) })
    )
    expect(requireTool('inspect_terminal_workflow_plan').outputSchema).toEqual(
      expect.objectContaining({ oneOf: expect.arrayContaining([completedPlanResultSchema]) })
    )
    expect(requireTool('disconnect_terminal_blocks').outputSchema).toEqual(
      expect.objectContaining({ oneOf: expect.arrayContaining([canceledResultSchema]) })
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
    expect(cleancodeMcpDeveloperInstructions).toContain('update_terminal_execution_config')
    expect(cleancodeMcpDeveloperInstructions).toContain('connect_terminal_blocks')
    expect(cleancodeMcpDeveloperInstructions).toContain('inspect_terminal_workflow_plan')
    expect(cleancodeMcpDeveloperInstructions).toContain('shell processes')
    expect(cleancodeMcpDeveloperInstructions).toMatch(/do not claim/i)
    expect(cleancodeMcpDeveloperInstructions).toContain('cannot start it')
    expect(cleancodeMcpDeveloperInstructions).toContain('source-code implementation')
    expect(cleancodeMcpInstructions).toContain('not workflow nodes')
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
      disconnect_terminal_blocks: {
        destructiveHint: true,
        openWorldHint: false,
        readOnlyHint: false
      },
      inspect_graph: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true
      },
      inspect_terminal_workflow_plan: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: true
      },
      connect_terminal_blocks: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      update_block: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      update_terminal_execution_config: {
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

const completedGraphResultSchema = expect.objectContaining({
  properties: expect.objectContaining({
    graph: expect.objectContaining({ type: 'object' }),
    graphChanged: expect.objectContaining({ const: expect.any(Boolean) }),
    output: expect.objectContaining({
      properties: expect.objectContaining({ type: { const: 'block_graph' } })
    }),
    status: { const: 'completed' }
  }),
  required: ['status', 'toolCallId', 'graphChanged', 'graph', 'output']
})

const completedPlanResultSchema = expect.objectContaining({
  properties: expect.objectContaining({
    graphChanged: { const: false },
    output: expect.objectContaining({
      properties: expect.objectContaining({
        plan: expect.objectContaining({ type: 'object' }),
        type: { const: 'terminal_workflow_plan' }
      })
    }),
    status: { const: 'completed' }
  }),
  required: ['status', 'toolCallId', 'graphChanged', 'output']
})

const canceledResultSchema = expect.objectContaining({
  properties: expect.objectContaining({ status: { const: 'canceled' } }),
  required: ['status', 'toolCallId', 'output']
})

function requireTool(name: (typeof agentToolDefinitions)[number]['name']) {
  const tool = agentToolDefinitions.find((candidate) => candidate.name === name)

  if (!tool) throw new Error(`Expected Agent tool definition: ${name}`)
  return tool
}

function readSchemaProperty(schema: AgentToolJsonSchema, propertyName: string): unknown {
  const properties = schema.properties

  if (!properties || typeof properties !== 'object') {
    throw new Error(`Expected object schema property: ${propertyName}`)
  }

  return properties[propertyName]
}
