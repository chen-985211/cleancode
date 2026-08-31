import type { SequencedTerminalOutput } from '../../application/ports/TerminalModelPort'

export type TerminalWorkloadPriority = 'focused' | 'hidden' | 'visible'

interface TerminalOutputDrainResult {
  readonly bytesWritten: number
  readonly durationMs: number
}

export interface TerminalWorkloadTarget {
  readonly id: string
  drainOutput(maximumBatchBytes: number | null): Promise<TerminalOutputDrainResult | null>
  getOutputPriority(): TerminalWorkloadPriority
  hasPendingOutput(): boolean
  onOutputPendingChange(listener: () => void): () => void
  onOutputPriorityChange(listener: () => void): () => void
  onTerminalInput(listener: () => void): () => void
  hasPendingInitialization?(): boolean
  onNonCriticalWorkChange?(listener: () => void): () => void
  runInitialization?(): Promise<boolean>
}

export interface TerminalWorkloadSchedulerHost {
  cancelFrame(handle: number): void
  cancelIdle(handle: number): void
  now(): number
  requestFrame(callback: FrameRequestCallback): number
  requestIdle(callback: IdleRequestCallback, timeout: number): number
}

export interface TerminalWorkloadDiagnostics {
  readonly lastDeferReason: 'background-idle' | 'frame-budget' | 'interaction' | null
  readonly lastDrainDurationMs: number
  readonly lastInputToOutputLatencyMs: number
  readonly oldestPendingOutputAgeMs: number
  readonly pendingOutputTargetCount: number
}

interface RegisteredTarget {
  readonly target: TerminalWorkloadTarget
  readonly unsubscribe: () => void
  bytesPerMillisecond: number | null
  lastServedOrder: number
  pendingSince: number | null
}

const frameOutputBudgetRatio = 0.25
const interactionStarvationTimeoutMs = 250
const throughputSmoothingRatio = 0.25

export class TerminalWorkloadScheduler {
  private readonly host: TerminalWorkloadSchedulerHost
  private readonly targets = new Map<string, RegisteredTarget>()
  private readonly interactions = new Set<string>()
  private readonly pendingInputAtByTarget = new Map<string, number>()
  private frameHandle: number | null = null
  private idleHandle: number | null = null
  private inputFrameHandle: number | null = null
  private lastFrameTimestamp: number | null = null
  private isDisposed = false
  private isDraining = false
  private isInputActive = false
  private servedOrder = 0
  private lastDrainDurationMs = 0
  private lastInputToOutputLatencyMs = 0
  private lastDeferReason: TerminalWorkloadDiagnostics['lastDeferReason'] = null

  constructor({
    host = createBrowserWorkloadHost()
  }: { host?: TerminalWorkloadSchedulerHost } = {}) {
    this.host = host
  }

  register(target: TerminalWorkloadTarget): () => void {
    if (this.isDisposed) return () => undefined
    this.unregister(target.id)

    const handleStateChange = () => this.handleTargetStateChange()
    const unsubscribePending = target.onOutputPendingChange(handleStateChange)
    const unsubscribePriority = target.onOutputPriorityChange(handleStateChange)
    const unsubscribeInput = target.onTerminalInput(() => this.handleTerminalInput(target.id))
    const unsubscribeNonCritical = target.onNonCriticalWorkChange?.(handleStateChange)
    const registered: RegisteredTarget = {
      bytesPerMillisecond: null,
      lastServedOrder: 0,
      pendingSince: target.hasPendingOutput() ? this.host.now() : null,
      target,
      unsubscribe: () => {
        unsubscribePending()
        unsubscribePriority()
        unsubscribeInput()
        unsubscribeNonCritical?.()
      }
    }
    this.targets.set(target.id, registered)
    this.scheduleWork()

    return () => {
      if (this.targets.get(target.id) !== registered) return
      this.unregister(target.id)
      this.rescheduleWork()
    }
  }

  beginInteraction(owner: string): void {
    if (this.isDisposed || this.interactions.has(owner)) return
    this.interactions.add(owner)
    this.rescheduleWork()
  }

  endInteraction(owner: string): void {
    if (!this.interactions.delete(owner) || this.isDisposed) return
    this.rescheduleWork()
  }

