import { objectSchema, type AgentToolJsonSchema } from './AgentToolJsonSchema'

const stringSchema: AgentToolJsonSchema = { type: 'string' }
const finiteNumberSchema: AgentToolJsonSchema = { type: 'number' }
const positiveIntegerSchema: AgentToolJsonSchema = { minimum: 1, type: 'integer' }

export function positionSchema(): AgentToolJsonSchema {
  return objectSchema({ x: finiteNumberSchema, y: finiteNumberSchema }, ['x', 'y'])
}

export function terminalBlockSizeSchema(): AgentToolJsonSchema {
  return objectSchema({ height: finiteNumberSchema, width: finiteNumberSchema }, [
    'width',
    'height'
  ])
}

export function terminalExecutionConfigSchema(): AgentToolJsonSchema {
  return {
    description:
      'Complete task or service execution configuration. Local HTTP, HTTPS, or TCP development services should declare a managed port whenever their existing launch path can receive the runtime port.',
    oneOf: [
      objectSchema(
        {
          mode: { const: 'task' },
          successExitCodes: {
            items: { maximum: 255, minimum: 0, type: 'integer' },
            minItems: 1,
            type: 'array',
            uniqueItems: true
          },
          timeoutMs: { oneOf: [positiveIntegerSchema, { type: 'null' }] }
        },
        ['mode', 'successExitCodes', 'timeoutMs']
      ),
      objectSchema(
        {
          mode: { const: 'service' },
          readiness: outputReadinessSchema(),
          readinessTimeoutMs: positiveIntegerSchema
        },
        ['mode', 'readiness', 'readinessTimeoutMs']
      ),
      serviceExecutionConfigWithPortSchema(outputReadinessSchema()),
      serviceExecutionConfigWithPortSchema(objectSchema({ type: { const: 'tcp' } }, ['type']))
    ]
  }
}

function serviceExecutionConfigWithPortSchema(readiness: AgentToolJsonSchema): AgentToolJsonSchema {
  return objectSchema(
    {
      mode: { const: 'service' },
      port: terminalServicePortIntentSchema(),
      readiness,
      readinessTimeoutMs: positiveIntegerSchema
    },
    ['mode', 'port', 'readiness', 'readinessTimeoutMs']
  )
}

function outputReadinessSchema(): AgentToolJsonSchema {
  return objectSchema(
    {
      text: { minLength: 1, type: 'string' },
      type: { const: 'output' }
    },
    ['type', 'text']
  )
}

function terminalServicePortIntentSchema(): AgentToolJsonSchema {
  return {
    description:
      'Managed port intent for parallel projects and worktrees. Prefer preferred(port) with a verified binding when the service has a conventional port; use auto when no conventional port matters; reserve fixed(port) for an explicitly immutable port.',
    examples: [
      {
        binding: { template: '--port {port}', type: 'argument' },
        policy: { port: 8_000, type: 'preferred' },
        protocol: 'http'
      },
      {
        binding: { type: 'environment', variableName: 'PORT' },
        policy: { type: 'auto' },
        protocol: 'http'
      }
    ],
    oneOf: [
      describedObjectSchema(
        {
          binding: dynamicPortBindingSchema(),
          policy: objectSchema(
            {
              port: {
                description: 'Conventional port to try before falling back.',
                maximum: 65_535,
                minimum: 1,
                type: 'integer'
              },
              type: { const: 'preferred' }
            },
            ['type', 'port']
          ),
          protocol: serviceProtocolSchema()
        },
        ['protocol', 'policy', 'binding'],
        'The recommended default for a local development service with a conventional port: try that port, then fall back when parallel projects or worktrees already use it. The actual port must be injected.'
      ),
      describedObjectSchema(
        {
          binding: dynamicPortBindingSchema(),
          policy: objectSchema({ type: { const: 'auto' } }, ['type']),
          protocol: serviceProtocolSchema()
        },
        ['protocol', 'policy', 'binding'],
        'Use when the project has no meaningful conventional port and any available port is acceptable. The actual port must be injected.'
      ),
      describedObjectSchema(
        {
          binding: {
            description:
              'Choose a verified injection when useful, or none only when the existing command or project configuration already binds the exact fixed port.',
            oneOf: [
              environmentPortBindingSchema(),
              argumentPortBindingSchema(),
              nonePortBindingSchema()
            ]
          },
          policy: objectSchema(
            {
              port: {
                description: 'Exact required port. No fallback occurs.',
                maximum: 65_535,
                minimum: 1,
                type: 'integer'
              },
              type: { const: 'fixed' }
            },
            ['type', 'port']
          ),
          protocol: serviceProtocolSchema()
        },
        ['protocol', 'policy', 'binding'],
        'Use only when the user or project contract explicitly requires the exact port. A conflict fails instead of falling back, so this is not the default for parallel worktrees.'
      )
    ]
  }
}

