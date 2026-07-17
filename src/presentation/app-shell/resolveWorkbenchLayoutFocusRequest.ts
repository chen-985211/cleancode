import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import type { WorkbenchLayoutFocusRequest } from './useWorkbenchLayoutFocus'

type TerminalLayoutArrangedChange = NonNullable<AgentGraphUpdatedEvent['change']>

interface ResolveWorkbenchLayoutFocusRequestInput {
  readonly agentId: string
  readonly change?: TerminalLayoutArrangedChange
  readonly graph: BlockGraphSnapshot
}

export function resolveWorkbenchLayoutFocusRequest({
  agentId,
  change,
  graph
}: ResolveWorkbenchLayoutFocusRequestInput): WorkbenchLayoutFocusRequest | null {
  if (!change) return null

  const existingBlockIds = new Set(graph.blocks.map((block) => block.id))
  const existingGroupIds = new Set(graph.terminalGroups.map((group) => group.id))
  const groupedBlockIds = new Set(
    graph.terminalGroups.flatMap((group) => [...group.memberBlockIds])
  )
  const visibleGroups = change.terminalGroupIds.flatMap((groupId) => {
    const group = graph.terminalGroups.find((candidate) => candidate.id === groupId)
    return group ? [group] : []
  })
  const visibleUngroupedBlocks = change.blockIds.flatMap((blockId) => {
    const block = graph.blocks.find(
      (candidate) => candidate.id === blockId && !groupedBlockIds.has(blockId)
    )
    return block ? [block] : []
  })
  const expectedNodeLayouts = [...visibleGroups, ...visibleUngroupedBlocks].map((item) => ({
    nodeId: item.id,
    position: item.position,
    size: item.size
  }))

  if (
    expectedNodeLayouts.length === 0 &&
    !change.blockIds.some((blockId) => existingBlockIds.has(blockId)) &&
    !change.terminalGroupIds.some((groupId) => existingGroupIds.has(groupId))
  ) {
    return null
  }

  return {
    affectedNodeIds: uniqueIds([...change.blockIds, ...change.terminalGroupIds]),
    expectedNodeLayouts,
    focusNodeIds: uniqueIds([
      toAgentFlowNodeId(agentId),
      ...visibleGroups.map((group) => group.id),
      ...visibleUngroupedBlocks.map((block) => block.id)
    ]),
    operationId: change.operationId
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}
