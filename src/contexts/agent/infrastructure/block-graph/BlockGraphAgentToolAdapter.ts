import {
  createExpectedAppError,
  createUnexpectedAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  TerminalBlockSizeSnapshot
} from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type {
  AgentBlockGraphToolPort,
  AgentConnectTerminalBlocksInput,
  AgentConnectTerminalBlocksResult,
  AgentDisconnectTerminalBlocksInput,
  AgentInspectTerminalWorkflowPlanInput,
  AgentUpdateTerminalExecutionConfigInput
} from '../../application/ports/AgentBlockGraphToolPort'
import type { AgentTerminalWorkflowPlanSnapshot } from '../../application/dto/AgentTerminalWorkflowProtocol'
import type {
  AgentToolContext,
  CreateBlockAgentToolInput,
  CreateTerminalGroupAgentToolInput,
  DeleteBlockAgentToolInput,
  DeleteTerminalGroupAgentToolInput,
  UpdateBlockAgentToolInput,
  UpdateTerminalGroupAgentToolInput
} from '../../application/dto/AgentToolProtocol'

export interface BlockGraphAgentToolAdapterInput {
  readonly buildTerminalWorkflowPlan: (
    query: AgentToolContext & AgentInspectTerminalWorkflowPlanInput
  ) => Promise<AgentTerminalWorkflowPlanSnapshot>
  readonly connectTerminalBlocks: (
    command: AgentToolContext & AgentConnectTerminalBlocksInput
  ) => Promise<BlockGraphSnapshot>
  readonly createTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly name: string
    readonly description: string
    readonly position: BlockPositionSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly createTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly name: string
    readonly memberBlockIds: readonly string[]
  }) => Promise<BlockGraphSnapshot>
  readonly deleteBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
  }) => Promise<BlockGraphSnapshot>
  readonly dissolveTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly terminalGroupId: string
  }) => Promise<BlockGraphSnapshot>
  readonly disconnectTerminalBlocks: (
    command: AgentToolContext & AgentDisconnectTerminalBlocksInput
  ) => Promise<BlockGraphSnapshot>
  readonly getDefaultGraph: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }) => Promise<BlockGraphSnapshot>
  readonly moveBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
    readonly position: BlockPositionSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly moveTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly terminalGroupId: string
    readonly position: BlockPositionSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly resizeTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
    readonly position: BlockPositionSnapshot
    readonly size: TerminalBlockSizeSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly setTerminalGroupCollapsed: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly terminalGroupId: string
    readonly isCollapsed: boolean
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalBlockMetadata: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
    readonly name: string
    readonly description: string
    readonly launchCommand: string
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalExecutionConfig: (
    command: AgentToolContext & AgentUpdateTerminalExecutionConfigInput
  ) => Promise<BlockGraphSnapshot>
  readonly updateTerminalGroupMetadata: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly terminalGroupId: string
    readonly name: string
  }) => Promise<BlockGraphSnapshot>
}

export class BlockGraphAgentToolAdapter implements AgentBlockGraphToolPort {
  constructor(private readonly tools: BlockGraphAgentToolAdapterInput) {}

  inspectGraph(context: AgentToolContext): Promise<BlockGraphSnapshot> {
    return this.tools.getDefaultGraph(context)
  }

  async createTerminalBlock(
    context: AgentToolContext,
    input: CreateBlockAgentToolInput
  ): Promise<BlockGraphSnapshot> {
    const beforeGraph = await this.inspectGraph(context)
    let graph = await this.tools.createTerminalBlock({
      ...context,
      description: input.description ?? '',
      name: input.name,
      position: input.position
    })
    const createdBlock = findCreatedTerminalBlock(beforeGraph, graph)

    if (input.launchCommand !== undefined) {
      graph = await this.tools.updateTerminalBlockMetadata({
        ...context,
        blockId: createdBlock.id,
        description: createdBlock.description,
        launchCommand: input.launchCommand,
        name: createdBlock.name
      })
    }

    if (input.size) {
      graph = await this.tools.resizeTerminalBlock({
        ...context,
        blockId: createdBlock.id,
        position: createdBlock.position,
        size: input.size
      })
    }

    return graph
  }

  async updateTerminalBlock(
    context: AgentToolContext,
    input: UpdateBlockAgentToolInput
  ): Promise<BlockGraphSnapshot> {
    let graph = await this.inspectGraph(context)
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

    return graph
  }

  deleteTerminalBlock(
    context: AgentToolContext,
    input: DeleteBlockAgentToolInput
  ): Promise<BlockGraphSnapshot> {
    return this.tools.deleteBlock({ ...context, blockId: input.blockId })
  }

  createTerminalGroup(
    context: AgentToolContext,
    input: CreateTerminalGroupAgentToolInput
  ): Promise<BlockGraphSnapshot> {
    return this.tools.createTerminalGroup({
      ...context,
      memberBlockIds: input.memberBlockIds,
      name: input.name
    })
  }

  async updateTerminalGroup(
    context: AgentToolContext,
    input: UpdateTerminalGroupAgentToolInput
  ): Promise<BlockGraphSnapshot> {
    let graph = await this.inspectGraph(context)

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

    return graph
  }

  deleteTerminalGroup(
    context: AgentToolContext,
    input: DeleteTerminalGroupAgentToolInput
  ): Promise<BlockGraphSnapshot> {
    return this.tools.dissolveTerminalGroup({
      ...context,
      terminalGroupId: input.terminalGroupId
    })
  }

  updateTerminalExecutionConfig(
    context: AgentToolContext,
    input: AgentUpdateTerminalExecutionConfigInput
  ): Promise<BlockGraphSnapshot> {
    return this.tools.updateTerminalExecutionConfig({ ...context, ...input })
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

    return { connectionId: connection.id, graph }
  }

  disconnectTerminalBlocks(
    context: AgentToolContext,
    input: AgentDisconnectTerminalBlocksInput
  ): Promise<BlockGraphSnapshot> {
    return this.tools.disconnectTerminalBlocks({ ...context, ...input })
  }

  inspectTerminalWorkflowPlan(
    context: AgentToolContext,
    input: AgentInspectTerminalWorkflowPlanInput
  ): Promise<AgentTerminalWorkflowPlanSnapshot> {
    return this.tools.buildTerminalWorkflowPlan({ ...context, ...input })
  }
}

function findCreatedTerminalBlock(
  beforeGraph: BlockGraphSnapshot,
  afterGraph: BlockGraphSnapshot
): BlockGraphSnapshot['blocks'][number] {
  const previousBlockIds = new Set(beforeGraph.blocks.map((block) => block.id))
  const createdBlock = afterGraph.blocks.find((block) => !previousBlockIds.has(block.id))

  if (!createdBlock) {
    throw createUnexpectedAppError('Created terminal block was not returned by the block graph.')
  }

  return createdBlock
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
