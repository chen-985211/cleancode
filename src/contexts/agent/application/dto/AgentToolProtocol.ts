import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot
} from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type {
  AgentTerminalExecutionConfigSnapshot,
  AgentTerminalWorkflowPlanScope,
  AgentTerminalWorkflowPlanSnapshot
} from './AgentTerminalWorkflowProtocol'
import { objectSchema, type AgentToolJsonSchema } from './AgentToolJsonSchema'
import {
  blockGraphOutputSchema,
  graphToolResultSchema,
  positionSchema,
  terminalBlockSizeSchema,
  terminalExecutionConfigSchema,
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
  'Call inspect_graph before reading repository files or using shell commands. You may inspect repository files after inspect_graph only to determine launch commands. Complete canvas authoring with create_block, update_terminal_execution_config, connect_terminal_blocks, and create_terminal_group as needed, call arrange_terminal_layout with the exact created or related terminal block IDs to place that terminal workflow around the active Agent without moving unrelated objects, then call inspect_terminal_workflow_plan to validate the dependency plan.',
  'The current CleanCode MCP can author and inspect a terminal workflow but cannot start it. Never use shell processes, package scripts, .vscode tasks, aliases, or project configuration as a substitute for CleanCode canvas objects, and do not claim that a created workflow or terminal was started. Only interpret the request as source-code implementation work when the user explicitly names terminal source code, a Terminal component, xterm, PTY, or terminal module implementation.'
].join('\n')

export const cleancodeMcpInstructions = [
  'CleanCode canvas scope / CleanCode 画布语义：while this MCP server is enabled, unqualified requests such as “终端”, “整理终端”, “终端布局”, “终端组合”, “终端工作流”, terminal organization, terminal layout, or terminal dependencies mean persisted CleanCode canvas objects, not repository code. Call inspect_graph before reading or searching repository files. Only treat explicit source-code terms such as “终端源码”, “Terminal component”, xterm, PTY, or terminal module implementation as project-code work.',
  'For canvas work, inspect first, create or update terminal blocks, configure task/service execution with update_terminal_execution_config, connect upstream source terminals to downstream target terminals with connect_terminal_blocks, organize the exact related terminals with arrange_terminal_layout, and validate the result with inspect_terminal_workflow_plan. Terminal groups are visual organization and are not workflow nodes. These tools do not start PTYs or workflow runs, so do not claim that authoring or inspection started anything.',
  'Do not create .vscode/tasks.json, package scripts, shell aliases, or project config as a substitute for CleanCode canvas objects. CleanCode MCP tools are pre-approved at the Codex MCP layer. This does not change the global Codex sandbox or approval policy for shell commands, files, Git, network access, or other MCP servers. Deletion tools still require independent CleanCode UI approval, as does disconnecting a dependency.'
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
      'Create a terminal block on the cleancode canvas. Omit position to place it intelligently around the active Agent, or provide position to use those exact coordinates. Use this for visual workspace terminals; do not create project task files as a substitute.',
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
      'Create a visual terminal group on the cleancode canvas from two or more existing terminal blocks. A group is not a workflow node.',
    graphChanged: true,
    inputSchema: objectSchema(
      {
        memberBlockIds: {
          items: { type: 'string' },
          minItems: 2,
          type: 'array',
          uniqueItems: true
        },
        name: { type: 'string' }
      },
      ['name', 'memberBlockIds']
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
      'Replace the task or service execution configuration of a terminal block without starting it.',
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
      'Arrange exactly the requested terminal blocks and their related terminal groups around the active Agent on the CleanCode canvas. Unrelated canvas objects are preserved.',
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
  readonly workspaceName: string
}

interface InspectGraphAgentToolInput {
  readonly reason?: string
}

export interface CreateBlockAgentToolInput {
  readonly description?: string
  readonly launchCommand?: string
  readonly name: string
  readonly position?: BlockPositionSnapshot
  readonly size?: TerminalBlockSizeSnapshot
  readonly type: 'terminal'
}

export interface UpdateBlockAgentToolInput {
  readonly blockId: string
  readonly description?: string
  readonly launchCommand?: string
  readonly name?: string
  readonly position?: BlockPositionSnapshot
  readonly size?: TerminalBlockSizeSnapshot
}

export interface DeleteBlockAgentToolInput {
  readonly blockId: string
}

export interface CreateTerminalGroupAgentToolInput {
  readonly memberBlockIds: readonly string[]
  readonly name: string
}

export interface UpdateTerminalGroupAgentToolInput {
  readonly isCollapsed?: boolean
  readonly name?: string
  readonly position?: BlockPositionSnapshot
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
      readonly graph: BlockGraphSnapshot
      readonly graphChanged: boolean
      readonly output: Extract<AgentToolCompletedOutput, { readonly type: 'block_graph' }>
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
