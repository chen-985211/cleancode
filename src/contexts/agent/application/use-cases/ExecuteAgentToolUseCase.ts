import type { BlockGraphSnapshot } from '../../../block-graph/application/dto/BlockGraphSnapshot'
import {
  createExpectedAppError,
  createUnexpectedAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type { AgentAuditRecord } from '../../domain/entities/AgentAuditRecord'
import { AgentToolApprovalPolicy } from '../../domain/policies/AgentToolApprovalPolicy'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type {
  AgentToolContext,
  AgentToolInputByName,
  AgentToolOutput,
  AgentToolStructuredContent
} from '../dto/AgentToolProtocol'
import { createAgentToolFailedResult } from '../dto/AgentToolFailure'
import { parseAgentToolInput } from '../dto/AgentToolInputValidation'
import type { AgentToolApprovalTarget } from '../dto/AgentSessionProtocol'
import type { AgentAuditRepository } from '../ports/AgentAuditRepository'
import type { AgentBlockGraphToolPort } from '../ports/AgentBlockGraphToolPort'
import type { AgentCanvasLayoutRegion } from '../ports/AgentBlockGraphToolPort'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'

export interface ExecuteAgentToolCommand {
  readonly agentId: string
  readonly approved?: boolean
  readonly input: unknown
  readonly projectDirectory: string
  readonly projectId: string
  readonly sessionId: string
  readonly toolCallId: string
  readonly toolName: AgentToolName
  readonly workspaceName: string
}

type AwaitingAgentToolApprovalResult = {
  readonly approval: {
    readonly summary: string
    readonly target: AgentToolApprovalTarget
    readonly toolName: AgentToolName
  }
  readonly status: 'awaiting_approval'
  readonly toolCallId: string
}

export type AgentToolExecutionResult = AwaitingAgentToolApprovalResult | AgentToolStructuredContent

type ParsedAgentToolInvocation = {
  [Name in AgentToolName]: {
    readonly input: AgentToolInputByName[Name]
    readonly toolName: Name
  }
}[AgentToolName]

type CompletedGraphToolResult = Extract<
  AgentToolStructuredContent,
  { readonly graph: BlockGraphSnapshot; readonly status: 'completed' }
>

export class ExecuteAgentToolUseCase {
  private readonly approvalPolicy = new AgentToolApprovalPolicy()

  constructor(
    private readonly blockGraphTools: AgentBlockGraphToolPort,
    private readonly auditRepository: AgentAuditRepository,
    private readonly agentSessionRepository: AgentSessionRepository
  ) {}

  async execute(command: ExecuteAgentToolCommand): Promise<AgentToolExecutionResult> {
    const requiresApproval = this.approvalPolicy.requiresApproval(command.toolName)
    let invocation: ParsedAgentToolInvocation

    try {
      invocation = parseAgentToolInvocation(command)
    } catch (error) {
      return this.fail(command, requiresApproval, error)
    }

    if (requiresApproval && command.approved !== true) {
      await this.recordAudit(command, requiresApproval, 'awaiting_approval')
      return {
        approval: {
          summary: createApprovalSummary(invocation),
          target: createApprovalTarget(invocation),
          toolName: invocation.toolName
        },
        status: 'awaiting_approval',
        toolCallId: command.toolCallId
      }
    }

    await this.recordAudit(command, requiresApproval, 'started')

    let result: Extract<AgentToolStructuredContent, { readonly status: 'completed' }>
    try {
      result = await this.executeApprovedTool(command, invocation)
    } catch (error) {
      return this.fail(command, requiresApproval, error)
    }

    try {
      await this.recordAudit(command, requiresApproval, 'completed')
    } catch {
      // The graph commit is authoritative; an audit projection failure must not invite a retry.
    }
    return result
  }

  async cancel(
    command: ExecuteAgentToolCommand,
    reason: string
  ): Promise<AgentToolExecutionResult> {
    await this.recordAudit(
      command,
      this.approvalPolicy.requiresApproval(command.toolName),
      'canceled'
    )
    return {
      output: { reason, type: 'tool_canceled' },
      status: 'canceled',
      toolCallId: command.toolCallId
    }
  }

  private async executeApprovedTool(
    command: ExecuteAgentToolCommand,
    invocation: ParsedAgentToolInvocation
  ): Promise<Extract<AgentToolStructuredContent, { readonly status: 'completed' }>> {
    const context: AgentToolContext = {
      projectDirectory: command.projectDirectory,
      workspaceName: command.workspaceName
    }

    switch (invocation.toolName) {
      case 'inspect_graph':
        return completedGraphResult(
          command.toolCallId,
          await this.blockGraphTools.inspectGraph(context),
          { type: 'block_graph' },
          false
        )
      case 'create_block':
        return this.createTerminalBlock(command, context, invocation.input)
      case 'update_block':
        return completedGraphResult(
          command.toolCallId,
          await this.blockGraphTools.updateTerminalBlock(context, invocation.input),
          { type: 'block_graph' }
        )
      case 'delete_block':
        return completedGraphResult(
          command.toolCallId,
          await this.blockGraphTools.deleteTerminalBlock(context, invocation.input),
          { type: 'block_graph' }
        )
      case 'create_terminal_group':
        return this.createTerminalGroup(command.toolCallId, context, invocation.input)
      case 'update_terminal_group':
        return completedGraphResult(
          command.toolCallId,
          await this.blockGraphTools.updateTerminalGroup(context, invocation.input),
          { type: 'block_graph' }
        )
      case 'delete_terminal_group':
        return completedGraphResult(
          command.toolCallId,
          await this.blockGraphTools.deleteTerminalGroup(context, invocation.input),
          { type: 'block_graph' }
        )
      case 'update_terminal_execution_config':
        return completedGraphResult(
          command.toolCallId,
          await this.blockGraphTools.updateTerminalExecutionConfig(context, invocation.input),
          { type: 'block_graph' }
        )
      case 'connect_terminal_blocks': {
        const result = await this.blockGraphTools.connectTerminalBlocks(context, invocation.input)
        return completedGraphResult(command.toolCallId, result.graph, {
          connectionId: result.connectionId,
          type: 'block_graph'
        })
      }
      case 'disconnect_terminal_blocks':
        return completedGraphResult(
          command.toolCallId,
          await this.blockGraphTools.disconnectTerminalBlocks(context, invocation.input),
          { type: 'block_graph' }
        )
      case 'inspect_terminal_workflow_plan':
        return {
          graphChanged: false,
          output: {
            plan: await this.blockGraphTools.inspectTerminalWorkflowPlan(context, invocation.input),
            type: 'terminal_workflow_plan'
          },
          status: 'completed',
          toolCallId: command.toolCallId
        }
      case 'arrange_terminal_layout': {
        const layout = await this.resolveWorkspaceLayout(command)
        const result = await this.blockGraphTools.arrangeTerminalLayout(context, {
          ...invocation.input,
          ...layout
        })
        return completedGraphResult(
          command.toolCallId,
          result.graph,
          {
            arrangedBlockIds: result.arrangedBlockIds,
            arrangedTerminalGroupIds: result.arrangedTerminalGroupIds,
            type: 'block_graph'
          },
          result.graphChanged
        )
      }
    }
  }

  private async createTerminalBlock(
    command: ExecuteAgentToolCommand,
    context: AgentToolContext,
    input: AgentToolInputByName['create_block']
  ): Promise<CompletedGraphToolResult> {
    const beforeGraph = await this.blockGraphTools.inspectGraph(context)
    const graph = await this.blockGraphTools.createTerminalBlock(
      context,
      input.position
        ? input
        : {
            ...input,
            ...(await this.resolveWorkspaceLayout(command))
          }
    )
    return completedGraphResult(command.toolCallId, graph, {
      createdBlockId: findNewTerminalBlockId(beforeGraph, graph),
      type: 'block_graph'
    })
  }

  private async resolveWorkspaceLayout(command: ExecuteAgentToolCommand): Promise<{
    readonly anchorRegion: AgentCanvasLayoutRegion
    readonly reservedRegions: readonly AgentCanvasLayoutRegion[]
  }> {
    const agents =
      (await this.agentSessionRepository.findWorkspace(command.projectId, command.workspaceName)) ??
      []
    const activeAgent = agents.find((agent) => agent.id === command.agentId)

    if (!activeAgent) {
      throw createExpectedAppError(
        'AGENT_SESSION_NOT_FOUND',
        'The active Agent layout was not found.'
      )
    }

    return {
      anchorRegion: toCanvasLayoutRegion(activeAgent.layout),
      reservedRegions: agents
        .filter((agent) => agent.id !== activeAgent.id)
        .map((agent) => toCanvasLayoutRegion(agent.layout))
    }
  }

  private async createTerminalGroup(
    toolCallId: string,
    context: AgentToolContext,
    input: AgentToolInputByName['create_terminal_group']
  ): Promise<CompletedGraphToolResult> {
    const beforeGraph = await this.blockGraphTools.inspectGraph(context)
    const graph = await this.blockGraphTools.createTerminalGroup(context, input)
    return completedGraphResult(toolCallId, graph, {
      createdTerminalGroupId: findNewTerminalGroupId(beforeGraph, graph),
      type: 'block_graph'
    })
  }

  private async fail(
    command: ExecuteAgentToolCommand,
    requiresApproval: boolean,
    error: unknown
  ): Promise<AgentToolExecutionResult> {
    await this.recordAudit(command, requiresApproval, 'failed')
    return createAgentToolFailedResult(command.toolCallId, error)
  }

  private async recordAudit(
    command: ExecuteAgentToolCommand,
    requiresApproval: boolean,
    status: AgentAuditRecord['status']
  ): Promise<void> {
    await this.auditRepository.append({
      createdAt: new Date().toISOString(),
      id: command.toolCallId,
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

function parseAgentToolInvocation(command: ExecuteAgentToolCommand): ParsedAgentToolInvocation {
  return {
    input: parseAgentToolInput(command.toolName, command.input),
    toolName: command.toolName
  } as ParsedAgentToolInvocation
}

function createApprovalTarget(invocation: ParsedAgentToolInvocation): AgentToolApprovalTarget {
  if (invocation.toolName === 'delete_block') {
    return { blockId: invocation.input.blockId, kind: 'terminal_block' }
  }
  if (invocation.toolName === 'delete_terminal_group') {
    return { kind: 'terminal_group', terminalGroupId: invocation.input.terminalGroupId }
  }
  if (invocation.toolName === 'disconnect_terminal_blocks') {
    return { connectionId: invocation.input.connectionId, kind: 'terminal_connection' }
  }
  throw createUnexpectedAppError('Approval target is not defined for this Agent tool.', {
    toolName: invocation.toolName
  })
}

function createApprovalSummary(invocation: ParsedAgentToolInvocation): string {
  if (invocation.toolName === 'delete_block') {
    return `删除终端积木 ${invocation.input.blockId}`
  }
  if (invocation.toolName === 'delete_terminal_group') {
    return `删除组合终端 ${invocation.input.terminalGroupId}`
  }
  if (invocation.toolName === 'disconnect_terminal_blocks') {
    return `断开终端依赖 ${invocation.input.connectionId}`
  }
  return invocation.toolName
}

function completedGraphResult(
  toolCallId: string,
  graph: BlockGraphSnapshot,
  output: Extract<AgentToolOutput, { readonly type: 'block_graph' }>,
  graphChanged = true
): CompletedGraphToolResult {
  return { graph, graphChanged, output, status: 'completed', toolCallId }
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

function toCanvasLayoutRegion(layout: AgentCanvasLayoutRegion): AgentCanvasLayoutRegion {
  return {
    position: { ...layout.position },
    size: { ...layout.size }
  }
}
