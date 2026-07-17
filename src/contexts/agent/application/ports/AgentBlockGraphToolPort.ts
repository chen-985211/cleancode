import type { BlockGraphSnapshot } from '../../../block-graph/application/dto/BlockGraphSnapshot'
import type {
  AgentToolContext,
  CreateBlockAgentToolInput,
  CreateTerminalGroupAgentToolInput,
  DeleteBlockAgentToolInput,
  DeleteTerminalGroupAgentToolInput,
  UpdateBlockAgentToolInput,
  UpdateTerminalGroupAgentToolInput
} from '../dto/AgentToolProtocol'
import type {
  AgentTerminalExecutionConfigSnapshot,
  AgentTerminalWorkflowPlanScope,
  AgentTerminalWorkflowPlanSnapshot
} from '../dto/AgentTerminalWorkflowProtocol'

export interface AgentUpdateTerminalExecutionConfigInput {
  readonly blockId: string
  readonly executionConfig: AgentTerminalExecutionConfigSnapshot
}

export interface AgentConnectTerminalBlocksInput {
  readonly sourceBlockId: string
  readonly targetBlockId: string
}

export interface AgentConnectTerminalBlocksResult {
  readonly connectionId: string
  readonly graph: BlockGraphSnapshot
}

export interface AgentDisconnectTerminalBlocksInput {
  readonly connectionId: string
}

export interface AgentInspectTerminalWorkflowPlanInput {
  readonly scope: AgentTerminalWorkflowPlanScope
}

export interface AgentBlockGraphToolPort {
  inspectGraph(context: AgentToolContext): Promise<BlockGraphSnapshot>
  createTerminalBlock(
    context: AgentToolContext,
    input: CreateBlockAgentToolInput
  ): Promise<BlockGraphSnapshot>
  updateTerminalBlock(
    context: AgentToolContext,
    input: UpdateBlockAgentToolInput
  ): Promise<BlockGraphSnapshot>
  deleteTerminalBlock(
    context: AgentToolContext,
    input: DeleteBlockAgentToolInput
  ): Promise<BlockGraphSnapshot>
  createTerminalGroup(
    context: AgentToolContext,
    input: CreateTerminalGroupAgentToolInput
  ): Promise<BlockGraphSnapshot>
  updateTerminalGroup(
    context: AgentToolContext,
    input: UpdateTerminalGroupAgentToolInput
  ): Promise<BlockGraphSnapshot>
  deleteTerminalGroup(
    context: AgentToolContext,
    input: DeleteTerminalGroupAgentToolInput
  ): Promise<BlockGraphSnapshot>
  updateTerminalExecutionConfig(
    context: AgentToolContext,
    input: AgentUpdateTerminalExecutionConfigInput
  ): Promise<BlockGraphSnapshot>
  connectTerminalBlocks(
    context: AgentToolContext,
    input: AgentConnectTerminalBlocksInput
  ): Promise<AgentConnectTerminalBlocksResult>
  disconnectTerminalBlocks(
    context: AgentToolContext,
    input: AgentDisconnectTerminalBlocksInput
  ): Promise<BlockGraphSnapshot>
  inspectTerminalWorkflowPlan(
    context: AgentToolContext,
    input: AgentInspectTerminalWorkflowPlanInput
  ): Promise<AgentTerminalWorkflowPlanSnapshot>
}
