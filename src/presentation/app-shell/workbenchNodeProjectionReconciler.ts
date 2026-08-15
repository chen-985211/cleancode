import type {
  TerminalBlockSnapshot,
  TerminalExecutionConfigSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { CanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type {
  AgentConsoleFlowNode,
  TerminalFlowNode,
  TerminalGroupFlowNode,
  WorkbenchFlowNode,
  WorkbenchObjectMotion
} from './types'

export function reconcileWorkbenchNodeProjection(
  nextNodes: WorkbenchFlowNode[],
  currentNodes: WorkbenchFlowNode[]
): WorkbenchFlowNode[] {
  if (nextNodes.length === 0) return currentNodes.length === 0 ? currentNodes : nextNodes
  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]))
  let didChange = nextNodes.length !== currentNodes.length
  const reconciledNodes = nextNodes.map((nextNode, index): WorkbenchFlowNode => {
    const currentNode = currentNodesById.get(nextNode.id)
    if (currentNode && areWorkbenchNodeProjectionsEqual(currentNode, nextNode)) {
      if (currentNodes[index] !== currentNode) didChange = true
      return currentNode
    }
    didChange = true
    return nextNode
  })

  return didChange ? reconciledNodes : currentNodes
}

function areWorkbenchNodeProjectionsEqual(
  currentNode: WorkbenchFlowNode,
  nextNode: WorkbenchFlowNode
): boolean {
  if (currentNode.type !== nextNode.type || !areNodeShellsEqual(currentNode, nextNode)) return false

  if (currentNode.type === 'terminal' && nextNode.type === 'terminal') {
    return areTerminalNodeDataEqual(currentNode.data, nextNode.data)
  }
  if (currentNode.type === 'terminalGroup' && nextNode.type === 'terminalGroup') {
    return areTerminalGroupNodeDataEqual(currentNode.data, nextNode.data)
  }
  if (currentNode.type === 'agentConsole' && nextNode.type === 'agentConsole') {
    return areAgentNodeDataEqual(currentNode.data, nextNode.data)
  }
  return false
}

function areNodeShellsEqual(left: WorkbenchFlowNode, right: WorkbenchFlowNode): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.selectable === right.selectable &&
    left.selected === right.selected &&
    left.draggable === right.draggable &&
    left.dragHandle === right.dragHandle &&
    left.zIndex === right.zIndex &&
    left.className === right.className &&
    left.hidden === right.hidden &&
    left.width === right.width &&
    left.height === right.height &&
    left.dragging === right.dragging &&
    areShallowRecordsEqual(left.style, right.style) &&
    areShallowRecordsEqual(left.measured, right.measured)
  )
}

function areTerminalNodeDataEqual(
  left: TerminalFlowNode['data'],
  right: TerminalFlowNode['data']
): boolean {
  return (
    areCanvasObjectIdentitiesEqual(left.identity, right.identity) &&
    areTerminalBlocksEqual(left.block, right.block) &&
    areTerminalRuntimeSourcesEqual(left, right) &&
    areObjectMotionsEqual(left.objectMotion, right.objectMotion) &&
    areObjectPresencesEqual(left.objectPresence, right.objectPresence) &&
    haveSameProperties(left, right, terminalDataKeys)
  )
}

function areTerminalGroupNodeDataEqual(
  left: TerminalGroupFlowNode['data'],
  right: TerminalGroupFlowNode['data']
): boolean {
  return (
    areCanvasObjectIdentitiesEqual(left.identity, right.identity) &&
    areTerminalGroupsEqual(left.group, right.group) &&
    areTerminalBlockListsEqual(left.memberBlocks, right.memberBlocks) &&
    areTerminalGroupRuntimeSourcesEqual(left, right) &&
    areObjectMotionsEqual(left.objectMotion, right.objectMotion) &&
    areObjectPresencesEqual(left.objectPresence, right.objectPresence) &&
    haveSameProperties(left, right, terminalGroupDataKeys)
  )
}

function areTerminalRuntimeSourcesEqual(
  left: TerminalFlowNode['data'],
  right: TerminalFlowNode['data']
): boolean {
  if (left.terminalStateStore || right.terminalStateStore) {
    return left.terminalStateStore === right.terminalStateStore
  }
  return areShallowRecordsEqual(left.session, right.session)
}