  getDiagnostics(): TerminalWorkloadDiagnostics {
    this.refreshPendingState()
    const now = this.host.now()
    const pendingTargets = [...this.targets.values()].filter(
      (registered) => registered.pendingSince !== null
    )
    const oldestPendingAt = pendingTargets.reduce<number | null>(
      (oldest, registered) =>
        registered.pendingSince === null
          ? oldest
          : oldest === null
            ? registered.pendingSince
            : Math.min(oldest, registered.pendingSince),
      null
    )

    return {
      lastDeferReason: this.lastDeferReason,
      lastDrainDurationMs: this.lastDrainDurationMs,
      lastInputToOutputLatencyMs: this.lastInputToOutputLatencyMs,
      oldestPendingOutputAgeMs: oldestPendingAt === null ? 0 : Math.max(0, now - oldestPendingAt),
      pendingOutputTargetCount: pendingTargets.length
    }
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    this.cancelScheduledWork()
    if (this.inputFrameHandle !== null) this.host.cancelFrame(this.inputFrameHandle)
    this.inputFrameHandle = null
    for (const registered of this.targets.values()) registered.unsubscribe()
    this.targets.clear()
    this.interactions.clear()
    this.pendingInputAtByTarget.clear()
  }

  private handleTargetStateChange(): void {
    if (this.isDisposed) return
    this.refreshPendingState()
    this.rescheduleWork()
  }

  private handleTerminalInput(targetId: string): void {
    if (this.isDisposed) return
    this.pendingInputAtByTarget.set(targetId, this.host.now())
    this.isInputActive = true
    if (this.inputFrameHandle !== null) this.host.cancelFrame(this.inputFrameHandle)
    this.inputFrameHandle = this.host.requestFrame(() => {
      this.inputFrameHandle = null
      this.isInputActive = false
      if (this.idleHandle !== null) this.host.cancelIdle(this.idleHandle)
      this.idleHandle = null
      this.scheduleWork()
    })
    this.rescheduleWork()
  }

  private rescheduleWork(): void {
    this.cancelScheduledWork()
    this.scheduleWork()
  }

  private scheduleWork(): void {
    if (this.isDisposed || this.isDraining) return
    this.refreshPendingState()
    const targets = [...this.targets.values()]
    const hasFocusedOutput = targets.some(
      ({ target }) => target.hasPendingOutput() && target.getOutputPriority() === 'focused'
    )
    const hasBackgroundOutput = targets.some(
      ({ target }) => target.hasPendingOutput() && target.getOutputPriority() !== 'focused'
    )
    const hasInitialization = targets.some(({ target }) => target.hasPendingInitialization?.())

    if (hasFocusedOutput && this.frameHandle === null) {
      this.lastDeferReason = 'frame-budget'
      this.frameHandle = this.host.requestFrame((timestamp) => {
        this.frameHandle = null
        void this.drainFocusedOutput(timestamp)
      })
    }
    if (!hasFocusedOutput) this.lastFrameTimestamp = null

    const isInteractionActive = this.isInteractionActive()
    const shouldScheduleIdle = hasBackgroundOutput || (hasInitialization && !isInteractionActive)
    if (shouldScheduleIdle && this.idleHandle === null) {
      this.lastDeferReason = isInteractionActive ? 'interaction' : 'background-idle'
      this.idleHandle = this.host.requestIdle(
        (deadline) => {
          this.idleHandle = null
          void this.drainIdleWork(deadline)
        },
        isInteractionActive && hasBackgroundOutput ? interactionStarvationTimeoutMs : 0
      )
    } else if (hasInitialization && isInteractionActive) {
      this.lastDeferReason = 'interaction'
    }

    if (!hasFocusedOutput && !hasBackgroundOutput && !hasInitialization) {
      this.lastDeferReason = null
    }
  }

