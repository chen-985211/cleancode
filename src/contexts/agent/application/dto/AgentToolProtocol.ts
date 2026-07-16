import type {
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot
} from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'

export interface AgentToolDefinition {
  readonly annotations: AgentToolAnnotations
  readonly name: AgentToolName
  readonly description: string
  readonly inputSchema: AgentToolInputSchema
  readonly requiresApproval: boolean
}

interface AgentToolAnnotations {
  readonly destructiveHint: boolean
  readonly openWorldHint: boolean
  readonly readOnlyHint: boolean
}

type AgentToolInputSchema = Record<string, unknown>

export const cleancodeMcpDeveloperInstructions = [
  'CleanCode canvas routing is mandatory while the built-in cleancode MCP server is enabled. Treat unqualified requests about “终端”, “整理终端”, “终端布局”, “终端组合”, and specifically “启动项目的终端组合” as requests to create or modify persisted CleanCode canvas terminal blocks and groups, not as requests to run project processes directly.',
  'Call inspect_graph before reading repository files or using shell commands. You may inspect repository files after inspect_graph only to determine launch commands. Complete canvas creation with create_block as needed and create_terminal_group. Never use shell processes, package scripts, .vscode tasks, aliases, or project configuration as a substitute for CleanCode canvas objects.',
  'The current CleanCode MCP has no tool that starts a canvas terminal or terminal group. Do not claim that a created group or its member terminals were started. Only interpret the request as source-code implementation work when the user explicitly names terminal source code, a Terminal component, xterm, PTY, or terminal module implementation.'
].join('\n')

export const cleancodeMcpInstructions = [
  'CleanCode canvas scope / CleanCode 画布语义：while this MCP server is enabled, unqualified requests such as “终端”, “整理终端”, “终端布局”, “终端组合”, terminal organization, or terminal layout mean CleanCode canvas terminal blocks and groups, not repository code. Call inspect_graph before reading or searching repository files. Only treat explicit source-code terms such as “终端源码”, “Terminal component”, xterm, PTY, or terminal module implementation as project-code work.',
  'For canvas work, call inspect_graph before changes, create terminal blocks with create_block, then group existing block ids with create_terminal_group. Do not create .vscode/tasks.json, package scripts, shell aliases, or project config as a substitute for CleanCode canvas objects. CleanCode MCP tools are pre-approved at the Codex MCP layer. This does not change the global Codex sandbox or approval policy for shell commands, files, Git, network access, or other MCP servers. Deletion tools still require independent CleanCode UI approval.'
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

export const agentToolDefinitions: readonly AgentToolDefinition[] = [
  {
    annotations: readOnlyToolAnnotations,
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
    annotations: nonDestructiveWriteToolAnnotations,
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
    annotations: nonDestructiveWriteToolAnnotations,
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
    annotations: destructiveWriteToolAnnotations,
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
    annotations: nonDestructiveWriteToolAnnotations,
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
    annotations: nonDestructiveWriteToolAnnotations,
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
    annotations: destructiveWriteToolAnnotations,
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
