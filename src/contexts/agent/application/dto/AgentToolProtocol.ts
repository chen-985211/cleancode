import type {
  AgentBlockGraphSnapshot,
  AgentBlockPositionSnapshot,
  AgentTerminalBlockSizeSnapshot
} from './AgentBlockGraphProtocol'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type {
  AgentTerminalExecutionConfigSnapshot,
  AgentTerminalWorkflowPlanScope,
  AgentTerminalWorkflowPlanSnapshot
} from './AgentTerminalWorkflowProtocol'
import { canvasExecutionSemanticInstructions } from '../../../../shared-kernel/domain/policies/CanvasExecutionSemantics'
import { objectSchema, type AgentToolJsonSchema } from './AgentToolJsonSchema'
import {
  blockGraphOutputSchema,
  graphToolResultSchema,
  positionSchema,
  terminalBlockSizeSchema,
  terminalExecutionConfigSchema,
  terminalWorkflowPlanSnapshotSchema,
  terminalWorkflowPlanResultSchema,
  terminalWorkflowPlanScopeSchema
} from './AgentToolProtocolSchemas'

export interface AgentToolDefinition {
  readonly annotations: AgentToolAnnotations
  readonly description: string
  readonly inputSchema: AgentToolJsonSchema
  readonly name: AgentToolName
  readonly outputSchema: AgentToolJsonSchema
  readonly requiresApproval: boolean
}

interface AgentToolAnnotations {
  readonly destructiveHint: boolean
  readonly openWorldHint: boolean
  readonly readOnlyHint: boolean
}

export const cleancodeMcpDeveloperInstructions = [
  'CleanCode canvas routing is mandatory while the built-in cleancode MCP server is enabled. Treat unqualified requests about “终端”, “整理终端”, “终端布局”, “终端组合”, “终端工作流”, terminal dependencies, and specifically “启动项目的终端组合” as requests to create or modify persisted CleanCode canvas terminal blocks, groups, execution configuration, and dependency connections, not as requests to run project processes directly.',
  canvasExecutionSemanticInstructions,
  'Call inspect_graph before reading repository files or using shell commands. You may inspect repository files after inspect_graph only to determine launch commands. For a new configured terminal or a new multi-terminal dependency workflow, use create_terminal_workflow once with the complete definitions, connections, and optional combination; it atomically validates and arranges the new scope near existing canvas content. Keep create_block, update_terminal_execution_config, connect_terminal_blocks, create_terminal_group, arrange_terminal_layout, and inspect_terminal_workflow_plan for empty visual terminals or edits to existing canvas objects. Do not split one new workflow across repeated create/configure/connect/arrange calls.',
  'When a terminal starts a local HTTP, HTTPS, or TCP development service, inspect its existing launch path before choosing a managed port. For parallel projects and worktrees, use preferred with the conventional port as the recommended default, or auto when no conventional port matters. Both require a verified binding: environment only when the existing project already reads that variable, or argument with a safe template such as --port {port} only when the existing CLI or task wrapper accepts it. Do not invent a variable or select fixed + none merely because logs or defaults mention a port; reserve fixed for an explicit immutable-port requirement. Run replaces the binding with the actual allocated port at launch, and readiness plus the displayed endpoint follow that actual port.',
  'The current CleanCode MCP can author and inspect a terminal workflow but cannot start it. Never use shell processes, package scripts, .vscode tasks, aliases, or project configuration as a substitute for CleanCode canvas objects, and do not claim that a created workflow or terminal was started. Only interpret the request as source-code implementation work when the user explicitly names terminal source code, a Terminal component, xterm, PTY, or terminal module implementation.'
].join('\n')