  private async drainFocusedOutput(timestamp: number): Promise<void> {
    if (this.isDisposed || this.isDraining) return
    const previousTimestamp = this.lastFrameTimestamp
    this.lastFrameTimestamp = timestamp
    const frameInterval =
      previousTimestamp === null ? null : Math.max(0, timestamp - previousTimestamp)
    const registered = this.selectOutputTarget('focused')
    if (!registered) {
      this.scheduleWork()
      return
    }

    const durationBudget = frameInterval === null ? null : frameInterval * frameOutputBudgetRatio
    await this.drainOutput(registered, durationBudget)
  }

  private async drainIdleWork(deadline: IdleDeadline): Promise<void> {
    if (this.isDisposed || this.isDraining) return
    if (this.selectOutputTarget('focused')) {
      this.scheduleWork()
      return
    }
    const isInteractionActive = this.isInteractionActive()
    if (isInteractionActive && !deadline.didTimeout) {
      this.lastDeferReason = 'interaction'
      this.scheduleWork()
      return
    }
    if (!deadline.didTimeout && deadline.timeRemaining() <= 0) {
      this.lastDeferReason = 'background-idle'
      this.scheduleWork()
      return
    }

    const output = this.selectBackgroundOutputTarget()
    if (output) {
      const durationBudget = deadline.didTimeout ? null : Math.max(0, deadline.timeRemaining())
      await this.drainOutput(output, durationBudget)
      return
    }

    if (isInteractionActive) {
      this.lastDeferReason = 'interaction'
      this.scheduleWork()
      return
    }

    const initialization = this.selectInitializationTarget()
    if (!initialization?.target.runInitialization) {
      this.scheduleWork()
      return
    }

    this.isDraining = true
    initialization.lastServedOrder = ++this.servedOrder
    try {
      await initialization.target.runInitialization()
    } finally {
      this.isDraining = false
      this.refreshPendingState()
      this.scheduleWork()
    }
  }

  private async drainOutput(
    registered: RegisteredTarget,
    durationBudgetMs: number | null
  ): Promise<void> {
    this.isDraining = true
    registered.lastServedOrder = ++this.servedOrder
    const maximumBatchBytes = deriveMaximumBatchBytes(
      registered.bytesPerMillisecond,
      durationBudgetMs
    )
    try {
      const result = await registered.target.drainOutput(maximumBatchBytes)
      if (result) {
        this.lastDrainDurationMs = Math.max(0, result.durationMs)
        const pendingInputAt = this.pendingInputAtByTarget.get(registered.target.id)
        if (pendingInputAt !== undefined) {
          this.lastInputToOutputLatencyMs = Math.max(0, this.host.now() - pendingInputAt)
          this.pendingInputAtByTarget.delete(registered.target.id)
        }
        registered.bytesPerMillisecond = updateThroughputEstimate(
          registered.bytesPerMillisecond,
          result
        )
      }
    } finally {
      this.isDraining = false
      this.refreshPendingState()
      this.scheduleWork()
    }
  }

  private selectOutputTarget(priority: TerminalWorkloadPriority): RegisteredTarget | null {
    return this.selectTarget(
      (target) => target.hasPendingOutput() && target.getOutputPriority() === priority
    )
  }

  private selectBackgroundOutputTarget(): RegisteredTarget | null {
    return this.selectTarget(
      (target) => target.hasPendingOutput() && target.getOutputPriority() !== 'focused'
    )
  }

  private selectInitializationTarget(): RegisteredTarget | null {
    return this.selectTarget((target) => target.hasPendingInitialization?.() ?? false)
  }

  private selectTarget(
    predicate: (target: TerminalWorkloadTarget) => boolean
  ): RegisteredTarget | null {
    return (
      [...this.targets.values()]
        .filter(({ target }) => predicate(target))
        .sort(
          (left, right) =>
            priorityRank(left.target.getOutputPriority()) -
              priorityRank(right.target.getOutputPriority()) ||
            left.lastServedOrder - right.lastServedOrder
        )[0] ?? null
    )
  }

  private refreshPendingState(): void {
    const now = this.host.now()
    for (const registered of this.targets.values()) {
      if (registered.target.hasPendingOutput()) registered.pendingSince ??= now
      else registered.pendingSince = null
    }
  }

  private isInteractionActive(): boolean {
    return this.interactions.size > 0 || this.isInputActive
  }

