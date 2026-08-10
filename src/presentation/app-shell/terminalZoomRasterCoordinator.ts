import {
  resolveTerminalRasterScale,
  terminalRasterScaleLevels,
  type TerminalRasterScale
} from './terminalZoomRasterPolicy'

export type TerminalZoomRasterPriority = 'focused' | 'visible' | 'hidden'

export interface TerminalZoomRasterTarget {
  readonly id: string
  getRasterPriority(): TerminalZoomRasterPriority
  getRasterScale(): TerminalRasterScale
  getRasterCost(scale: TerminalRasterScale): number
  onRasterCostChange?(listener: () => void): () => void
  onRasterPriorityChange?(listener: () => void): () => void
  setRasterScale(scale: TerminalRasterScale): void
}

export interface TerminalZoomRasterIdleDeadline {
  readonly didTimeout: boolean
  timeRemaining(): number
}

export interface TerminalZoomRasterScheduler {
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
  requestIdle(callback: (deadline: TerminalZoomRasterIdleDeadline) => void, timeout: number): number
  cancelIdle(handle: number): void
}

export interface TerminalZoomRasterFailure {
  readonly attempt: number
  readonly error: unknown
  readonly requestedScale: TerminalRasterScale
  readonly targetId: string
}

interface RasterTask {
  readonly attempt: number
  readonly generation: number
  readonly lane: RasterTaskLane
  readonly scale: TerminalRasterScale
  readonly target: TerminalZoomRasterTarget
}

type RasterTaskLane = 'release' | 'focused' | 'idle'

const rasterSettleDelayMs = 100
const rasterDowngradeDelayMs = 1_000
const focusedIdleTimeoutMs = 32
const backgroundIdleTimeoutMs = 250
const minimumIdleBudgetMs = 6
const maximumRasterAttempts = 3
const defaultMaxBackingPixels = 32 * 1024 * 1024

export class TerminalZoomRasterCoordinator {
  private readonly targets = new Map<string, TerminalZoomRasterTarget>()
  private readonly targetSubscriptions = new Map<string, () => void>()
  private readonly scheduler: TerminalZoomRasterScheduler
  private readonly maxBackingPixels: number
  private readonly onRasterFailure: (failure: TerminalZoomRasterFailure) => void
  private canvasZoom = 1
  private generation = 0
  private isDisposed = false
  private isInteracting = false
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private downgradeTimer: ReturnType<typeof setTimeout> | null = null
  private idleCallback: number | null = null
  private releaseTasks: RasterTask[] = []
  private focusedTasks: RasterTask[] = []
  private idleTasks: RasterTask[] = []

  constructor({
    scheduler = createBrowserRasterScheduler(),
    maxBackingPixels = defaultMaxBackingPixels,
    onRasterFailure = () => undefined
  }: {
    scheduler?: TerminalZoomRasterScheduler
    maxBackingPixels?: number
    onRasterFailure?: (failure: TerminalZoomRasterFailure) => void
  } = {}) {
    this.scheduler = scheduler
    this.maxBackingPixels = normalizeBackingPixelBudget(maxBackingPixels)
    this.onRasterFailure = onRasterFailure
  }

  register(target: TerminalZoomRasterTarget): () => void {
    if (this.isDisposed) return () => undefined
    this.targetSubscriptions.get(target.id)?.()
    this.targets.set(target.id, target)
    const unregisterPriorityChange =
      target.onRasterPriorityChange?.(() => this.handleTargetStateChange()) ?? (() => undefined)
    const unregisterCostChange =
      target.onRasterCostChange?.(() => this.handleTargetStateChange()) ?? (() => undefined)
    this.targetSubscriptions.set(target.id, () => {
      unregisterPriorityChange()
      unregisterCostChange()
    })
    this.handleTargetStateChange()
    return () => {
      if (this.targets.get(target.id) !== target) return
      this.targets.delete(target.id)
      this.targetSubscriptions.get(target.id)?.()
      this.targetSubscriptions.delete(target.id)
      this.handleTargetStateChange()
    }
  }

  beginInteraction(): void {
    if (this.isDisposed) return
    this.isInteracting = true
    this.invalidatePendingWork()
  }

  updateCanvasZoom(canvasZoom: number): void {
    if (this.isDisposed) return
    const normalizedZoom = normalizeCanvasZoom(canvasZoom)
    if (normalizedZoom === this.canvasZoom) return
    this.canvasZoom = normalizedZoom
    this.invalidatePendingWork()
    if (!this.isInteracting) this.scheduleSettlement()
  }

  endInteraction(canvasZoom: number = this.canvasZoom): void {
    if (this.isDisposed) return
    this.canvasZoom = normalizeCanvasZoom(canvasZoom)
    this.isInteracting = false
    this.invalidatePendingWork()
    this.scheduleSettlement()
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.invalidatePendingWork()
    for (const unregister of this.targetSubscriptions.values()) unregister()
    this.targetSubscriptions.clear()
    this.targets.clear()
  }

