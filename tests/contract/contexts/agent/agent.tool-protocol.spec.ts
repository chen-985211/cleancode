import {
  agentToolDefinitions,
  cleancodeMcpDeveloperInstructions,
  cleancodeMcpInstructions
} from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'
import { canvasExecutionSemanticInstructions } from '../../../../src/shared-kernel/domain/policies/CanvasExecutionSemantics'
import {
  findAgentToolJsonSchemaIssue,
  type AgentToolJsonSchema
} from '../../../../src/contexts/agent/application/dto/AgentToolJsonSchema'

describe('agent tool protocol', () => {
  it('exposes the complete first-phase cleancode workflow authoring tool catalog', () => {
    expect(agentToolDefinitions.map((tool) => tool.name)).toEqual([
      'inspect_graph',
      'create_block',
      'create_terminal_workflow',
      'update_block',
      'delete_block',
      'create_terminal_group',
      'move_terminal_workflow_to_group',
      'update_terminal_group',
      'delete_terminal_group',
      'update_terminal_execution_config',
      'connect_terminal_blocks',
      'disconnect_terminal_blocks',
      'inspect_terminal_workflow_plan',
      'arrange_terminal_layout'
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
    const createWorkflow = requireTool('create_terminal_workflow')
    const updateExecutionConfig = requireTool('update_terminal_execution_config')
    const connectTerminals = requireTool('connect_terminal_blocks')
    const disconnectTerminals = requireTool('disconnect_terminal_blocks')
    const moveWorkflowToGroup = requireTool('move_terminal_workflow_to_group')
    const inspectPlan = requireTool('inspect_terminal_workflow_plan')

    expect(createWorkflow.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['terminals', 'connections'],
      type: 'object'
    })
    expect(readSchemaProperty(createWorkflow.inputSchema, 'terminals')).toMatchObject({
      minItems: 1,
      type: 'array'
    })
    const terminalGroupSchema = readSchemaProperty(
      createWorkflow.inputSchema,
      'terminalGroup'
    ) as AgentToolJsonSchema
    expect(readSchemaProperty(terminalGroupSchema, 'memberRefs')).toMatchObject({
      minItems: 1,
      type: 'array',
      uniqueItems: true
    })

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
          required: ['mode', 'port', 'readiness', 'readinessTimeoutMs']
        })
      ])
    })
    const executionConfigSchema = readSchemaProperty(
      updateExecutionConfig.inputSchema,
      'executionConfig'
    ) as AgentToolJsonSchema
    const serviceWithPort = executionConfigSchema.oneOf?.find(
      (variant) => variant.required?.includes('port') && variant.required.includes('readiness')
    )
    const portIntentSchema = serviceWithPort
      ? (readSchemaProperty(serviceWithPort, 'port') as AgentToolJsonSchema)
      : undefined

    expect(executionConfigSchema.oneOf).toHaveLength(4)
    expect(portIntentSchema?.oneOf).toHaveLength(3)
    expect(portIntentSchema?.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          additionalProperties: false,
          required: ['protocol', 'policy', 'binding']
        })
      ])
    )
    expect(connectTerminals.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['sourceBlockId', 'targetBlockId']
    })
    expect(disconnectTerminals.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['connectionId']
    })
    expect(moveWorkflowToGroup.inputSchema.oneOf).toEqual([
      expect.objectContaining({
        additionalProperties: false,
        required: ['blockId', 'targetTerminalGroupId']
      }),
      expect.objectContaining({
        additionalProperties: false,
        required: ['blockId', 'targetTerminalGroupId', 'position']
      })
    ])
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

  it('teaches agents how to choose and inject managed service ports for parallel worktrees', () => {
    const updateExecutionConfig = requireTool('update_terminal_execution_config')
    const executionConfigSchema = readSchemaProperty(
      updateExecutionConfig.inputSchema,
      'executionConfig'
    ) as AgentToolJsonSchema
    const serviceWithPort = executionConfigSchema.oneOf?.find(
      (variant) => variant.required?.includes('port') && variant.required.includes('readiness')
    )
    const portIntentSchema = serviceWithPort
      ? (readSchemaProperty(serviceWithPort, 'port') as AgentToolJsonSchema)
      : undefined
    const policyOrder = portIntentSchema?.oneOf?.map(readPortPolicyType)
    const preferredPolicy = portIntentSchema?.oneOf?.find(
      (variant) => readPortPolicyType(variant) === 'preferred'
    )
    const fixedPolicy = portIntentSchema?.oneOf?.find(
      (variant) => readPortPolicyType(variant) === 'fixed'
    )
    const preferredBindings = preferredPolicy
      ? (readSchemaProperty(preferredPolicy, 'binding') as AgentToolJsonSchema)
      : undefined
    const fixedBindings = fixedPolicy
      ? (readSchemaProperty(fixedPolicy, 'binding') as AgentToolJsonSchema)
      : undefined
    const examples = portIntentSchema?.examples ?? []

    expect(updateExecutionConfig.description).toContain('preferred')
    expect(updateExecutionConfig.description).toContain('fixed')
    expect(portIntentSchema).toMatchObject({
      description: expect.stringContaining('parallel')
    })
    expect(examples.map(readPortExampleDiscriminators)).toEqual(
      expect.arrayContaining([
        ['preferred', 'argument'],
        ['auto', 'environment']
      ])
    )
    for (const example of examples) {
      expect(
        findAgentToolJsonSchemaIssue(portIntentSchema as AgentToolJsonSchema, example)
      ).toBeNull()
    }
    expect(policyOrder).toEqual(['preferred', 'auto', 'fixed'])
    for (const policyVariant of portIntentSchema?.oneOf ?? []) {
      expect(policyVariant.description).toEqual(expect.stringMatching(/\S/))
      const bindings = readSchemaProperty(policyVariant, 'binding') as AgentToolJsonSchema
      for (const bindingVariant of bindings.oneOf ?? []) {
        expect(bindingVariant.description).toEqual(expect.stringMatching(/\S/))
      }
    }
    expect(preferredPolicy?.description).toContain('recommended default')
    expect(fixedPolicy?.description).toContain('conflict')
    expect(
      preferredBindings?.oneOf?.find((binding) => readBindingType(binding) === 'environment')
        ?.description
    ).toContain('already reads')
    expect(
      preferredBindings?.oneOf?.find((binding) => readBindingType(binding) === 'argument')
        ?.description
    ).toContain('{port}')
    expect(
      fixedBindings?.oneOf?.find((binding) => readBindingType(binding) === 'none')?.description
    ).toContain('does not inject')

    for (const instructions of [cleancodeMcpDeveloperInstructions, cleancodeMcpInstructions]) {
      expect(instructions).toContain('preferred')
      expect(instructions).toContain('auto')
      expect(instructions).toContain('fixed')
      expect(instructions).toContain('{port}')
      expect(instructions).toContain('worktree')
      expect(instructions).toContain('actual allocated port')
    }
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
    const arrangeLayout = agentToolDefinitions.find(
      (tool) => tool.name === 'arrange_terminal_layout'
    )

    expect(createBlock).toEqual(
      expect.objectContaining({
        description: expect.stringContaining('cleancode canvas'),
        inputSchema: expect.objectContaining({
          additionalProperties: false,
          required: ['type', 'name']
        })
      })
    )
    expect(createBlock?.description).toContain('Omit position')
    expect(createBlock?.description).toContain('exact coordinates')
    expect(createBlock?.description).toContain('existing canvas content')
    expect(createBlock?.description).not.toContain('active Agent')
    expect(arrangeLayout).toEqual(
      expect.objectContaining({
        annotations: {
          destructiveHint: false,
          openWorldHint: false,
          readOnlyHint: false
        },
        inputSchema: expect.objectContaining({
          additionalProperties: false,
          properties: expect.objectContaining({
            blockIds: expect.objectContaining({ minItems: 1, type: 'array', uniqueItems: true })
          }),
          required: ['blockIds'],
          type: 'object'
        }),
        requiresApproval: false
      })
    )
    expect(arrangeLayout?.outputSchema).toEqual(
      expect.objectContaining({
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              graphChanged: { type: 'boolean' },
              output: expect.objectContaining({
                properties: expect.objectContaining({
                  arrangedBlockIds: expect.objectContaining({ type: 'array' }),
                  arrangedTerminalGroupIds: expect.objectContaining({ type: 'array' })
                }),
                required: ['type', 'arrangedBlockIds', 'arrangedTerminalGroupIds']
              })
            })
          })
        ])
      })
    )
    expect(arrangeLayout?.description).toContain('existing canvas content')
    expect(arrangeLayout?.description).not.toContain('active Agent')
    expect(createGroup).toEqual(
      expect.objectContaining({
        description: expect.stringContaining('persistent terminal-group space'),
        inputSchema: expect.objectContaining({
          additionalProperties: false,
          required: ['name']
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
    expect(cleancodeMcpDeveloperInstructions).toContain('create_terminal_workflow')
    expect(cleancodeMcpDeveloperInstructions).toContain('create_terminal_group')
    expect(cleancodeMcpDeveloperInstructions).toContain('update_terminal_execution_config')
    expect(cleancodeMcpDeveloperInstructions).toContain('connect_terminal_blocks')
    expect(cleancodeMcpDeveloperInstructions).toContain('arrange_terminal_layout')
    expect(cleancodeMcpDeveloperInstructions).toContain('inspect_terminal_workflow_plan')
    expect(cleancodeMcpDeveloperInstructions).toContain('shell processes')
    expect(cleancodeMcpDeveloperInstructions).toMatch(/do not claim/i)
    expect(cleancodeMcpDeveloperInstructions).toContain('cannot start it')
    expect(cleancodeMcpDeveloperInstructions).toContain('source-code implementation')
    expect(cleancodeMcpDeveloperInstructions).toContain('existing canvas content')
    expect(cleancodeMcpDeveloperInstructions).not.toContain('around the active Agent')
    expect(cleancodeMcpInstructions).toContain('not workflow nodes')
  })

  it('routes configured terminals from one request through one atomic workflow call', () => {
    for (const instructions of [cleancodeMcpDeveloperInstructions, cleancodeMcpInstructions]) {
      expect(instructions).toContain('one or more new configured terminals requested together')
      expect(instructions).toContain('Use create_block only for one empty visual terminal')
    }

    expect(requireTool('create_block').description).toContain('one empty visual terminal')
    expect(requireTool('create_terminal_workflow').description).toContain(
      'one or more new CleanCode terminals requested together'
    )
  })

  it('projects the canonical canvas execution semantics into MCP and Provider instructions', () => {
    for (const instructions of [cleancodeMcpDeveloperInstructions, cleancodeMcpInstructions]) {
      expect(instructions).toContain(canvasExecutionSemanticInstructions)
      expect(instructions).toContain('persistent container and connection scope')
      expect(instructions).toContain('may remain empty')
      expect(instructions).toContain('same combination')
    }

    const createGroup = requireTool('create_terminal_group')
    const moveWorkflowToGroup = requireTool('move_terminal_workflow_to_group')
    expect(createGroup.description).toContain('may start empty')
    expect(createGroup.description).toContain('connection scope')
    expect(createGroup.inputSchema.required).toEqual(['name'])
    expect(readSchemaProperty(createGroup.inputSchema, 'memberBlockIds')).toMatchObject({
      type: 'array',
      uniqueItems: true
    })
    expect(moveWorkflowToGroup.description).toContain('complete workflow')
    expect(moveWorkflowToGroup.description).toContain('group stays anchored')
    expect(cleancodeMcpInstructions).toContain('move_terminal_workflow_to_group')
  })

  it('describes Codex MCP pre-approval without weakening other permission boundaries', () => {
    expect(cleancodeMcpInstructions).toContain('Provider launch integration')
    expect(cleancodeMcpInstructions).toContain('Provider sandbox or approval policy')
    expect(cleancodeMcpInstructions).not.toMatch(/\b(?:Codex|Claude|OpenCode)\b/)
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
      create_terminal_workflow: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      create_terminal_group: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      move_terminal_workflow_to_group: {
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
      arrange_terminal_layout: {
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

function readPortPolicyType(schema: AgentToolJsonSchema): unknown {
  const policy = readSchemaProperty(schema, 'policy') as AgentToolJsonSchema
  const type = readSchemaProperty(policy, 'type') as AgentToolJsonSchema
  return type.const
}

function readBindingType(schema: AgentToolJsonSchema): unknown {
  return (readSchemaProperty(schema, 'type') as AgentToolJsonSchema).const
}

function readPortExampleDiscriminators(example: unknown): readonly unknown[] {
  if (!isRecord(example) || !isRecord(example.policy) || !isRecord(example.binding)) return []
  return [example.policy.type, example.binding.type]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