export const cleancodeMcpInstructions = [
  'CleanCode canvas scope / CleanCode 画布语义：while this MCP server is enabled, unqualified requests such as “终端”, “整理终端”, “终端布局”, “终端组合”, “终端工作流”, terminal organization, terminal layout, or terminal dependencies mean persisted CleanCode canvas objects, not repository code. Call inspect_graph before reading or searching repository files. Only treat explicit source-code terms such as “终端源码”, “Terminal component”, xterm, PTY, or terminal module implementation as project-code work.',
  canvasExecutionSemanticInstructions,
  'For canvas work, inspect first. Use create_terminal_workflow once for a new configured terminal or complete new dependency workflow; it atomically creates definitions, internal dependencies, an optional combination, deterministic layout near existing canvas content, and a validated plan. Use create_block, update_terminal_execution_config, connect_terminal_blocks, create_terminal_group, arrange_terminal_layout, and inspect_terminal_workflow_plan for empty visual terminals or edits to existing canvas objects. Do not split one new workflow across repeated tool calls. Terminal groups are visual organization and are not workflow nodes. These tools do not start PTYs or workflow runs, so do not claim that authoring or inspection started anything.',
  'For a local HTTP, HTTPS, or TCP development service that may run in parallel projects or worktrees, prefer preferred with its conventional port and a verified environment or argument binding; use auto when no conventional port matters. Environment injection is valid only when the existing project already reads the named variable, and an argument template such as --port {port} is valid only when the existing CLI or wrapper accepts it. Use fixed, especially fixed + none, only for an explicit immutable-port contract. At runtime CleanCode injects the actual allocated port and validates readiness against that actual port.',
  'Do not create .vscode/tasks.json, package scripts, shell aliases, or project config as a substitute for CleanCode canvas objects. The Provider launch integration may allow these CleanCode MCP tools directly when that Provider supports a tool allowlist. This does not change the Provider sandbox or approval policy for shell commands, files, Git, network access, or other MCP servers. Deletion tools still require independent CleanCode UI approval, as does disconnecting a dependency.'
].join('\n')

const readOnlyToolAnnotations: AgentToolAnnotations = {
  destructiveHint: false,
  openWorldHint: false,
  readOnlyHint: true
}

const nonDestructiveWriteToolAnnotations: AgentToolAnnotations = {
  destructiveHint: false,
  openWorldHint: false,
  readOnlyHint: false
}

const destructiveWriteToolAnnotations: AgentToolAnnotations = {
  destructiveHint: true,
  openWorldHint: false,
  readOnlyHint: false
}

const unchangedGraphOutputSchema = blockGraphOutputSchema()