function areTerminalGroupRuntimeSourcesEqual(
  left: TerminalGroupFlowNode['data'],
  right: TerminalGroupFlowNode['data']
): boolean {
  if (left.terminalStateStore || right.terminalStateStore) {
    return left.terminalStateStore === right.terminalStateStore
  }
  const leftIds = Object.keys(left.memberStates)
  const rightIds = Object.keys(right.memberStates)
  return (
    leftIds.length === rightIds.length &&
    leftIds.every(
      (terminalId) =>
        terminalId in right.memberStates &&
        areShallowRecordsEqual(left.memberStates[terminalId], right.memberStates[terminalId])
    )
  )
}

function areAgentNodeDataEqual(
  left: AgentConsoleFlowNode['data'],
  right: AgentConsoleFlowNode['data']
): boolean {
  return (
    areCanvasObjectIdentitiesEqual(left.identity, right.identity) &&
    areWorkspaceAgentsEqual(left.agent, right.agent) &&
    areObjectMotionsEqual(left.objectMotion, right.objectMotion) &&
    areObjectPresencesEqual(left.objectPresence, right.objectPresence) &&
    haveSameProperties(left, right, agentDataKeys)
  )
}

const terminalDataKeys = [
  'approvalIntent',
  'isContextSelected',
  'isSelected',
  'isTerminalGroupSelectionMode',
  'canSelectForTerminalGroup',
  'isNavigationHighlighted',
  'isParkedInCollapsedGroup',
  'launchCommandEditRequestId',
  'isActiveWorkflowRoot',
  'isStoppingWorkflow',
  'workflowStatus',
  'isObjectLayoutChoreographed',
  'onStart',
  'onStop',
  'onQuickLaunch',
  'onRestart',
  'onToggleRetention',
  'onDelete',
  'onUpdateDefinition',
  'onCopyServiceEndpoint',
  'onOpenServiceEndpoint',
  'onLocateManagedServiceOwner',
  'onDismissPortConflict',
  'onRunFromHere',
  'onStopWorkflow',
  'onViewIdentityStale',
  'onInput',
  'onPaste',
  'onResize',
  'onResizeBlock',
  'onSelect',
  'onToggleTerminalGroupCandidate'
] as const satisfies readonly (keyof TerminalFlowNode['data'])[]

const terminalGroupDataKeys = [
  'approvalIntent',
  'isContextSelected',
  'isEditing',
  'isSelected',
  'isObjectLayoutChoreographed',
  'dropFeedback',
  'onStartGroup',
  'onStopGroup',
  'onRestartGroup',
  'onUpdateGroupMetadata',
  'onToggleGroupCollapsed',
  'onEditGroup',
  'onRemoveTerminalFromGroup',
  'onDissolveGroup'
] as const satisfies readonly (keyof TerminalGroupFlowNode['data'])[]

const agentDataKeys = [
  'isContextSelected',
  'approvalController',
  'currentWorkbench',
  'currentWorkspace',
  'onGraphUpdated',
  'onMcpCapabilityChange',
  'onRemove',
  'onRename',
  'onResize',
  'onSelect'
] as const satisfies readonly (keyof AgentConsoleFlowNode['data'])[]

function haveSameProperties<Data extends Record<string, unknown>, Key extends keyof Data>(
  left: Data,
  right: Data,
  keys: readonly Key[]
): boolean {
  return keys.every((key) => left[key] === right[key])
}

function areCanvasObjectIdentitiesEqual(
  left: CanvasObjectIdentity,
  right: CanvasObjectIdentity
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.objectKind === right.objectKind &&
    left.objectId === right.objectId
  )
}

function areTerminalBlockListsEqual(
  left: readonly TerminalBlockSnapshot[],
  right: readonly TerminalBlockSnapshot[]
): boolean {
  return (
    left.length === right.length &&
    left.every((block, index) => areTerminalBlocksEqual(block, right[index]!))
  )
}

function areTerminalBlocksEqual(
  left: TerminalBlockSnapshot,
  right: TerminalBlockSnapshot
): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.name === right.name &&
    left.description === right.description &&
    left.launchCommand === right.launchCommand &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.size.width === right.size.width &&
    left.size.height === right.size.height &&
    areTerminalExecutionConfigsEqual(left.executionConfig, right.executionConfig)
  )
}

