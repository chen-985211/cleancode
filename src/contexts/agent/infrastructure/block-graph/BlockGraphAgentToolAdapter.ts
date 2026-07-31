import {
  createExpectedAppError,
  createUnexpectedAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalWorkflowPlanSnapshot } from '../../../block-graph/application/dto/TerminalWorkflowPlanSnapshot'
import type {
  CreateTerminalWorkflowCommand,
  CreateTerminalWorkflowResult
} from '../../../block-graph/application/use-cases/CreateTerminalWorkflowUseCase'
import type { AgentBlockGraphSnapshot } from '../../application/dto/AgentBlockGraphProtocol'
import type {
  AgentArrangeTerminalLayoutInput,
  AgentArrangeTerminalLayoutResult,
  AgentBlockGraphToolPort,
  AgentConnectTerminalBlocksInput,
  AgentConnectTerminalBlocksResult,
  AgentCreateTerminalBlockInput,
  AgentCreateTerminalWorkflowInput,
  AgentCreateTerminalWorkflowResult,
  AgentDisconnectTerminalBlocksInput,
  AgentInspectTerminalWorkflowPlanInput,
  AgentUpdateTerminalExecutionConfigInput
} from '../../application/ports/AgentBlockGraphToolPort'
import type {
  AgentTerminalExecutionConfigSnapshot,
  AgentTerminalWorkflowPlanSnapshot
} from '../../application/dto/AgentTerminalWorkflowProtocol'
import type {
  AgentToolContext,
  CreateTerminalGroupAgentToolInput,
  DeleteBlockAgentToolInput,
  DeleteTerminalGroupAgentToolInput,
  UpdateBlockAgentToolInput,
  UpdateTerminalGroupAgentToolInput
} from '../../application/dto/AgentToolProtocol'

export interface BlockGraphAgentToolAdapterInput {
  readonly arrangeTerminalLayout: (
    command: AgentToolContext & AgentArrangeTerminalLayoutInput
  ) => Promise<{
    readonly arrangedBlockIds: readonly string[]
    readonly arrangedTerminalGroupIds: readonly string[]
    readonly graph: BlockGraphSnapshot
    readonly graphChanged: boolean
  }>
  readonly buildTerminalWorkflowPlan: (
    query: AgentToolContext & { readonly scope: AgentInspectTerminalWorkflowPlanInput['scope'] }
  ) => Promise<TerminalWorkflowPlanSnapshot>
  readonly connectTerminalBlocks: (
    command: AgentToolContext & AgentConnectTerminalBlocksInput
  ) => Promise<BlockGraphSnapshot>
  readonly createTerminalBlock: (command: {
    readonly anchorRegion?: AgentCreateTerminalBlockInput['anchorRegion']
    readonly description: string
    readonly launchCommand?: string
    readonly name: string
    readonly position?: BlockPositionSnapshot
    readonly projectDirectory: string
    readonly reservedRegions?: AgentCreateTerminalBlockInput['reservedRegions']
    readonly size?: TerminalBlockSizeSnapshot
    readonly workspaceId: string
  }) => Promise<BlockGraphSnapshot>
  readonly createTerminalWorkflow: (
    command: CreateTerminalWorkflowCommand
  ) => Promise<CreateTerminalWorkflowResult>
  readonly createTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly name: string
    readonly memberBlockIds: readonly string[]
  }) => Promise<BlockGraphSnapshot>
  readonly deleteBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
  }) => Promise<BlockGraphSnapshot>
  readonly dissolveTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
  }) => Promise<BlockGraphSnapshot>
  readonly disconnectTerminalBlocks: (
    command: AgentToolContext & AgentDisconnectTerminalBlocksInput
  ) => Promise<BlockGraphSnapshot>
  readonly getDefaultGraph: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
  }) => Promise<BlockGraphSnapshot>
  readonly moveBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly position: BlockPositionSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly moveTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly position: BlockPositionSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly resizeTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly position: BlockPositionSnapshot
    readonly size: TerminalBlockSizeSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly setTerminalGroupCollapsed: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly isCollapsed: boolean
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalBlockMetadata: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly name: string
    readonly description: string
    readonly launchCommand: string
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalExecutionConfig: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly executionConfig: TerminalExecutionConfigSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalGroupMetadata: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly name: string
  }) => Promise<BlockGraphSnapshot>
}