  private invalidatePendingWork(): void {
    this.generation += 1
    if (this.settleTimer !== null) this.scheduler.clearTimeout(this.settleTimer)
    if (this.downgradeTimer !== null) this.scheduler.clearTimeout(this.downgradeTimer)
    if (this.idleCallback !== null) this.scheduler.cancelIdle(this.idleCallback)
    this.settleTimer = null
    this.downgradeTimer = null
    this.idleCallback = null
    this.releaseTasks = []
    this.focusedTasks = []
    this.idleTasks = []
  }

  private scheduleSettlement(): void {
    if (this.isDisposed || this.isInteracting) return
    if (this.settleTimer !== null) this.scheduler.clearTimeout(this.settleTimer)
    const generation = this.generation
    this.settleTimer = this.scheduler.setTimeout(() => {
      this.settleTimer = null
      if (this.isDisposed || this.isInteracting || generation !== this.generation) return
      this.prepareTasks(generation)
    }, rasterSettleDelayMs)
  }

  private prepareTasks(generation: number): void {
    const orderedTargets = [...this.targets.values()].sort(
      (left, right) =>
        priorityRank(left.getRasterPriority()) - priorityRank(right.getRasterPriority())
    )
    const policyScales = new Map<TerminalZoomRasterTarget, TerminalRasterScale>()
    for (const target of orderedTargets) {
      const priority = target.getRasterPriority()
      policyScales.set(
        target,
        priority === 'hidden'
          ? 1
          : resolveTerminalRasterScale({
              canvasZoom: this.canvasZoom,
              currentScale: target.getRasterScale()
            })
      )
    }
    const desiredScales = allocateRasterScales({
      maxBackingPixels: this.maxBackingPixels,
      orderedTargets,
      policyScales
    })
    const upgrades: RasterTask[] = []
    const downgrades: RasterTask[] = []
    const currentBackingPixels = sumRasterCosts(orderedTargets, (target) =>
      target.getRasterCost(target.getRasterScale())
    )

    for (const target of orderedTargets) {
      const currentScale = target.getRasterScale()
      const scale = desiredScales.get(target) ?? 1
      if (scale === currentScale) continue
      const lane: RasterTaskLane =
        scale > currentScale && target.getRasterPriority() === 'focused' ? 'focused' : 'idle'
      const task = { attempt: 1, generation, lane, scale, target }
      if (scale > currentScale) upgrades.push(task)
      else downgrades.push(task)
    }

    const immediateReleases: RasterTask[] = []
    const delayedDowngrades: RasterTask[] = []
    for (const task of downgrades) {
      const policyScale = policyScales.get(task.target) ?? 1
      const mustReleaseBeforeUpgrade = upgrades.length > 0
      const isBudgetConstrained = task.scale < policyScale
      const isOverBudget = currentBackingPixels > this.maxBackingPixels
      if (
        task.target.getRasterPriority() === 'hidden' ||
        mustReleaseBeforeUpgrade ||
        isBudgetConstrained ||
        isOverBudget
      ) {
        immediateReleases.push({ ...task, lane: 'release' })
      } else {
        delayedDowngrades.push(task)
      }
    }

    this.enqueue([...immediateReleases, ...upgrades])
    if (delayedDowngrades.length === 0) return
    this.downgradeTimer = this.scheduler.setTimeout(() => {
      this.downgradeTimer = null
      if (this.isDisposed || this.isInteracting || generation !== this.generation) return
      this.enqueue(delayedDowngrades)
    }, rasterDowngradeDelayMs)
  }

  private enqueue(tasks: readonly RasterTask[]): void {
    if (tasks.length === 0) return
    for (const task of tasks) {
      if (task.lane === 'release') this.releaseTasks.push(task)
      else if (task.lane === 'focused') this.focusedTasks.push(task)
      else this.idleTasks.push(task)
    }
    this.scheduleNextIdle()
  }

  private scheduleNextIdle(): void {
    if (this.idleCallback !== null || this.isDisposed || !this.hasPendingTasks()) return
    const timeout =
      this.releaseTasks.length > 0 || this.focusedTasks.length > 0
        ? focusedIdleTimeoutMs
        : backgroundIdleTimeoutMs
    this.idleCallback = this.scheduler.requestIdle((deadline) => {
      this.idleCallback = null
      if (!deadline.didTimeout && deadline.timeRemaining() < minimumIdleBudgetMs) {
        this.scheduleNextIdle()
        return
      }
      const task = this.releaseTasks.shift() ?? this.focusedTasks.shift() ?? this.idleTasks.shift()
      if (task) this.executeTask(task)
      this.scheduleNextIdle()
    }, timeout)
  }

