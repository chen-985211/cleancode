export interface CanvasArrangementMotionChoreography {
  readonly delayByNodeId: Readonly<Record<string, number>>
}

const cardRevealIntervalMs = 42

export function createCanvasArrangementMotionChoreography(
  items: readonly { readonly nodeIds: readonly string[] }[],
  presentation: 'spread' | 'stacked'
): CanvasArrangementMotionChoreography {
  const motionOrder = presentation === 'spread' ? [...items].reverse() : [...items]
  const delayByNodeId: Record<string, number> = {}

  motionOrder.forEach((item, index) => {
    item.nodeIds.forEach((nodeId) => {
      delayByNodeId[nodeId] = index * cardRevealIntervalMs
    })
  })

  return { delayByNodeId }
}