function serviceProtocolSchema(): AgentToolJsonSchema {
  return {
    description:
      'Protocol used to form the actual service endpoint; HTTP and HTTPS endpoints can be opened, while TCP endpoints can only be copied.',
    oneOf: [{ const: 'http' }, { const: 'https' }, { const: 'tcp' }]
  }
}

function nonePortBindingSchema(): AgentToolJsonSchema {
  return describedObjectSchema(
    { type: { const: 'none' } },
    ['type'],
    'This binding does not inject a port. Use it only with fixed when the existing launch command or project configuration already binds that exact port.'
  )
}

function environmentPortBindingSchema(): AgentToolJsonSchema {
  return describedObjectSchema(
    {
      type: { const: 'environment' },
      variableName: { pattern: '^[A-Za-z_][A-Za-z0-9_]*$', type: 'string' }
    },
    ['type', 'variableName'],
    'Inject the actual allocated port through an environment variable that the existing project launch path already reads. Do not invent an unsupported variable.'
  )
}

function argumentPortBindingSchema(): AgentToolJsonSchema {
  return describedObjectSchema(
    {
      template: {
        description:
          'Safe suffix appended to the launch command, with exactly one {port} placeholder replaced by the actual allocated port. Example: --port {port}.',
        pattern: '^[A-Za-z0-9_./:=\\- ]*\\{port\\}[A-Za-z0-9_./:=\\- ]*$',
        type: 'string'
      },
      type: { const: 'argument' }
    },
    ['type', 'template'],
    'Append a safe argument suffix containing {port}. Use it only when the existing CLI or task wrapper accepts that argument.'
  )
}

function dynamicPortBindingSchema(): AgentToolJsonSchema {
  return {
    description:
      'Dynamic policies require one verified way to pass the actual allocated port to the existing service launch path.',
    oneOf: [environmentPortBindingSchema(), argumentPortBindingSchema()]
  }
}

function describedObjectSchema(
  properties: Readonly<Record<string, AgentToolJsonSchema>>,
  required: readonly string[],
  description: string
): AgentToolJsonSchema {
  return { ...objectSchema(properties, required), description }
}

export function terminalWorkflowPlanScopeSchema(): AgentToolJsonSchema {
  return {
    oneOf: [
      objectSchema({ type: { const: 'full' } }, ['type']),
      objectSchema(
        {
          blockId: stringSchema,
          type: { const: 'from-block' }
        },
        ['type', 'blockId']
      )
    ]
  }
}

export function blockGraphOutputSchema(
  optionalProperties: Readonly<Record<string, AgentToolJsonSchema>> = {}
): AgentToolJsonSchema {
  return objectSchema({ type: { const: 'block_graph' }, ...optionalProperties }, ['type'])
}

export function graphToolResultSchema(input: {
  readonly canceled: boolean
  readonly graphChanged: boolean | 'dynamic'
  readonly output: AgentToolJsonSchema
}): AgentToolJsonSchema {
  return {
    oneOf: [
      objectSchema(
        {
          graph: blockGraphSnapshotSchema(),
          graphChanged:
            input.graphChanged === 'dynamic' ? { type: 'boolean' } : { const: input.graphChanged },
          output: input.output,
          status: { const: 'completed' },
          toolCallId: stringSchema
        },
        ['status', 'toolCallId', 'graphChanged', 'graph', 'output']
      ),
      failedToolResultSchema(),
      ...(input.canceled ? [canceledToolResultSchema()] : [])
    ],
    type: 'object'
  }
}

