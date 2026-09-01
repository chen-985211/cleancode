export interface CanvasArrangementMotionChoreography {
  readonly delayByNodeId: Readonly<Record<string, number>>
  readonly kind: 'attach' | 'detach' | 'grid'
}

const cardRevealIntervalMs = 42

export function createCanvasArrangementMotionChoreography(
  items: readonly { readonly nodeIds: readonly string[] }[],
  direction: 'attach' | 'detach' | 'grid'
): CanvasArrangementMotionChoreography {
  const motionOrder = direction === 'detach' ? [...items].reverse() : [...items]
  const delayByNodeId: Record<string, number> = {}

  motionOrder.forEach((item, index) => {
    item.nodeIds.forEach((nodeId) => {
      delayByNodeId[nodeId] = direction === 'grid' ? 0 : index * cardRevealIntervalMs
    })
  })

  return { delayByNodeId, kind: direction }
}
