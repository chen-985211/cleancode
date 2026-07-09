import type {
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot
} from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'

export interface AgentToolDefinition {
  readonly name: AgentToolName
  readonly description: string
  readonly inputSchema: AgentToolInputSchema
  readonly requiresApproval: boolean
}

type AgentToolInputSchema = Record<string, unknown>

export const cleancodeMcpInstructions = [
  'Cleancode canvas contract: use this MCP server for terminal blocks, terminal groups, canvas layout, and block graph changes in the cleancode workspace. Do not create .vscode/tasks.json, package scripts, shell aliases, or project config as a substitute for cleancode canvas terminal blocks.',
  'Recommended workflow: call inspect_graph before canvas layout changes, create terminal blocks with create_block, then group existing block ids with create_terminal_group. Deletion tools require independent cleancode UI approval.'
].join('\n')

export const codexAgentDeveloperInstructions = [
  'You are running inside the cleancode right-side Codex CLI panel.',
  cleancodeMcpInstructions,
  'For normal source-code tasks, read and edit the repository as usual. For requests about the cleancode canvas, terminal blocks, terminal groups, or block graph, use the cleancode MCP tools instead of changing repository files.'
].join('\n')

export const agentToolDefinitions: readonly AgentToolDefinition[] = [
  {
    description:
      'Inspect the current cleancode canvas block graph for this branch workspace. Call this before creating, updating, grouping, or deleting terminal blocks.',
    inputSchema: objectSchema({
      reason: {
        description: 'Optional reason for inspecting the current cleancode canvas graph.',
        type: 'string'
      }
    }),
    name: 'inspect_graph',
    requiresApproval: false
  },
  {
    description:
      'Create a terminal block on the cleancode canvas. Use this for visual workspace terminals; do not create .vscode/tasks.json or package scripts as a substitute.',
    inputSchema: objectSchema(
      {
        description: {
          description: 'Short terminal block description shown on the canvas.',
          type: 'string'
        },
        launchCommand: {
          description:
            'Optional command run by the terminal block launch button, such as pnpm dev.',
          type: 'string'
        },
        name: {
          description: 'Visible terminal block name, such as Dev Server or Unit Tests.',
          type: 'string'
        },
        position: positionSchema(),
        size: terminalBlockSizeSchema(),
        type: {
          const: 'terminal',
          description: 'First-phase cleancode blocks created by the agent must be terminals.'
        }
      },
      ['type', 'name', 'position']
    ),
    name: 'create_block',
    requiresApproval: false
  },
  {
    description:
      'Update an existing terminal block on the cleancode canvas: metadata, launch command, position, or size.',
    inputSchema: objectSchema(
      {
        blockId: {
          description: 'Terminal block id from inspect_graph or a prior create_block result.',
          type: 'string'
        },
        description: {
          description: 'Replacement terminal block description.',
          type: 'string'
        },
        launchCommand: {
          description: 'Replacement launch command for the terminal block.',
          type: 'string'
        },
        name: {
          description: 'Replacement visible terminal block name.',
          type: 'string'
        },
        position: positionSchema(),
        size: terminalBlockSizeSchema()
      },
      ['blockId']
    ),
    name: 'update_block',
    requiresApproval: false
  },
  {
    description:
      'Delete a terminal block from the cleancode canvas. This destructive action requires separate cleancode UI approval.',
    inputSchema: objectSchema(
      {
        blockId: {
          description: 'Terminal block id from inspect_graph.',
          type: 'string'
        }
      },
      ['blockId']
    ),
    name: 'delete_block',
    requiresApproval: true
  },
  {
    description:
      'Create a terminal group on the cleancode canvas from existing terminal blocks. Use member block ids returned by inspect_graph or create_block.',
    inputSchema: objectSchema(
      {
        memberBlockIds: {
          description: 'Two or more existing terminal block ids to group together.',
          items: { type: 'string' },
          minItems: 2,
          type: 'array'
        },
        name: {
          description: 'Visible terminal group name, such as OpenCove: Dev + Test.',
          type: 'string'
        }
      },
      ['name', 'memberBlockIds']
    ),
    name: 'create_terminal_group',
    requiresApproval: false
  },
  {
    description:
      'Update an existing terminal group on the cleancode canvas: name, position, or collapsed state.',
    inputSchema: objectSchema(
      {
        isCollapsed: {
          description: 'Whether the terminal group is collapsed on the canvas.',
          type: 'boolean'
        },
        name: {
          description: 'Replacement visible terminal group name.',
          type: 'string'
        },
        position: positionSchema(),
        terminalGroupId: {
          description: 'Terminal group id from inspect_graph or create_terminal_group.',
          type: 'string'
        }
      },
      ['terminalGroupId']
    ),
    name: 'update_terminal_group',
    requiresApproval: false
  },
  {
    description:
      'Delete a terminal group from the cleancode canvas without deleting member terminals. This destructive action requires separate cleancode UI approval.',
    inputSchema: objectSchema(
      {
        terminalGroupId: {
          description: 'Terminal group id from inspect_graph.',
          type: 'string'
        }
      },
      ['terminalGroupId']
    ),
    name: 'delete_terminal_group',
    requiresApproval: true
  }
]

export interface AgentToolContext {
  readonly projectDirectory: string
  readonly workspaceName: string
}

export interface InspectGraphAgentToolInput {
  readonly reason?: string
}

export interface CreateBlockAgentToolInput {
  readonly type: 'terminal'
  readonly name: string
  readonly description?: string
  readonly launchCommand?: string
  readonly position: BlockPositionSnapshot
  readonly size?: TerminalBlockSizeSnapshot
}

export interface UpdateBlockAgentToolInput {
  readonly blockId: string
  readonly name?: string
  readonly description?: string
  readonly launchCommand?: string
  readonly position?: BlockPositionSnapshot
  readonly size?: TerminalBlockSizeSnapshot
}

export interface DeleteBlockAgentToolInput {
  readonly blockId: string
}

export interface CreateTerminalGroupAgentToolInput {
  readonly name: string
  readonly memberBlockIds: readonly string[]
}

export interface UpdateTerminalGroupAgentToolInput {
  readonly terminalGroupId: string
  readonly name?: string
  readonly position?: BlockPositionSnapshot
  readonly isCollapsed?: boolean
}

export interface DeleteTerminalGroupAgentToolInput {
  readonly terminalGroupId: string
}

export type AgentToolOutput =
  | {
      readonly createdBlockId?: string
      readonly createdTerminalGroupId?: string
      readonly type: 'block_graph'
    }
  | {
      readonly reason: string
      readonly type: 'tool_canceled'
    }

export function isAgentToolName(value: string): value is AgentToolName {
  return agentToolDefinitions.some((tool) => tool.name === value)
}

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[] = []
): AgentToolInputSchema {
  return {
    additionalProperties: false,
    properties,
    required,
    type: 'object'
  }
}

function positionSchema(): AgentToolInputSchema {
  return objectSchema(
    {
      x: {
        description: 'Canvas x coordinate in pixels.',
        type: 'number'
      },
      y: {
        description: 'Canvas y coordinate in pixels.',
        type: 'number'
      }
    },
    ['x', 'y']
  )
}

function terminalBlockSizeSchema(): AgentToolInputSchema {
  return objectSchema(
    {
      height: {
        description: 'Terminal block height in pixels.',
        type: 'number'
      },
      width: {
        description: 'Terminal block width in pixels.',
        type: 'number'
      }
    },
    ['width', 'height']
  )
}
