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
    oneOf: [
      objectSchema(
        {
          binding: {
            oneOf: [
              nonePortBindingSchema(),
              environmentPortBindingSchema(),
              argumentPortBindingSchema()
            ]
          },
          policy: objectSchema(
            {
              port: { maximum: 65_535, minimum: 1, type: 'integer' },
              type: { const: 'fixed' }
            },
            ['type', 'port']
          ),
          protocol: serviceProtocolSchema()
        },
        ['protocol', 'policy', 'binding']
      ),
      objectSchema(
        {
          binding: { oneOf: [environmentPortBindingSchema(), argumentPortBindingSchema()] },
          policy: objectSchema(
            {
              port: { maximum: 65_535, minimum: 1, type: 'integer' },
              type: { const: 'preferred' }
            },
            ['type', 'port']
          ),
          protocol: serviceProtocolSchema()
        },
        ['protocol', 'policy', 'binding']
      ),
      objectSchema(
        {
          binding: { oneOf: [environmentPortBindingSchema(), argumentPortBindingSchema()] },
          policy: objectSchema({ type: { const: 'auto' } }, ['type']),
          protocol: serviceProtocolSchema()
        },
        ['protocol', 'policy', 'binding']
      )
    ]
  }
}

function serviceProtocolSchema(): AgentToolJsonSchema {
  return { oneOf: [{ const: 'http' }, { const: 'https' }, { const: 'tcp' }] }
}

function nonePortBindingSchema(): AgentToolJsonSchema {
  return objectSchema({ type: { const: 'none' } }, ['type'])
}

function environmentPortBindingSchema(): AgentToolJsonSchema {
  return objectSchema(
    {
      type: { const: 'environment' },
      variableName: { pattern: '^[A-Za-z_][A-Za-z0-9_]*$', type: 'string' }
    },
    ['type', 'variableName']
  )
}

function argumentPortBindingSchema(): AgentToolJsonSchema {
  return objectSchema(
    {
      template: {
        pattern: '^[A-Za-z0-9_./:=\\- ]*\\{port\\}[A-Za-z0-9_./:=\\- ]*$',
        type: 'string'
      },
      type: { const: 'argument' }
    },
    ['type', 'template']
  )
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
      workspaceName: stringSchema
    },
    ['id', 'projectId', 'workspaceName', 'viewport', 'blocks', 'terminalGroups']
  )
}

function terminalWorkflowPlanSnapshotSchema(): AgentToolJsonSchema {
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
      workspaceName: stringSchema
    },
    ['graphId', 'workspaceName', 'nodes']
  )
}

function terminalGroupSizeSchema(): AgentToolJsonSchema {
  return objectSchema({ height: finiteNumberSchema, width: finiteNumberSchema }, [
    'width',
    'height'
  ])
}