export const agentToolDefinitions: readonly AgentToolDefinition[] = [
  graphTool({
    annotations: readOnlyToolAnnotations,
    description:
      'Inspect the current CleanCode canvas block graph for this branch workspace. Call this before authoring terminal blocks, groups, execution configuration, or dependencies.',
    graphChanged: false,
    inputSchema: objectSchema({
      reason: {
        description: 'Optional reason for inspecting the current CleanCode canvas graph.',
        type: 'string'
      }
    }),
    name: 'inspect_graph',
    output: unchangedGraphOutputSchema
  }),
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description:
      'Create a terminal block on the cleancode canvas. Omit position to place it intelligently near existing canvas content, or provide position to use those exact coordinates. Use this for visual workspace terminals; do not create project task files as a substitute.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        description: { type: 'string' },
        launchCommand: { type: 'string' },
        name: { type: 'string' },
        position: positionSchema(),
        size: terminalBlockSizeSchema(),
        type: { const: 'terminal' }
      },
      ['type', 'name']
    ),
    name: 'create_block',
    output: blockGraphOutputSchema({ createdBlockId: { type: 'string' } })
  }),
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description:
      'Atomically create, configure, connect, optionally combine, arrange, and validate one new CleanCode terminal workflow. Use one call instead of exposing repeated create/configure/connect/arrange tool delays. Refs exist only inside this call and are returned with their persisted block IDs.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        connections: {
          items: objectSchema(
            {
              sourceRef: { minLength: 1, type: 'string' },
              targetRef: { minLength: 1, type: 'string' }
            },
            ['sourceRef', 'targetRef']
          ),
          type: 'array',
          uniqueItems: true
        },
        terminalGroup: objectSchema(
          {
            memberRefs: {
              items: { minLength: 1, type: 'string' },
              minItems: 1,
              type: 'array',
              uniqueItems: true
            },
            name: { minLength: 1, type: 'string' }
          },
          ['name', 'memberRefs']
        ),
        terminals: {
          items: objectSchema(
            {
              description: { type: 'string' },
              executionConfig: terminalExecutionConfigSchema(),
              launchCommand: { minLength: 1, type: 'string' },
              name: { minLength: 1, type: 'string' },
              ref: { minLength: 1, type: 'string' },
              size: terminalBlockSizeSchema()
            },
            ['ref', 'name', 'launchCommand']
          ),
          minItems: 1,
          type: 'array'
        }
      },
      ['terminals', 'connections']
    ),
    name: 'create_terminal_workflow',
    output: objectSchema(
      {
        arrangedBlockIds: { items: { type: 'string' }, type: 'array' },
        arrangedTerminalGroupIds: { items: { type: 'string' }, type: 'array' },
        createdConnections: {
          items: objectSchema(
            {
              connectionId: { type: 'string' },
              sourceRef: { type: 'string' },
              targetRef: { type: 'string' }
            },
            ['connectionId', 'sourceRef', 'targetRef']
          ),
          type: 'array'
        },
        createdTerminalGroupId: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        createdTerminals: {
          items: objectSchema({ blockId: { type: 'string' }, ref: { type: 'string' } }, [
            'ref',
            'blockId'
          ]),
          type: 'array'
        },
        plan: terminalWorkflowPlanSnapshotSchema(),
        type: { const: 'terminal_workflow_created' }
      },
      [
        'type',
        'createdTerminals',
        'createdConnections',
        'createdTerminalGroupId',
        'arrangedBlockIds',
        'arrangedTerminalGroupIds',
        'plan'
      ]
    )
  }),
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description:
      'Update an existing terminal block on the CleanCode canvas: metadata, launch command, position, or size.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        blockId: { type: 'string' },
        description: { type: 'string' },
        launchCommand: { type: 'string' },
        name: { type: 'string' },
        position: positionSchema(),
        size: terminalBlockSizeSchema()
      },
      ['blockId']
    ),
    name: 'update_block',
    output: unchangedGraphOutputSchema
  }),
  graphTool({
    annotations: destructiveWriteToolAnnotations,
    canceled: true,
    description:
      'Delete a terminal block from the CleanCode canvas. This destructive action requires separate CleanCode UI approval.',
    graphChanged: true,
    inputSchema: objectSchema({ blockId: { type: 'string' } }, ['blockId']),
    name: 'delete_block',
    output: unchangedGraphOutputSchema
  }),
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description:
      'Create a persistent terminal-group space on the cleancode canvas. It may start empty or contain existing independent terminals and complete workflows. A group is a connection scope, not a workflow node; dependencies cannot cross its boundary.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        memberBlockIds: {
          items: { type: 'string' },
          type: 'array',
          uniqueItems: true
        },
        name: { type: 'string' },
        position: positionSchema()
      },
      ['name']
    ),
    name: 'create_terminal_group',
    output: blockGraphOutputSchema({ createdTerminalGroupId: { type: 'string' } })
  }),
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description: 'Update an existing visual terminal group: name, position, or collapsed state.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        isCollapsed: { type: 'boolean' },
        name: { type: 'string' },
        position: positionSchema(),
        terminalGroupId: { type: 'string' }
      },
      ['terminalGroupId']
    ),
    name: 'update_terminal_group',
    output: unchangedGraphOutputSchema
  }),
  graphTool({
    annotations: destructiveWriteToolAnnotations,
    canceled: true,
    description:
      'Dissolve a visual terminal group while preserving its terminal blocks. This requires separate CleanCode UI approval.',
    graphChanged: true,
    inputSchema: objectSchema({ terminalGroupId: { type: 'string' } }, ['terminalGroupId']),
    name: 'delete_terminal_group',
    output: unchangedGraphOutputSchema
  }),
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description:
      'Replace the task or service execution configuration without starting it. For parallel local services, prefer preferred(port) with a verified environment or argument binding, use auto when no conventional port matters, and use fixed only for an explicit immutable-port contract. Example: policy {"type":"preferred","port":8000} with binding {"type":"argument","template":"--port {port}"}. Run allocates and injects the actual port at launch.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        blockId: { type: 'string' },
        executionConfig: terminalExecutionConfigSchema()
      },
      ['blockId', 'executionConfig']
    ),
    name: 'update_terminal_execution_config',
    output: unchangedGraphOutputSchema
  }),
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description:
      'Connect an upstream source terminal to a downstream target terminal in the CleanCode dependency workflow.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        sourceBlockId: { type: 'string' },
        targetBlockId: { type: 'string' }
      },
      ['sourceBlockId', 'targetBlockId']
    ),
    name: 'connect_terminal_blocks',
    output: blockGraphOutputSchema({ connectionId: { type: 'string' } })
  }),
  graphTool({
    annotations: destructiveWriteToolAnnotations,
    canceled: true,
    description:
      'Disconnect one terminal dependency while preserving both terminal blocks. This requires separate CleanCode UI approval.',
    graphChanged: true,
    inputSchema: objectSchema({ connectionId: { type: 'string' } }, ['connectionId']),
    name: 'disconnect_terminal_blocks',
    output: unchangedGraphOutputSchema
  }),
  {
    annotations: readOnlyToolAnnotations,
    description:
      'Build and validate a stable topological terminal workflow plan without starting PTYs or a workflow run.',
    inputSchema: objectSchema({ scope: terminalWorkflowPlanScopeSchema() }, ['scope']),
    name: 'inspect_terminal_workflow_plan',
    outputSchema: terminalWorkflowPlanResultSchema(),
    requiresApproval: false
  },
  graphTool({
    annotations: nonDestructiveWriteToolAnnotations,
    description:
      'Arrange exactly the requested terminal blocks and their related terminal groups near existing canvas content. Unrelated canvas objects are preserved.',
    graphChanged: 'dynamic',
    inputSchema: objectSchema(
      {
        blockIds: {
          items: { type: 'string' },
          minItems: 1,
          type: 'array',
          uniqueItems: true
        }
      },
      ['blockIds']
    ),
    name: 'arrange_terminal_layout',
    output: objectSchema(
      {
        arrangedBlockIds: { items: { type: 'string' }, type: 'array' },
        arrangedTerminalGroupIds: { items: { type: 'string' }, type: 'array' },
        type: { const: 'block_graph' }
      },
      ['type', 'arrangedBlockIds', 'arrangedTerminalGroupIds']
    )
  })
]

