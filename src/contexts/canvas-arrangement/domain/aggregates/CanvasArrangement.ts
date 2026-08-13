import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  CanvasArrangementItemReference,
  CanvasArrangementSnapshot,
  CanvasStackSnapshot
} from './CanvasArrangementTypes'

export interface CreateCanvasStackInput {
  readonly id: string
  readonly anchor: { readonly x: number; readonly y: number }
  readonly items: readonly CanvasArrangementItemReference[]
}

export class CanvasArrangement {
  private constructor(
    readonly projectId: string,
    readonly workspaceId: string,
    private stacks: CanvasStackSnapshot[]
  ) {}

  static create(input: { readonly projectId: string; readonly workspaceId: string }) {
    return new CanvasArrangement(
      requireText(input.projectId, 'projectId'),
      requireText(input.workspaceId, 'workspaceId'),
      []
    )
  }

  static fromSnapshot(snapshot: CanvasArrangementSnapshot): CanvasArrangement {
    const arrangement = CanvasArrangement.create(snapshot)

    for (const stack of snapshot.stacks) {
      arrangement.appendStack(stack)
    }

    return arrangement
  }

  static itemKey(item: CanvasArrangementItemReference): string {
    const normalized = normalizeItem(item)

    switch (normalized.kind) {
      case 'terminal':
        return `terminal:${normalized.terminalId}`
      case 'workflow':
        return `workflow:${[...normalized.terminalIds].sort().join(',')}`
      case 'combination':
        return `combination:${normalized.terminalGroupId}`
      case 'agent':
        return `agent:${normalized.agentId}`
    }
  }

  createStack(input: CreateCanvasStackInput): CanvasStackSnapshot {
    return this.appendStack(input)
  }

  private appendStack(input: CreateCanvasStackInput): CanvasStackSnapshot {
    const id = requireText(input.id, 'stackId')
    if (this.stacks.some((stack) => stack.id === id)) {
      invalid('Canvas stack ID must be unique.')
    }
    if (!Number.isFinite(input.anchor.x) || !Number.isFinite(input.anchor.y)) {
      invalid('Canvas stack anchor must use finite coordinates.')
    }
    if (input.items.length < 2) {
      invalid('Canvas stack requires at least two members.')
    }

    const items = input.items.map(normalizeItem)
    const itemKeys = items.map(CanvasArrangement.itemKey)
    if (new Set(itemKeys).size !== itemKeys.length) {
      invalid('Canvas stack members must be unique.')
    }
    const occupiedKeys = new Set(
      this.stacks.flatMap((stack) => stack.items.map(CanvasArrangement.itemKey))
    )
    if (itemKeys.some((key) => occupiedKeys.has(key))) {
      invalid('Canvas object already belongs to another stack.')
    }

    const stack: CanvasStackSnapshot = Object.freeze({
      id,
      anchor: Object.freeze({ ...input.anchor }),
      items: Object.freeze(items)
    })
    this.stacks = [...this.stacks, stack]
    return stack
  }

  createMergedStack(input: CreateCanvasStackInput): CanvasStackSnapshot {
    const selectedKeys = new Set(input.items.map(CanvasArrangement.itemKey))
    const overlappingStackIds = new Set(
      this.stacks
        .filter((stack) =>
          stack.items.some((item) => selectedKeys.has(CanvasArrangement.itemKey(item)))
        )
        .map((stack) => stack.id)
    )
    const wouldFractureStack = this.stacks.some(
      (stack) =>
        overlappingStackIds.has(stack.id) &&
        stack.items.some((item) => !selectedKeys.has(CanvasArrangement.itemKey(item)))
    )
    if (wouldFractureStack) {
      invalid('Canvas stack merge must include every member of an existing stack.')
    }

    const previousStacks = this.stacks
    this.stacks = this.stacks.filter((stack) => !overlappingStackIds.has(stack.id))
    try {
      return this.createStack(input)
    } catch (error) {
      this.stacks = previousStacks
      throw error
    }
  }