function areTerminalExecutionConfigsEqual(
  left: TerminalExecutionConfigSnapshot | undefined,
  right: TerminalExecutionConfigSnapshot | undefined
): boolean {
  if (left === right) return true
  if (!left || !right || left.mode !== right.mode) return false
  if (left.mode === 'task' && right.mode === 'task') {
    return (
      left.timeoutMs === right.timeoutMs &&
      left.successExitCodes.length === right.successExitCodes.length &&
      left.successExitCodes.every((code, index) => code === right.successExitCodes[index])
    )
  }
  if (left.mode !== 'service' || right.mode !== 'service') return false
  return (
    left.readiness.type === right.readiness.type &&
    (left.readiness.type !== 'output' ||
      (right.readiness.type === 'output' && left.readiness.text === right.readiness.text)) &&
    left.readinessTimeoutMs === right.readinessTimeoutMs &&
    areServicePortsEqual(left.port, right.port)
  )
}

function areServicePortsEqual(
  left: Extract<TerminalExecutionConfigSnapshot, { mode: 'service' }>['port'],
  right: Extract<TerminalExecutionConfigSnapshot, { mode: 'service' }>['port']
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.protocol === right.protocol &&
    left.policy.type === right.policy.type &&
    ('port' in left.policy ? left.policy.port : undefined) ===
      ('port' in right.policy ? right.policy.port : undefined) &&
    left.binding.type === right.binding.type &&
    ('variableName' in left.binding ? left.binding.variableName : undefined) ===
      ('variableName' in right.binding ? right.binding.variableName : undefined) &&
    ('template' in left.binding ? left.binding.template : undefined) ===
      ('template' in right.binding ? right.binding.template : undefined)
  )
}

function areTerminalGroupsEqual(
  left: TerminalGroupSnapshot,
  right: TerminalGroupSnapshot
): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.name === right.name &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.size.width === right.size.width &&
    left.size.height === right.size.height &&
    left.isCollapsed === right.isCollapsed &&
    left.memberBlockIds.length === right.memberBlockIds.length &&
    left.memberBlockIds.every((blockId, index) => blockId === right.memberBlockIds[index])
  )
}

function areWorkspaceAgentsEqual(
  left: WorkspaceAgentSnapshot,
  right: WorkspaceAgentSnapshot
): boolean {
  return (
    left.agentId === right.agentId &&
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.providerId === right.providerId &&
    left.name === right.name &&
    left.cleancodeMcpEnabled === right.cleancodeMcpEnabled &&
    left.layout.position.x === right.layout.position.x &&
    left.layout.position.y === right.layout.position.y &&
    left.layout.size.width === right.layout.size.width &&
    left.layout.size.height === right.layout.size.height
  )
}

function areObjectMotionsEqual(
  left: WorkbenchObjectMotion | undefined,
  right: WorkbenchObjectMotion | undefined
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.offset.x === right.offset.x &&
    left.offset.y === right.offset.y &&
    left.positionDynamics === right.positionDynamics &&
    left.contentDelayMs === right.contentDelayMs &&
    left.delayMs === right.delayMs &&
    left.opacityDelayMs === right.opacityDelayMs &&
    areShallowRecordsEqual(left.scale, right.scale) &&
    areShallowRecordsEqual(left.opacity, right.opacity) &&
    areShallowRecordsEqual(left.contentOpacity, right.contentOpacity) &&
    areShallowRecordsEqual(left.shellRect?.from, right.shellRect?.from) &&
    areShallowRecordsEqual(left.shellRect?.to, right.shellRect?.to)
  )
}

function areObjectPresencesEqual(
  left: { readonly id: string; readonly phase: string } | undefined,
  right: { readonly id: string; readonly phase: string } | undefined
): boolean {
  return left === right || (left?.id === right?.id && left?.phase === right?.phase)
}

function areShallowRecordsEqual(left: object | undefined, right: object | undefined): boolean {
  if (left === right) return true
  if (!left || !right) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => leftRecord[key] === rightRecord[key])
  )
}