export interface AgentToolContext {
  readonly projectDirectory: string
  readonly workspaceId: string
}

interface InspectGraphAgentToolInput {
  readonly reason?: string
}

export interface CreateBlockAgentToolInput {
  readonly description?: string
  readonly launchCommand?: string
  readonly name: string
  readonly position?: AgentBlockPositionSnapshot
  readonly size?: AgentTerminalBlockSizeSnapshot
  readonly type: 'terminal'
}

export interface CreateTerminalWorkflowAgentToolInput {
  readonly connections: readonly {
    readonly sourceRef: string
    readonly targetRef: string
  }[]
  readonly terminalGroup?: {
    readonly memberRefs: readonly string[]
    readonly name: string
  }
  readonly terminals: readonly {
    readonly description?: string
    readonly executionConfig?: AgentTerminalExecutionConfigSnapshot
    readonly launchCommand: string
    readonly name: string
    readonly ref: string
    readonly size?: AgentTerminalBlockSizeSnapshot
  }[]
}

export interface UpdateBlockAgentToolInput {
  readonly blockId: string
  readonly description?: string
  readonly launchCommand?: string
  readonly name?: string
  readonly position?: AgentBlockPositionSnapshot
  readonly size?: AgentTerminalBlockSizeSnapshot
}

export interface DeleteBlockAgentToolInput {
  readonly blockId: string
}

export interface CreateTerminalGroupAgentToolInput {
  readonly memberBlockIds?: readonly string[]
  readonly name: string
  readonly position?: AgentBlockPositionSnapshot
}

export interface UpdateTerminalGroupAgentToolInput {
  readonly isCollapsed?: boolean
  readonly name?: string
  readonly position?: AgentBlockPositionSnapshot
  readonly terminalGroupId: string
}

export interface DeleteTerminalGroupAgentToolInput {
  readonly terminalGroupId: string
}

interface UpdateTerminalExecutionConfigAgentToolInput {
  readonly blockId: string
  readonly executionConfig: AgentTerminalExecutionConfigSnapshot
}

interface ConnectTerminalBlocksAgentToolInput {
  readonly sourceBlockId: string
  readonly targetBlockId: string
}

interface DisconnectTerminalBlocksAgentToolInput {
  readonly connectionId: string
}

interface InspectTerminalWorkflowPlanAgentToolInput {
  readonly scope: AgentTerminalWorkflowPlanScope
}

