import type {
  CanvasArrangementItemReference,
  CanvasArrangementSnapshot
} from '../../application/dto/CanvasArrangementSnapshot'

export interface CanvasArrangementSelectionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface CanvasArrangementSelectionItem {
  readonly key: string
  readonly nodeIds: readonly string[]
  readonly position: { readonly x: number; readonly y: number }
  readonly reference: CanvasArrangementItemReference
  readonly size: { readonly width: number; readonly height: number }
}

export interface CanvasArrangementSelection {
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly rect: CanvasArrangementSelectionRect | null
}

export function isCanvasArrangementSelectionModifier(
  modifier: { readonly ctrlKey: boolean; readonly metaKey: boolean },
  platform: 'mac' | 'other'
): boolean {
  return platform === 'mac' ? modifier.metaKey : modifier.ctrlKey
}

export function normalizeCanvasArrangementSelectionRect(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number }
): CanvasArrangementSelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

export function resolveCanvasArrangementSelectionFromCandidates({
  arrangement,
  candidates,
  selection
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly candidates: readonly CanvasArrangementSelectionItem[]
  readonly selection: CanvasArrangementSelectionRect
}): CanvasArrangementSelectionItem[] {
  const normalizedSelection = normalizeRect(selection)
  const selectedKeys = new Set(
    candidates
      .filter((candidate) => intersectsRect(normalizedSelection, toRect(candidate)))
      .map((candidate) => candidate.key)
  )

  for (const stack of arrangement.stacks) {
    const stackKeys = stack.items.map(canvasArrangementItemKey)
    if (stackKeys.some((key) => selectedKeys.has(key))) {
      for (const key of stackKeys) selectedKeys.add(key)
    }
  }

  return candidates.filter((candidate) => selectedKeys.has(candidate.key))
}

export function canvasArrangementItemKey(item: CanvasArrangementItemReference): string {
  switch (item.kind) {
    case 'terminal':
      return `terminal:${item.terminalId}`
    case 'workflow':
      return `workflow:${[...item.terminalIds].sort().join(',')}`
    case 'combination':
      return `combination:${item.terminalGroupId}`
    case 'agent':
      return `agent:${item.agentId}`
  }
}

export function findCanvasArrangementStack(
  arrangement: CanvasArrangementSnapshot,
  items: readonly CanvasArrangementSelectionItem[]
): CanvasArrangementSnapshot['stacks'][number] | null {
  const selectedKeys = new Set(items.map((item) => item.key))

  return (
    arrangement.stacks.find((stack) => {
      const stackKeys = stack.items.map(canvasArrangementItemKey)
      return (
        stackKeys.length === selectedKeys.size && stackKeys.every((key) => selectedKeys.has(key))
      )
    }) ?? null
  )
}

export function findCanvasArrangementStacks(
  arrangement: CanvasArrangementSnapshot,
  items: readonly CanvasArrangementSelectionItem[]
): CanvasArrangementSnapshot['stacks'] {
  const selectedKeys = new Set(items.map((item) => item.key))
  return arrangement.stacks.filter((stack) =>
    stack.items.some((item) => selectedKeys.has(canvasArrangementItemKey(item)))
  )
}

function normalizeRect(rect: CanvasArrangementSelectionRect): CanvasArrangementSelectionRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height)
  }
}

function toRect(item: CanvasArrangementSelectionItem): CanvasArrangementSelectionRect {
  return { ...item.position, ...item.size }
}

function intersectsRect(
  left: CanvasArrangementSelectionRect,
  right: CanvasArrangementSelectionRect
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}
