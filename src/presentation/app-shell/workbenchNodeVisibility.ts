import type { WorkbenchFlowNode } from './types'

export function isWorkbenchNodePresentationHidden(node: WorkbenchFlowNode): boolean {
  return Boolean(
    node.hidden ||
    node.data?.objectPresence?.phase === 'pending' ||
    (node.type === 'terminal' && node.data?.isParkedInCollapsedGroup && !node.data?.objectMotion)
  )
}