export interface ArrangeTerminalLayoutAgentToolInput {
  readonly blockIds: readonly string[]
}

export interface AgentToolInputByName {
  readonly arrange_terminal_layout: ArrangeTerminalLayoutAgentToolInput
  readonly connect_terminal_blocks: ConnectTerminalBlocksAgentToolInput
  readonly create_block: CreateBlockAgentToolInput
  readonly create_terminal_workflow: CreateTerminalWorkflowAgentToolInput
  readonly create_terminal_group: CreateTerminalGroupAgentToolInput
  readonly delete_block: DeleteBlockAgentToolInput
  readonly delete_terminal_group: DeleteTerminalGroupAgentToolInput
  readonly disconnect_terminal_blocks: DisconnectTerminalBlocksAgentToolInput
  readonly inspect_graph: InspectGraphAgentToolInput
  readonly inspect_terminal_workflow_plan: InspectTerminalWorkflowPlanAgentToolInput
  readonly update_block: UpdateBlockAgentToolInput
  readonly update_terminal_execution_config: UpdateTerminalExecutionConfigAgentToolInput
  readonly update_terminal_group: UpdateTerminalGroupAgentToolInput
}

export type AgentToolOutput =
  | {
      readonly connectionId?: string
      readonly createdBlockId?: string
      readonly createdTerminalGroupId?: string
      readonly arrangedBlockIds?: readonly string[]
      readonly arrangedTerminalGroupIds?: readonly string[]
      readonly type: 'block_graph'
    }
  | {
      readonly arrangedBlockIds: readonly string[]
      readonly arrangedTerminalGroupIds: readonly string[]
      readonly createdConnections: readonly {
        readonly connectionId: string
        readonly sourceRef: string
        readonly targetRef: string
      }[]
      readonly createdTerminalGroupId: string | null
      readonly createdTerminals: readonly { readonly blockId: string; readonly ref: string }[]
      readonly plan: AgentTerminalWorkflowPlanSnapshot
      readonly type: 'terminal_workflow_created'
    }
  | {
      readonly plan: AgentTerminalWorkflowPlanSnapshot
      readonly type: 'terminal_workflow_plan'
    }
  | {
      readonly reason: string
      readonly type: 'tool_canceled'
    }

type AgentToolCompletedOutput = Exclude<AgentToolOutput, { readonly type: 'tool_canceled' }>

export type AgentToolStructuredContent =
  | {
      readonly graph: AgentBlockGraphSnapshot
      readonly graphChanged: boolean
      readonly output: Extract<
        AgentToolCompletedOutput,
        { readonly type: 'block_graph' | 'terminal_workflow_created' }
      >
      readonly status: 'completed'
      readonly toolCallId: string
    }
  | {
      readonly graphChanged: false
      readonly output: Extract<
        AgentToolCompletedOutput,
        { readonly type: 'terminal_workflow_plan' }
      >
      readonly status: 'completed'
      readonly toolCallId: string
    }
  | {
      readonly error: AgentToolErrorSnapshot
      readonly status: 'failed'
      readonly toolCallId: string
    }
  | {
      readonly output: Extract<AgentToolOutput, { readonly type: 'tool_canceled' }>
      readonly status: 'canceled'
      readonly toolCallId: string
    }

export interface AgentToolErrorSnapshot {
  readonly code: string
  readonly details?: Readonly<Record<string, string | number | boolean | null>>
  readonly isExpected: boolean
  readonly message: string
}

export function isAgentToolName(value: string): value is AgentToolName {
  return agentToolDefinitions.some((tool) => tool.name === value)
}

function graphTool(input: {
  readonly annotations: AgentToolAnnotations
  readonly canceled?: boolean
  readonly description: string
  readonly graphChanged: boolean | 'dynamic'
  readonly inputSchema: AgentToolJsonSchema
  readonly name: AgentToolName
  readonly output: AgentToolJsonSchema
}): AgentToolDefinition {
  return {
    annotations: input.annotations,
    description: input.description,
    inputSchema: input.inputSchema,
    name: input.name,
    outputSchema: graphToolResultSchema({
      canceled: input.canceled ?? false,
      graphChanged: input.graphChanged,
      output: input.output
    }),
    requiresApproval: input.canceled ?? false
  }
}