export function terminalWorkflowPlanResultSchema(): AgentToolJsonSchema {
  return {
    oneOf: [
      objectSchema(
        {
          graphChanged: { const: false },
          output: objectSchema(
            {
              plan: terminalWorkflowPlanSnapshotSchema(),
              type: { const: 'terminal_workflow_plan' }
            },
            ['type', 'plan']
          ),
          status: { const: 'completed' },
          toolCallId: stringSchema
        },
        ['status', 'toolCallId', 'graphChanged', 'output']
      ),
      failedToolResultSchema()
    ],
    type: 'object'
  }
}

function failedToolResultSchema(): AgentToolJsonSchema {
  return objectSchema(
    {
      error: objectSchema(
        {
          code: stringSchema,
          details: {
            additionalProperties: {
              oneOf: [stringSchema, finiteNumberSchema, { type: 'boolean' }, { type: 'null' }]
            },
            type: 'object'
          },
          isExpected: { type: 'boolean' },
          message: stringSchema
        },
        ['code', 'message', 'isExpected']
      ),
      status: { const: 'failed' },
      toolCallId: stringSchema
    },
    ['status', 'toolCallId', 'error']
  )
}

function canceledToolResultSchema(): AgentToolJsonSchema {
  return objectSchema(
    {
      output: objectSchema(
        {
          reason: stringSchema,
          type: { const: 'tool_canceled' }
        },
        ['type', 'reason']
      ),
      status: { const: 'canceled' },
      toolCallId: stringSchema
    },
    ['status', 'toolCallId', 'output']
  )
}

function blockGraphSnapshotSchema(): AgentToolJsonSchema {
  return objectSchema(
    {
      blocks: {
        items: objectSchema(
          {
            description: stringSchema,
            executionConfig: terminalExecutionConfigSchema(),
            id: stringSchema,
            launchCommand: stringSchema,
            name: stringSchema,
            position: positionSchema(),
            size: terminalBlockSizeSchema(),
            type: { const: 'terminal' }
          },
          ['id', 'type', 'name', 'description', 'launchCommand', 'position', 'size']
        ),
        type: 'array'
      },
      connections: {
        items: objectSchema(
          {
            id: stringSchema,
            sourceBlockId: stringSchema,
            targetBlockId: stringSchema
          },
          ['id', 'sourceBlockId', 'targetBlockId']
        ),
        type: 'array'
      },
      id: stringSchema,
      projectId: stringSchema,
      terminalGroups: {
        items: objectSchema(
          {
            id: stringSchema,
            isCollapsed: { type: 'boolean' },
            memberBlockIds: { items: stringSchema, type: 'array' },
            name: stringSchema,
            position: positionSchema(),
            size: terminalGroupSizeSchema(),
            type: { const: 'terminal-group' }
          },
          ['id', 'type', 'name', 'position', 'size', 'isCollapsed', 'memberBlockIds']
        ),
        type: 'array'
      },
      viewport: objectSchema(
        { x: finiteNumberSchema, y: finiteNumberSchema, zoom: finiteNumberSchema },
        ['x', 'y', 'zoom']
      ),
      workspaceId: stringSchema
    },
    ['id', 'projectId', 'workspaceId', 'viewport', 'blocks', 'terminalGroups']
  )
}

export function terminalWorkflowPlanSnapshotSchema(): AgentToolJsonSchema {
  return objectSchema(
    {
      graphId: stringSchema,
      nodes: {
        items: objectSchema(
          {
            blockId: stringSchema,
            dependencyBlockIds: { items: stringSchema, type: 'array' },
            executionConfig: terminalExecutionConfigSchema(),
            launchCommand: stringSchema,
            name: stringSchema
          },
          ['blockId', 'name', 'launchCommand', 'executionConfig', 'dependencyBlockIds']
        ),
        type: 'array'
      },
      workspaceId: stringSchema
    },
    ['graphId', 'workspaceId', 'nodes']
  )
}

function terminalGroupSizeSchema(): AgentToolJsonSchema {
  return objectSchema({ height: finiteNumberSchema, width: finiteNumberSchema }, [
    'width',
    'height'
  ])
}
