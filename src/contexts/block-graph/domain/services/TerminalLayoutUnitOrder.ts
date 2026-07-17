import { createUnexpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export function resolveStableTerminalLayoutUnitIds(
  unitIds: readonly string[],
  unitIdsByLayer: readonly (readonly string[])[]
): string[] {
  const stableUnitIds = uniqueStrings(unitIds).sort()
  const outgoingUnitIds = createOutgoingUnitIds(stableUnitIds, unitIdsByLayer)
  const components = findStronglyConnectedComponents(stableUnitIds, outgoingUnitIds)
  const acyclicOutgoingUnitIds = createAcyclicOutgoingUnitIds(
    stableUnitIds,
    components,
    outgoingUnitIds
  )
  const provisionalUnitIds = topologicallyOrderUnitIds(stableUnitIds, acyclicOutgoingUnitIds)
  const normalizedUnitIdsByLayer = normalizeUnitIdsByLayer(unitIdsByLayer, provisionalUnitIds)

  return topologicallyOrderUnitIds(
    stableUnitIds,
    createOutgoingUnitIds(stableUnitIds, normalizedUnitIdsByLayer)
  )
}

function normalizeUnitIdsByLayer(
  unitIdsByLayer: readonly (readonly string[])[],
  orderedUnitIds: readonly string[]
): string[][] {
  const rankByUnitId = new Map(orderedUnitIds.map((unitId, rank) => [unitId, rank] as const))

  return unitIdsByLayer.map((layerUnitIds) =>
    uniqueStrings(layerUnitIds)
      .filter((unitId) => rankByUnitId.has(unitId))
      .sort(
        (left, right) =>
          requireGraphIndex(rankByUnitId, left) - requireGraphIndex(rankByUnitId, right)
      )
  )
}

function createOutgoingUnitIds(
  unitIds: readonly string[],
  unitIdsByLayer: readonly (readonly string[])[]
): ReadonlyMap<string, ReadonlySet<string>> {
  const knownUnitIds = new Set(unitIds)
  const outgoingUnitIds = new Map(unitIds.map((unitId) => [unitId, new Set<string>()] as const))

  for (const layerUnitIds of unitIdsByLayer) {
    const stableLayerUnitIds = uniqueStrings(
      layerUnitIds.filter((unitId) => knownUnitIds.has(unitId))
    )

    for (let index = 1; index < stableLayerUnitIds.length; index += 1) {
      outgoingUnitIds.get(stableLayerUnitIds[index - 1])?.add(stableLayerUnitIds[index])
    }
  }

  return outgoingUnitIds
}

function findStronglyConnectedComponents(
  unitIds: readonly string[],
  outgoingUnitIds: ReadonlyMap<string, ReadonlySet<string>>
): string[][] {
  const indexByUnitId = new Map<string, number>()
  const lowLinkByUnitId = new Map<string, number>()
  const stack: string[] = []
  const stackedUnitIds = new Set<string>()
  const components: string[][] = []
  let nextIndex = 0

  const visit = (unitId: string): void => {
    const unitIndex = nextIndex
    nextIndex += 1
    indexByUnitId.set(unitId, unitIndex)
    lowLinkByUnitId.set(unitId, unitIndex)
    stack.push(unitId)
    stackedUnitIds.add(unitId)

    for (const targetUnitId of [...(outgoingUnitIds.get(unitId) ?? [])].sort()) {
      if (!indexByUnitId.has(targetUnitId)) {
        visit(targetUnitId)
        lowLinkByUnitId.set(
          unitId,
          Math.min(
            requireGraphIndex(lowLinkByUnitId, unitId),
            requireGraphIndex(lowLinkByUnitId, targetUnitId)
          )
        )
      } else if (stackedUnitIds.has(targetUnitId)) {
        lowLinkByUnitId.set(
          unitId,
          Math.min(
            requireGraphIndex(lowLinkByUnitId, unitId),
            requireGraphIndex(indexByUnitId, targetUnitId)
          )
        )
      }
    }

    if (requireGraphIndex(lowLinkByUnitId, unitId) !== unitIndex) return

    const component: string[] = []
    let memberUnitId: string | undefined

    do {
      memberUnitId = stack.pop()
      if (!memberUnitId) break
      stackedUnitIds.delete(memberUnitId)
      component.push(memberUnitId)
    } while (memberUnitId !== unitId)

    components.push(component.sort())
  }

  for (const unitId of unitIds) {
    if (!indexByUnitId.has(unitId)) visit(unitId)
  }

  return components
}

function createAcyclicOutgoingUnitIds(
  unitIds: readonly string[],
  components: readonly (readonly string[])[],
  outgoingUnitIds: ReadonlyMap<string, ReadonlySet<string>>
): ReadonlyMap<string, ReadonlySet<string>> {
  const componentIndexByUnitId = new Map(
    components.flatMap((component, componentIndex) =>
      component.map((unitId) => [unitId, componentIndex] as const)
    )
  )
  const acyclicOutgoingUnitIds = new Map(
    unitIds.map((unitId) => [unitId, new Set<string>()] as const)
  )

  for (const [sourceUnitId, targetUnitIds] of outgoingUnitIds) {
    const sourceComponentIndex = requireGraphIndex(componentIndexByUnitId, sourceUnitId)

    for (const targetUnitId of targetUnitIds) {
      const targetComponentIndex = requireGraphIndex(componentIndexByUnitId, targetUnitId)

      if (sourceComponentIndex !== targetComponentIndex) {
        acyclicOutgoingUnitIds.get(sourceUnitId)?.add(targetUnitId)
      }
    }
  }

  for (const component of components) {
    for (let index = 1; index < component.length; index += 1) {
      acyclicOutgoingUnitIds.get(component[index - 1])?.add(component[index])
    }
  }

  return acyclicOutgoingUnitIds
}

function topologicallyOrderUnitIds(
  unitIds: readonly string[],
  outgoingUnitIds: ReadonlyMap<string, ReadonlySet<string>>
): string[] {
  const incomingCounts = new Map<string, number>(unitIds.map((unitId) => [unitId, 0]))

  for (const targetUnitIds of outgoingUnitIds.values()) {
    for (const targetUnitId of targetUnitIds) {
      incomingCounts.set(targetUnitId, (incomingCounts.get(targetUnitId) ?? 0) + 1)
    }
  }

  const remainingUnitIds = new Set(unitIds)
  const orderedUnitIds: string[] = []

  while (remainingUnitIds.size > 0) {
    const nextUnitId = [...remainingUnitIds]
      .filter((unitId) => (incomingCounts.get(unitId) ?? 0) === 0)
      .sort()[0]

    if (!nextUnitId) {
      throw createUnexpectedAppError('Terminal layout unit ordering did not become acyclic.')
    }

    orderedUnitIds.push(nextUnitId)
    remainingUnitIds.delete(nextUnitId)

    for (const targetUnitId of outgoingUnitIds.get(nextUnitId) ?? []) {
      if (!remainingUnitIds.has(targetUnitId)) continue
      incomingCounts.set(targetUnitId, Math.max(0, (incomingCounts.get(targetUnitId) ?? 0) - 1))
    }
  }

  return orderedUnitIds
}

function requireGraphIndex(indexesById: ReadonlyMap<string, number>, id: string): number {
  const index = indexesById.get(id)

  if (index === undefined) {
    throw createUnexpectedAppError('Terminal layout unit graph is inconsistent.', { unitId: id })
  }

  return index
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}