  removeStack(stackId: string): CanvasStackSnapshot {
    const index = this.stacks.findIndex((stack) => stack.id === stackId)
    if (index === -1) {
      throw createExpectedAppError('CANVAS_STACK_NOT_FOUND', 'Canvas stack was not found.')
    }

    const stack = this.stacks[index]
    this.stacks = this.stacks.filter((candidate) => candidate.id !== stackId)
    return stack
  }

  moveStack(
    stackId: string,
    anchor: { readonly x: number; readonly y: number }
  ): CanvasStackSnapshot {
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      invalid('Canvas stack anchor must use finite coordinates.')
    }
    const index = this.stacks.findIndex((stack) => stack.id === stackId)
    if (index === -1) {
      throw createExpectedAppError('CANVAS_STACK_NOT_FOUND', 'Canvas stack was not found.')
    }
    const previous = this.stacks[index]
    const moved = Object.freeze({
      ...previous,
      anchor: Object.freeze({ ...anchor })
    })
    this.stacks = this.stacks.map((stack, stackIndex) => (stackIndex === index ? moved : stack))
    return moved
  }

  reconcile(validItemKeys: readonly string[]): {
    readonly changed: boolean
    readonly removedStackIds: readonly string[]
  } {
    const validKeys = new Set(validItemKeys)
    const removedStackIds: string[] = []
    let changed = false
    const nextStacks: CanvasStackSnapshot[] = []

    for (const stack of this.stacks) {
      const items = stack.items.filter((item) => validKeys.has(CanvasArrangement.itemKey(item)))
      if (items.length < 2) {
        removedStackIds.push(stack.id)
        changed = true
        continue
      }
      if (items.length !== stack.items.length) {
        changed = true
        nextStacks.push(
          Object.freeze({
            ...stack,
            items: Object.freeze(items)
          })
        )
        continue
      }
      nextStacks.push(stack)
    }

    this.stacks = nextStacks
    return { changed, removedStackIds }
  }

  toSnapshot(): CanvasArrangementSnapshot {
    return Object.freeze({
      projectId: this.projectId,
      workspaceId: this.workspaceId,
      stacks: Object.freeze(
        this.stacks.map((stack) =>
          Object.freeze({
            id: stack.id,
            anchor: Object.freeze({ ...stack.anchor }),
            items: Object.freeze(stack.items.map(copyItem))
          })
        )
      )
    })
  }
}

function normalizeItem(item: CanvasArrangementItemReference): CanvasArrangementItemReference {
  switch (item.kind) {
    case 'terminal':
      return Object.freeze({
        kind: item.kind,
        terminalId: requireText(item.terminalId, 'terminalId')
      })
    case 'workflow': {
      if (item.terminalIds.length < 2) {
        invalid('Canvas workflow reference requires at least two terminal IDs.')
      }
      const terminalIds = item.terminalIds.map((id) => requireText(id, 'terminalId'))
      if (new Set(terminalIds).size !== terminalIds.length) {
        invalid('Canvas workflow terminal IDs must be unique.')
      }
      return Object.freeze({ kind: item.kind, terminalIds: Object.freeze(terminalIds) })
    }
    case 'combination':
      return Object.freeze({
        kind: item.kind,
        terminalGroupId: requireText(item.terminalGroupId, 'terminalGroupId')
      })
    case 'agent':
      return Object.freeze({ kind: item.kind, agentId: requireText(item.agentId, 'agentId') })
  }
}

function copyItem(item: CanvasArrangementItemReference): CanvasArrangementItemReference {
  return item.kind === 'workflow'
    ? Object.freeze({ ...item, terminalIds: Object.freeze([...item.terminalIds]) })
    : Object.freeze({ ...item })
}

function requireText(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) invalid(`Canvas arrangement ${fieldName} cannot be empty.`)
  return normalized
}

function invalid(message: string): never {
  throw createExpectedAppError('CANVAS_ARRANGEMENT_INVALID', message)
}