export class BlockGraphAgentToolAdapter implements AgentBlockGraphToolPort {
  constructor(private readonly tools: BlockGraphAgentToolAdapterInput) {}

  async arrangeTerminalLayout(
    context: AgentToolContext,
    input: AgentArrangeTerminalLayoutInput
  ): Promise<AgentArrangeTerminalLayoutResult> {
    const result = await this.tools.arrangeTerminalLayout({ ...context, ...input })
    return { ...result, graph: toAgentBlockGraphSnapshot(result.graph) }
  }

  async inspectGraph(context: AgentToolContext): Promise<AgentBlockGraphSnapshot> {
    return toAgentBlockGraphSnapshot(await this.tools.getDefaultGraph(context))
  }

  async createTerminalBlock(
    context: AgentToolContext,
    input: AgentCreateTerminalBlockInput
  ): Promise<AgentBlockGraphSnapshot> {
    return toAgentBlockGraphSnapshot(
      await this.tools.createTerminalBlock({
        ...context,
        ...(input.anchorRegion ? { anchorRegion: input.anchorRegion } : {}),
        description: input.description ?? '',
        ...(input.launchCommand !== undefined ? { launchCommand: input.launchCommand } : {}),
        name: input.name,
        ...(input.position ? { position: input.position } : {}),
        ...(input.reservedRegions ? { reservedRegions: input.reservedRegions } : {}),
        ...(input.size ? { size: input.size } : {})
      })
    )
  }

  async createTerminalWorkflow(
    context: AgentToolContext,
    input: AgentCreateTerminalWorkflowInput
  ): Promise<AgentCreateTerminalWorkflowResult> {
    const result = await this.tools.createTerminalWorkflow({
      ...context,
      anchorRegion: input.anchorRegion,
      connections: input.connections.map((connection) => ({ ...connection })),
      reservedRegions: input.reservedRegions,
      ...(input.terminalGroup
        ? {
            terminalGroup: {
              memberRefs: [...input.terminalGroup.memberRefs],
              name: input.terminalGroup.name
            }
          }
        : {}),
      terminals: input.terminals.map((terminal) => ({
        description: terminal.description ?? '',
        ...(terminal.executionConfig
          ? {
              executionConfig: toBlockGraphTerminalExecutionConfig(terminal.executionConfig)
            }
          : {}),
        launchCommand: terminal.launchCommand,
        name: terminal.name,
        ref: terminal.ref,
        ...(terminal.size ? { size: terminal.size } : {})
      }))
    })

    return {
      arrangedBlockIds: [...result.arrangedBlockIds],
      arrangedTerminalGroupIds: [...result.arrangedTerminalGroupIds],
      createdConnections: result.createdConnections.map((connection) => ({ ...connection })),
      createdTerminalGroupId: result.createdTerminalGroupId,
      createdTerminals: result.createdTerminals.map((terminal) => ({ ...terminal })),
      graph: toAgentBlockGraphSnapshot(result.graph),
      plan: toAgentTerminalWorkflowPlan(result.plan)
    }
  }

  async updateTerminalBlock(
    context: AgentToolContext,
    input: UpdateBlockAgentToolInput
  ): Promise<AgentBlockGraphSnapshot> {
    let graph = await this.tools.getDefaultGraph(context)
    const block = graph.blocks.find((candidateBlock) => candidateBlock.id === input.blockId)

    if (!block) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }

    if (
      input.name !== undefined ||
      input.description !== undefined ||
      input.launchCommand !== undefined
    ) {
      graph = await this.tools.updateTerminalBlockMetadata({
        ...context,
        blockId: input.blockId,
        description: input.description ?? block.description,
        launchCommand: input.launchCommand ?? block.launchCommand,
        name: input.name ?? block.name
      })
    }

    if (input.position) {
      graph = await this.tools.moveBlock({
        ...context,
        blockId: input.blockId,
        position: input.position
      })
    }

    if (input.size) {
      const resizedBlock = requireTerminalBlock(graph, input.blockId)
      graph = await this.tools.resizeTerminalBlock({
        ...context,
        blockId: input.blockId,
        position: resizedBlock.position,
        size: input.size
      })
    }

    return toAgentBlockGraphSnapshot(graph)
  }

  async deleteTerminalBlock(
    context: AgentToolContext,
    input: DeleteBlockAgentToolInput
  ): Promise<AgentBlockGraphSnapshot> {
    return toAgentBlockGraphSnapshot(
      await this.tools.deleteBlock({ ...context, blockId: input.blockId })
    )
  }

  async createTerminalGroup(
    context: AgentToolContext,
    input: CreateTerminalGroupAgentToolInput
  ): Promise<AgentBlockGraphSnapshot> {
    return toAgentBlockGraphSnapshot(
      await this.tools.createTerminalGroup({
        ...context,
        memberBlockIds: input.memberBlockIds,
        name: input.name
      })
    )
  }

  async updateTerminalGroup(
    context: AgentToolContext,
    input: UpdateTerminalGroupAgentToolInput
  ): Promise<AgentBlockGraphSnapshot> {
    let graph = await this.tools.getDefaultGraph(context)

    if (input.name !== undefined) {
      graph = await this.tools.updateTerminalGroupMetadata({
        ...context,
        name: input.name,
        terminalGroupId: input.terminalGroupId
      })
    }

    if (input.isCollapsed !== undefined) {
      graph = await this.tools.setTerminalGroupCollapsed({
        ...context,
        isCollapsed: input.isCollapsed,
        terminalGroupId: input.terminalGroupId
      })
    }

    if (input.position) {
      graph = await this.tools.moveTerminalGroup({
        ...context,
        position: input.position,
        terminalGroupId: input.terminalGroupId
      })
    }

    return toAgentBlockGraphSnapshot(graph)
  }

  async deleteTerminalGroup(
    context: AgentToolContext,
    input: DeleteTerminalGroupAgentToolInput
  ): Promise<AgentBlockGraphSnapshot> {
    return toAgentBlockGraphSnapshot(
      await this.tools.dissolveTerminalGroup({
        ...context,
        terminalGroupId: input.terminalGroupId
      })
    )
  }

  async updateTerminalExecutionConfig(
    context: AgentToolContext,
    input: AgentUpdateTerminalExecutionConfigInput
  ): Promise<AgentBlockGraphSnapshot> {
    return toAgentBlockGraphSnapshot(
      await this.tools.updateTerminalExecutionConfig({
        ...context,
        blockId: input.blockId,
        executionConfig: toBlockGraphTerminalExecutionConfig(input.executionConfig)
      })
    )
  }

  async connectTerminalBlocks(
    context: AgentToolContext,
    input: AgentConnectTerminalBlocksInput
  ): Promise<AgentConnectTerminalBlocksResult> {
    const graph = await this.tools.connectTerminalBlocks({ ...context, ...input })
    const connection = (graph.connections ?? []).find(
      (candidate) =>
        candidate.sourceBlockId === input.sourceBlockId &&
        candidate.targetBlockId === input.targetBlockId
    )

    if (!connection) {
      throw createUnexpectedAppError('Created terminal connection was not returned by the graph.', {
        sourceBlockId: input.sourceBlockId,
        targetBlockId: input.targetBlockId
      })
    }

    return { connectionId: connection.id, graph: toAgentBlockGraphSnapshot(graph) }
  }

  async disconnectTerminalBlocks(
    context: AgentToolContext,
    input: AgentDisconnectTerminalBlocksInput
  ): Promise<AgentBlockGraphSnapshot> {
    return toAgentBlockGraphSnapshot(
      await this.tools.disconnectTerminalBlocks({ ...context, ...input })
    )
  }

  async inspectTerminalWorkflowPlan(
    context: AgentToolContext,
    input: AgentInspectTerminalWorkflowPlanInput
  ): Promise<AgentTerminalWorkflowPlanSnapshot> {
    return toAgentTerminalWorkflowPlan(
      await this.tools.buildTerminalWorkflowPlan({
        ...context,
        scope:
          input.scope.type === 'full'
            ? { type: 'full' }
            : { blockId: input.scope.blockId, type: 'from-block' }
      })
    )
  }
}