  private executeTask(task: RasterTask): void {
    if (
      task.generation !== this.generation ||
      this.targets.get(task.target.id) !== task.target ||
      task.target.getRasterScale() === task.scale
    ) {
      return
    }
    try {
      task.target.setRasterScale(task.scale)
    } catch (error) {
      if (task.target.getRasterScale() === task.scale) return
      this.reportRasterFailure({
        attempt: task.attempt,
        error,
        requestedScale: task.scale,
        targetId: task.target.id
      })
      if (task.attempt < maximumRasterAttempts) {
        this.enqueue([{ ...task, attempt: task.attempt + 1 }])
        return
      }
      if (task.scale !== 1 && task.target.getRasterScale() !== 1) {
        this.enqueue([
          {
            attempt: 1,
            generation: task.generation,
            lane: 'release',
            scale: 1,
            target: task.target
          }
        ])
        return
      }
      if (task.lane === 'release') this.cancelDependentUpgrades(task.generation)
    }
  }

  private cancelDependentUpgrades(generation: number): void {
    this.focusedTasks = this.focusedTasks.filter((task) => task.generation !== generation)
    this.idleTasks = this.idleTasks.filter(
      (task) => task.generation !== generation || task.scale < task.target.getRasterScale()
    )
  }

  private reportRasterFailure(failure: TerminalZoomRasterFailure): void {
    try {
      this.onRasterFailure(failure)
    } catch {
      // Diagnostics must not block resource release or retries for other terminals.
    }
  }

  private hasPendingTasks(): boolean {
    return this.releaseTasks.length > 0 || this.focusedTasks.length > 0 || this.idleTasks.length > 0
  }

  private handleTargetStateChange(): void {
    if (this.isDisposed) return
    this.invalidatePendingWork()
    if (!this.isInteracting) this.scheduleSettlement()
  }
}

function allocateRasterScales({
  maxBackingPixels,
  orderedTargets,
  policyScales
}: {
  readonly maxBackingPixels: number
  readonly orderedTargets: readonly TerminalZoomRasterTarget[]
  readonly policyScales: ReadonlyMap<TerminalZoomRasterTarget, TerminalRasterScale>
}): Map<TerminalZoomRasterTarget, TerminalRasterScale> {
  const allocatedScales = new Map<TerminalZoomRasterTarget, TerminalRasterScale>()
  for (const target of orderedTargets) allocatedScales.set(target, 1)
  let allocatedBackingPixels = sumRasterCosts(orderedTargets, (target) => target.getRasterCost(1))

  for (const priority of ['focused', 'visible'] as const) {
    const targets = orderedTargets.filter((target) => target.getRasterPriority() === priority)
    for (const scale of terminalRasterScaleLevels.slice(1)) {
      for (const target of targets) {
        if ((policyScales.get(target) ?? 1) < scale) continue
        const currentScale = allocatedScales.get(target) ?? 1
        const currentCost = normalizeRasterCost(target.getRasterCost(currentScale))
        const nextCost = normalizeRasterCost(target.getRasterCost(scale))
        const nextTotal = allocatedBackingPixels - currentCost + nextCost
        if (nextTotal > maxBackingPixels && nextCost > currentCost) continue
        allocatedScales.set(target, scale)
        allocatedBackingPixels = nextTotal
      }
    }
  }

  return allocatedScales
}

function sumRasterCosts(
  targets: readonly TerminalZoomRasterTarget[],
  resolveCost: (target: TerminalZoomRasterTarget) => number
): number {
  return targets.reduce(
    (total, target) =>
      Math.min(Number.MAX_SAFE_INTEGER, total + normalizeRasterCost(resolveCost(target))),
    0
  )
}

function normalizeRasterCost(cost: number): number {
  return Number.isFinite(cost) && cost > 0 ? Math.ceil(cost) : 0
}

function normalizeBackingPixelBudget(maxBackingPixels: number): number {
  return Number.isFinite(maxBackingPixels) && maxBackingPixels >= 0
    ? Math.floor(maxBackingPixels)
    : defaultMaxBackingPixels
}

function priorityRank(priority: TerminalZoomRasterPriority): number {
  if (priority === 'focused') return 0
  if (priority === 'visible') return 1
  return 2
}

function normalizeCanvasZoom(canvasZoom: number): number {
  return Number.isFinite(canvasZoom) && canvasZoom > 0 ? canvasZoom : 1
}

function createBrowserRasterScheduler(): TerminalZoomRasterScheduler {
  const hasNativeIdleCallback = typeof window.requestIdleCallback === 'function'
  return {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle),
    requestIdle: (callback, timeout) =>
      hasNativeIdleCallback
        ? window.requestIdleCallback(callback, { timeout })
        : window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 0),
    cancelIdle: (handle) =>
      hasNativeIdleCallback ? window.cancelIdleCallback(handle) : window.clearTimeout(handle)
  }
}
