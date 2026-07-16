import type { BlockGraphSnapshot } from '../../../block-graph/application/dto/BlockGraphSnapshot'
import { createUnexpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { AgentAuditRecord } from '../../domain/entities/AgentAuditRecord'
import { AgentToolApprovalPolicy } from '../../domain/policies/AgentToolApprovalPolicy'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type {
  AgentToolOutput,
  AgentToolContext,
  CreateBlockAgentToolInput,
  CreateTerminalGroupAgentToolInput,
  DeleteBlockAgentToolInput,
  DeleteTerminalGroupAgentToolInput,
  InspectGraphAgentToolInput,
  UpdateBlockAgentToolInput,
  UpdateTerminalGroupAgentToolInput
} from '../dto/AgentToolProtocol'
import type { AgentAuditRepository } from '../ports/AgentAuditRepository'
import type { AgentBlockGraphToolPort } from '../ports/AgentBlockGraphToolPort'
import type { AgentToolApprovalTarget } from '../dto/AgentSessionProtocol'

interface ExecuteAgentToolBaseCommand {
  readonly approved?: boolean
  readonly projectDirectory: string
  readonly sessionId: string
  readonly workspaceName: string
}

export type ExecuteAgentToolCommand =
  | (ExecuteAgentToolBaseCommand & {
      readonly input: InspectGraphAgentToolInput
      readonly toolName: 'inspect_graph'
    })
  | (ExecuteAgentToolBaseCommand & {
      readonly input: CreateBlockAgentToolInput
      readonly toolName: 'create_block'
    })
  | (ExecuteAgentToolBaseCommand & {
      readonly input: UpdateBlockAgentToolInput
      readonly toolName: 'update_block'
    })
  | (ExecuteAgentToolBaseCommand & {
      readonly input: DeleteBlockAgentToolInput
      readonly toolName: 'delete_block'
    })
  | (ExecuteAgentToolBaseCommand & {
      readonly input: CreateTerminalGroupAgentToolInput
      readonly toolName: 'create_terminal_group'
    })
  | (ExecuteAgentToolBaseCommand & {
      readonly input: UpdateTerminalGroupAgentToolInput
      readonly toolName: 'update_terminal_group'
    })
  | (ExecuteAgentToolBaseCommand & {
      readonly input: DeleteTerminalGroupAgentToolInput
      readonly toolName: 'delete_terminal_group'
    })

export type AgentToolExecutionResult =
  | {
      readonly approval: {
        readonly summary: string
        readonly target: AgentToolApprovalTarget
        readonly toolName: AgentToolName
      }
      readonly status: 'awaiting_approval'
      readonly toolCallId: string
    }
  | {
      readonly output: AgentToolOutput
      readonly status: 'canceled'
      readonly toolCallId: string
    }
  | {
      readonly graph: BlockGraphSnapshot
      readonly output: AgentToolOutput
      readonly status: 'completed'
      readonly toolCallId: string
    }

export class ExecuteAgentToolUseCase {
  private readonly approvalPolicy = new AgentToolApprovalPolicy()

  constructor(
    private readonly blockGraphTools: AgentBlockGraphToolPort,
    private readonly auditRepository: AgentAuditRepository
  ) {}

  async execute(command: ExecuteAgentToolCommand): Promise<AgentToolExecutionResult> {
    const toolCallId = createAgentToolCallId()
    const requiresApproval = this.approvalPolicy.requiresApproval(command.toolName)

    if (requiresApproval && command.approved !== true) {
      await this.recordAudit(command, toolCallId, requiresApproval, 'awaiting_approval')

      return {
        approval: {
          summary: createApprovalSummary(command),
          target: createApprovalTarget(command),
          toolName: command.toolName
        },
        status: 'awaiting_approval',
        toolCallId
      }
    }

    await this.recordAudit(command, toolCallId, requiresApproval, 'started')

    try {
      const result = await this.executeApprovedTool(command)
      await this.recordAudit(command, toolCallId, requiresApproval, 'completed')
      return { ...result, status: 'completed', toolCallId }
    } catch (error) {
      await this.recordAudit(command, toolCallId, requiresApproval, 'failed')
      throw error
    }
  }

  private async executeApprovedTool(command: ExecuteAgentToolCommand): Promise<{
    readonly graph: BlockGraphSnapshot
    readonly output: AgentToolOutput
  }> {
    const context: AgentToolContext = {
      projectDirectory: command.projectDirectory,
      workspaceName: command.workspaceName
    }

    switch (command.toolName) {
      case 'inspect_graph':
        return {
          graph: await this.blockGraphTools.inspectGraph(context),
          output: { type: 'block_graph' }
        }
      case 'create_block':
        return this.createTerminalBlock(context, command.input)
      case 'update_block':
        return {
          graph: await this.blockGraphTools.updateTerminalBlock(context, command.input),
          output: { type: 'block_graph' }
        }
      case 'delete_block':
        return {
          graph: await this.blockGraphTools.deleteTerminalBlock(context, command.input),
          output: { type: 'block_graph' }
        }
      case 'create_terminal_group':
        return this.createTerminalGroup(context, command.input)
      case 'update_terminal_group':
        return {
          graph: await this.blockGraphTools.updateTerminalGroup(context, command.input),
          output: { type: 'block_graph' }
        }
      case 'delete_terminal_group':
        return {
          graph: await this.blockGraphTools.deleteTerminalGroup(context, command.input),
          output: { type: 'block_graph' }
        }
    }
  }

  private async createTerminalBlock(
    context: AgentToolContext,
    input: CreateBlockAgentToolInput
  ): Promise<{
    readonly graph: BlockGraphSnapshot
    readonly output: AgentToolOutput
  }> {
    const beforeGraph = await this.blockGraphTools.inspectGraph(context)
    const graph = await this.blockGraphTools.createTerminalBlock(context, input)

    return {
      graph,
      output: {
        createdBlockId: findNewTerminalBlockId(beforeGraph, graph),
        type: 'block_graph'
      }
    }
  }

  private async createTerminalGroup(
    context: AgentToolContext,
    input: CreateTerminalGroupAgentToolInput
  ): Promise<{
    readonly graph: BlockGraphSnapshot
    readonly output: AgentToolOutput
  }> {
    const beforeGraph = await this.blockGraphTools.inspectGraph(context)
    const graph = await this.blockGraphTools.createTerminalGroup(context, input)

    return {
      graph,
      output: {
        createdTerminalGroupId: findNewTerminalGroupId(beforeGraph, graph),
        type: 'block_graph'
      }
    }
  }

  private async recordAudit(
    command: ExecuteAgentToolCommand,
    toolCallId: string,
    requiresApproval: boolean,
    status: AgentAuditRecord['status']
  ): Promise<void> {
    await this.auditRepository.append({
      createdAt: new Date().toISOString(),
      id: toolCallId,
      input: command.input,
      projectDirectory: command.projectDirectory,
      requiresApproval,
      sessionId: command.sessionId,
      status,
      toolName: command.toolName,
      workspaceName: command.workspaceName
    })
  }
}

function createApprovalTarget(command: ExecuteAgentToolCommand): AgentToolApprovalTarget {
  if (command.toolName === 'delete_block') {
    return { blockId: command.input.blockId, kind: 'terminal_block' }
  }

  if (command.toolName === 'delete_terminal_group') {
    return { kind: 'terminal_group', terminalGroupId: command.input.terminalGroupId }
  }

  throw createUnexpectedAppError('Approval target is not defined for this Agent tool.', {
    toolName: command.toolName
  })
}

function createApprovalSummary(command: ExecuteAgentToolCommand): string {
  if (command.toolName === 'delete_block') {
    return `删除终端积木 ${command.input.blockId}`
  }

  if (command.toolName === 'delete_terminal_group') {
    return `删除组合终端 ${command.input.terminalGroupId}`
  }

  return command.toolName
}

function createAgentToolCallId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-tool-${Date.now()}-${Math.random()}`
}

function findNewTerminalBlockId(
  beforeGraph: BlockGraphSnapshot,
  afterGraph: BlockGraphSnapshot
): string | undefined {
  const previousBlockIds = new Set(beforeGraph.blocks.map((block) => block.id))

  return afterGraph.blocks.find((block) => !previousBlockIds.has(block.id))?.id
}

function findNewTerminalGroupId(
  beforeGraph: BlockGraphSnapshot,
  afterGraph: BlockGraphSnapshot
): string | undefined {
  const previousTerminalGroupIds = new Set(beforeGraph.terminalGroups.map((group) => group.id))

  return afterGraph.terminalGroups.find((group) => !previousTerminalGroupIds.has(group.id))?.id
}
