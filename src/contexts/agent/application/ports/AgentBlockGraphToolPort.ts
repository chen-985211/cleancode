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
}