function requireTerminalBlock(
  graph: BlockGraphSnapshot,
  blockId: string
): BlockGraphSnapshot['blocks'][number] {
  const block = graph.blocks.find((candidate) => candidate.id === blockId)

  if (!block) {
    throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
  }

  return block
}

function toAgentBlockGraphSnapshot(graph: BlockGraphSnapshot): AgentBlockGraphSnapshot {
  return {
    blocks: graph.blocks.map((block) => ({
      description: block.description,
      ...(block.executionConfig
        ? { executionConfig: toAgentTerminalExecutionConfig(block.executionConfig) }
        : {}),
      id: block.id,
      launchCommand: block.launchCommand,
      name: block.name,
      position: { ...block.position },
      size: { ...block.size },
      type: 'terminal'
    })),
    connections: (graph.connections ?? []).map((connection) => ({ ...connection })),
    id: graph.id,
    projectId: graph.projectId,
    terminalGroups: graph.terminalGroups.map((group) => ({
      ...group,
      memberBlockIds: [...group.memberBlockIds],
      position: { ...group.position },
      size: { ...group.size }
    })),
    viewport: { ...graph.viewport },
    workspaceId: graph.workspaceId
  }
}

function toAgentTerminalWorkflowPlan(
  plan: TerminalWorkflowPlanSnapshot
): AgentTerminalWorkflowPlanSnapshot {
  return {
    graphId: plan.graphId,
    nodes: plan.nodes.map((node) => ({
      blockId: node.blockId,
      dependencyBlockIds: [...node.dependencyBlockIds],
      executionConfig: toAgentTerminalExecutionConfig(node.executionConfig),
      launchCommand: node.launchCommand,
      name: node.name
    })),
    workspaceId: plan.workspaceId
  }
}

function toAgentTerminalExecutionConfig(
  config: TerminalExecutionConfigSnapshot
): AgentTerminalExecutionConfigSnapshot {
  if (config.mode === 'task') {
    return {
      mode: 'task',
      successExitCodes: [...config.successExitCodes],
      timeoutMs: config.timeoutMs
    }
  }

  return {
    mode: 'service',
    ...(config.port
      ? {
          port: {
            binding: { ...config.port.binding },
            policy: { ...config.port.policy },
            protocol: config.port.protocol
          }
        }
      : {}),
    readiness: { ...config.readiness },
    readinessTimeoutMs: config.readinessTimeoutMs
  }
}

function toBlockGraphTerminalExecutionConfig(
  config: AgentTerminalExecutionConfigSnapshot
): TerminalExecutionConfigSnapshot {
  if (config.mode === 'task') {
    return {
      mode: 'task',
      successExitCodes: [...config.successExitCodes],
      timeoutMs: config.timeoutMs
    }
  }

  return {
    mode: 'service',
    ...(config.port
      ? {
          port: {
            binding: { ...config.port.binding },
            policy: { ...config.port.policy },
            protocol: config.port.protocol
          }
        }
      : {}),
    readiness: { ...config.readiness },
    readinessTimeoutMs: config.readinessTimeoutMs
  }
}
