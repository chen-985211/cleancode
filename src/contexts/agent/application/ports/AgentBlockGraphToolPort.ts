import type {
  AgentBlockGraphSnapshot,
  AgentBlockPositionSnapshot
} from '../dto/AgentBlockGraphProtocol'
import type {
  ArrangeTerminalLayoutAgentToolInput,
  AgentToolContext,
  CreateBlockAgentToolInput,
  CreateTerminalGroupAgentToolInput,
  CreateTerminalWorkflowAgentToolInput,
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
  readonly graph: AgentBlockGraphSnapshot
}

export interface AgentDisconnectTerminalBlocksInput {
  readonly connectionId: string
}

export interface AgentInspectTerminalWorkflowPlanInput {
  readonly scope: AgentTerminalWorkflowPlanScope
}

export interface AgentCanvasLayoutRegion {
  readonly position: AgentBlockPositionSnapshot
  readonly size: { readonly height: number; readonly width: number }
}

export interface AgentCreateTerminalBlockInput extends CreateBlockAgentToolInput {
  readonly canvasRegions?: readonly AgentCanvasLayoutRegion[]
}

export interface AgentArrangeTerminalLayoutInput extends ArrangeTerminalLayoutAgentToolInput {
  readonly canvasRegions: readonly AgentCanvasLayoutRegion[]
}

export interface AgentArrangeTerminalLayoutResult {
  readonly arrangedBlockIds: readonly string[]
  readonly arrangedTerminalGroupIds: readonly string[]
  readonly graph: AgentBlockGraphSnapshot
  readonly graphChanged: boolean
}

export interface AgentCreateTerminalWorkflowInput extends CreateTerminalWorkflowAgentToolInput {
  readonly canvasRegions: readonly AgentCanvasLayoutRegion[]
}

export interface AgentCreateTerminalWorkflowResult {
  readonly arrangedBlockIds: readonly string[]
  readonly arrangedTerminalGroupIds: readonly string[]
  readonly createdConnections: readonly {
    readonly connectionId: string
    readonly sourceRef: string
    readonly targetRef: string
  }[]
  readonly createdTerminalGroupId: string | null
  readonly createdTerminals: readonly { readonly blockId: string; readonly ref: string }[]
  readonly graph: AgentBlockGraphSnapshot
  readonly plan: AgentTerminalWorkflowPlanSnapshot
}

export interface AgentBlockGraphToolPort {
  arrangeTerminalLayout(
    context: AgentToolContext,
    input: AgentArrangeTerminalLayoutInput
  ): Promise<AgentArrangeTerminalLayoutResult>
  inspectGraph(context: AgentToolContext): Promise<AgentBlockGraphSnapshot>
  createTerminalBlock(
    context: AgentToolContext,
    input: AgentCreateTerminalBlockInput
  ): Promise<AgentBlockGraphSnapshot>
  createTerminalWorkflow(
    context: AgentToolContext,
    input: AgentCreateTerminalWorkflowInput
  ): Promise<AgentCreateTerminalWorkflowResult>
  updateTerminalBlock(
    context: AgentToolContext,
    input: UpdateBlockAgentToolInput
  ): Promise<AgentBlockGraphSnapshot>
  deleteTerminalBlock(
    context: AgentToolContext,
    input: DeleteBlockAgentToolInput
  ): Promise<AgentBlockGraphSnapshot>
  createTerminalGroup(
    context: AgentToolContext,
    input: CreateTerminalGroupAgentToolInput
  ): Promise<AgentBlockGraphSnapshot>
  updateTerminalGroup(
    context: AgentToolContext,
    input: UpdateTerminalGroupAgentToolInput
  ): Promise<AgentBlockGraphSnapshot>
  deleteTerminalGroup(
    context: AgentToolContext,
    input: DeleteTerminalGroupAgentToolInput
  ): Promise<AgentBlockGraphSnapshot>
  updateTerminalExecutionConfig(
    context: AgentToolContext,
    input: AgentUpdateTerminalExecutionConfigInput
  ): Promise<AgentBlockGraphSnapshot>
  connectTerminalBlocks(
    context: AgentToolContext,
    input: AgentConnectTerminalBlocksInput
  ): Promise<AgentConnectTerminalBlocksResult>
  disconnectTerminalBlocks(
    context: AgentToolContext,
    input: AgentDisconnectTerminalBlocksInput
  ): Promise<AgentBlockGraphSnapshot>
  inspectTerminalWorkflowPlan(
    context: AgentToolContext,
    input: AgentInspectTerminalWorkflowPlanInput
  ): Promise<AgentTerminalWorkflowPlanSnapshot>
}