  private unregister(targetId: string): void {
    const registered = this.targets.get(targetId)
    if (!registered) return
    registered.unsubscribe()
    this.targets.delete(targetId)
    this.pendingInputAtByTarget.delete(targetId)
  }

  private cancelScheduledWork(): void {
    if (this.frameHandle !== null) this.host.cancelFrame(this.frameHandle)
    if (this.idleHandle !== null) this.host.cancelIdle(this.idleHandle)
    this.frameHandle = null
    this.idleHandle = null
  }
}

export interface TerminalOutputBatch {
  readonly byteLength: number
  readonly consumedCount: number
  readonly data: string
  readonly sequence: number
}

export interface MeasuredTerminalOutput extends SequencedTerminalOutput {
  readonly byteLength: number
}

const terminalOutputEncoder = new TextEncoder()

export function measureTerminalOutput(output: SequencedTerminalOutput): MeasuredTerminalOutput {
  return {
    ...output,
    byteLength: encodeByteLength(output.data)
  }
}

export function takeTerminalOutputBatch(
  outputs: readonly MeasuredTerminalOutput[],
  maximumBatchBytes: number
): TerminalOutputBatch | null {
  const first = outputs[0]
  if (!first) return null
  const normalizedLimit = normalizeBatchLimit(maximumBatchBytes)
  const dataParts = [first.data]
  let conservativeByteLength = first.byteLength
  let consumedCount = 1
  let sequence = first.sequence

  for (let index = 1; index < outputs.length; index += 1) {
    const output = outputs[index]
    if (!output) continue
    const outputByteLength = output.byteLength
    if (conservativeByteLength + outputByteLength > normalizedLimit) break
    dataParts.push(output.data)
    conservativeByteLength += outputByteLength
    consumedCount += 1
    sequence = output.sequence
  }
  const data = dataParts.join('')

  return {
    byteLength: encodeByteLength(data),
    consumedCount,
    data,
    sequence
  }
}

function deriveMaximumBatchBytes(
  bytesPerMillisecond: number | null,
  durationBudgetMs: number | null
): number | null {
  if (
    bytesPerMillisecond === null ||
    durationBudgetMs === null ||
    !Number.isFinite(bytesPerMillisecond) ||
    !Number.isFinite(durationBudgetMs) ||
    bytesPerMillisecond <= 0 ||
    durationBudgetMs <= 0
  ) {
    return null
  }
  return Math.max(1, Math.floor(bytesPerMillisecond * durationBudgetMs))
}

function updateThroughputEstimate(
  current: number | null,
  result: TerminalOutputDrainResult
): number | null {
  if (
    !Number.isFinite(result.bytesWritten) ||
    !Number.isFinite(result.durationMs) ||
    result.bytesWritten <= 0 ||
    result.durationMs <= 0
  ) {
    return current
  }
  const observed = result.bytesWritten / result.durationMs
  return current === null
    ? observed
    : current * (1 - throughputSmoothingRatio) + observed * throughputSmoothingRatio
}

function normalizeBatchLimit(maximumBatchBytes: number): number {
  return Number.isFinite(maximumBatchBytes) && maximumBatchBytes > 0
    ? Math.floor(maximumBatchBytes)
    : Number.POSITIVE_INFINITY
}

function encodeByteLength(value: string): number {
  return terminalOutputEncoder.encode(value).byteLength
}

function priorityRank(priority: TerminalWorkloadPriority): number {
  if (priority === 'focused') return 0
  if (priority === 'visible') return 1
  return 2
}

function createBrowserWorkloadHost(): TerminalWorkloadSchedulerHost {
  const hasNativeIdleCallback = typeof window.requestIdleCallback === 'function'
  return {
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    cancelIdle: (handle) =>
      hasNativeIdleCallback ? window.cancelIdleCallback(handle) : window.clearTimeout(handle),
    now: () => window.performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    requestIdle: (callback, timeout) =>
      hasNativeIdleCallback
        ? window.requestIdleCallback(callback, { timeout })
        : window.setTimeout(
            () =>
              callback({
                didTimeout: timeout > 0,
                timeRemaining: () => (timeout > 0 ? 0 : 8)
              }),
            timeout
          )
  }
}
