import {
  measureTerminalOutput,
  TerminalWorkloadScheduler,
  takeTerminalOutputBatch,
  type TerminalWorkloadSchedulerHost,
  type TerminalWorkloadTarget
} from '../../../../src/contexts/run/presentation/terminal-surface/terminalWorkloadScheduler'

describe('terminal output scheduler', () => {
  it('drains focused output before visible and hidden surfaces', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const hidden = createTarget('hidden', 'hidden', undefined, host.drainOrder)
    const visible = createTarget('visible', 'visible', undefined, host.drainOrder)
    const focused = createTarget('focused', 'focused', undefined, host.drainOrder)

    scheduler.register(hidden.target)
    scheduler.register(visible.target)
    scheduler.register(focused.target)
    hidden.enqueue()
    visible.enqueue()
    focused.enqueue()

    await host.flushIdle({ didTimeout: true, timeRemaining: () => 0 })
    expect(host.drainOrder).toEqual([])
    await host.flushFrame(8)
    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })
    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })

    expect(host.drainOrder).toEqual(['focused', 'visible', 'hidden'])
  })

  it('round-robins surfaces within the same visibility priority', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const first = createTarget('first', 'visible', undefined, host.drainOrder)
    const second = createTarget('second', 'visible', undefined, host.drainOrder)
    scheduler.register(first.target)
    scheduler.register(second.target)
    first.enqueue(2)
    second.enqueue(2)

    for (let turn = 0; turn < 4; turn += 1) {
      await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })
    }

    expect(host.drainOrder).toEqual(['first', 'second', 'first', 'second'])
  })

  it('promotes a newly focused surface from the idle lane to the next frame', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const target = createTarget('terminal', 'visible', undefined, host.drainOrder)
    scheduler.register(target.target)
    target.enqueue()

    expect(host.pendingIdleCallbacks()).toBe(1)
    target.setPriority('focused')

    expect(host.pendingIdleCallbacks()).toBe(0)
    expect(host.pendingFrames()).toBe(1)
    await host.flushFrame(8)
    expect(host.drainOrder).toEqual(['terminal'])
  })

  it('defers non-focused output during direct interaction but gives it a starvation turn', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const visible = createTarget('visible', 'visible', undefined, host.drainOrder)
    scheduler.register(visible.target)

    scheduler.beginInteraction('canvas')
    visible.enqueue()

    expect(host.pendingFrames()).toBe(0)
    expect(host.pendingIdleCallbacks()).toBe(1)

    await host.flushIdle({ didTimeout: false, timeRemaining: () => 0 })
    expect(host.drainOrder).toEqual([])

    await host.flushIdle({ didTimeout: true, timeRemaining: () => 0 })
    expect(host.drainOrder).toEqual(['visible'])

    visible.enqueue()
    scheduler.endInteraction('canvas')
    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })

    expect(host.drainOrder).toEqual(['visible', 'visible'])
  })

  it('derives later batch sizes from observed drain time and the current host budget', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const focused = createTarget(
      'focused',
      'focused',
      { bytesWritten: 1_000, durationMs: 2 },
      host.drainOrder
    )
    scheduler.register(focused.target)

    focused.enqueue(2)
    await host.flushFrame(8)
    await host.flushFrame(16)

    expect(focused.requestedBatchBytes[0]).toBeNull()
    expect(focused.requestedBatchBytes[1]).toBe(2_000)
  })

  it('treats terminal input as interaction until the next painted frame', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const focused = createTarget('focused', 'focused', undefined, host.drainOrder)
    const visible = createTarget('visible', 'visible', undefined, host.drainOrder)
    scheduler.register(focused.target)
    scheduler.register(visible.target)

    visible.enqueue()
    focused.emitInput()

    expect(host.pendingFrames()).toBe(1)
    expect(host.pendingIdleCallbacks()).toBe(1)
    await host.flushFrame(8)
    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })

    expect(host.drainOrder).toEqual(['visible'])
  })

  it('runs non-critical renderer initialization only after interaction yields', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const hidden = createTarget('hidden', 'hidden', undefined, host.drainOrder)
    scheduler.register(hidden.target)

    scheduler.beginInteraction('sidebar')
    hidden.enqueueInitialization()
    await host.flushIdle({ didTimeout: true, timeRemaining: () => 0 })

    expect(host.drainOrder).toEqual([])

    scheduler.endInteraction('sidebar')
    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })

    expect(host.drainOrder).toEqual(['initialize:hidden'])
  })

  it('stages bulk renderer initialization one visible-first task per idle slice', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const hidden = createTarget('hidden', 'hidden', undefined, host.drainOrder)
    const visible = createTarget('visible', 'visible', undefined, host.drainOrder)
    scheduler.register(hidden.target)
    scheduler.register(visible.target)

    hidden.enqueueInitialization()
    visible.enqueueInitialization()
    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })

    expect(host.drainOrder).toEqual(['initialize:visible'])

    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })

    expect(host.drainOrder).toEqual(['initialize:visible', 'initialize:hidden'])
  })

  it('reports bounded scheduling diagnostics without terminal output content', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const hidden = createTarget(
      'hidden',
      'hidden',
      { bytesWritten: 512, durationMs: 3 },
      host.drainOrder
    )
    scheduler.register(hidden.target)
    hidden.enqueue()
    host.advanceNow(12)

    expect(scheduler.getDiagnostics()).toEqual({
      lastDeferReason: 'background-idle',
      lastDrainDurationMs: 0,
      lastInputToOutputLatencyMs: 0,
      oldestPendingOutputAgeMs: 12,
      pendingOutputTargetCount: 1
    })

    await host.flushIdle({ didTimeout: false, timeRemaining: () => 8 })

    expect(scheduler.getDiagnostics()).toEqual({
      lastDeferReason: null,
      lastDrainDurationMs: 3,
      lastInputToOutputLatencyMs: 0,
      oldestPendingOutputAgeMs: 0,
      pendingOutputTargetCount: 0
    })
  })

  it('measures input-to-output latency by target without inspecting output content', async () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const focused = createTarget('focused', 'focused', undefined, host.drainOrder)
    scheduler.register(focused.target)

    focused.emitInput()
    host.advanceNow(5)
    focused.enqueue()
    await host.flushFrame(8)

    expect(scheduler.getDiagnostics().lastInputToOutputLatencyMs).toBe(13)
  })

  it('cancels scheduled work and ignores later target notifications after disposal', () => {
    const host = createHost()
    const scheduler = new TerminalWorkloadScheduler({ host })
    const focused = createTarget('focused', 'focused', undefined, host.drainOrder)
    const visible = createTarget('visible', 'visible', undefined, host.drainOrder)
    scheduler.register(focused.target)
    scheduler.register(visible.target)
    focused.enqueue()
    visible.enqueue()

    scheduler.dispose()
    focused.enqueue()
    visible.emitInput()

    expect(host.pendingFrames()).toBe(0)
    expect(host.pendingIdleCallbacks()).toBe(0)
  })
})

describe('terminal output batching', () => {
  it('coalesces complete adjacent fragments without changing ANSI or Unicode content', () => {
    const outputs = [
      { sequence: 1, data: '\u001b[31m' },
      { sequence: 2, data: '你' },
      { sequence: 3, data: '\ud83d' },
      { sequence: 4, data: '\ude80\u001b[0m' }
    ].map(measureTerminalOutput)

    expect(takeTerminalOutputBatch(outputs, Number.POSITIVE_INFINITY)).toEqual({
      byteLength: new TextEncoder().encode('\u001b[31m你🚀\u001b[0m').byteLength,
      consumedCount: 4,
      data: '\u001b[31m你🚀\u001b[0m',
      sequence: 4
    })
  })

  it('never splits one source fragment when the adaptive byte budget is smaller', () => {
    expect(
      takeTerminalOutputBatch(
        [
          { sequence: 4, data: 'complete-fragment' },
          { sequence: 5, data: 'next' }
        ].map(measureTerminalOutput),
        4
      )
    ).toEqual({
      byteLength: 17,
      consumedCount: 1,
      data: 'complete-fragment',
      sequence: 4
    })
  })

  it('reuses the conservative byte length measured when each source fragment entered the queue', () => {
    const first = measureTerminalOutput({ sequence: 1, data: '\ud83d' })
    const second = measureTerminalOutput({ sequence: 2, data: '\ude80' })

    expect(first.byteLength).toBe(3)
    expect(second.byteLength).toBe(3)
    expect(takeTerminalOutputBatch([first, second], 5)).toEqual({
      byteLength: 3,
      consumedCount: 1,
      data: '\ud83d',
      sequence: 1
    })
  })
})

function createTarget(
  id: string,
  initialPriority: 'focused' | 'hidden' | 'visible',
  result = { bytesWritten: 128, durationMs: 1 },
  drainOrder: string[] = []
) {
  let pendingCount = 0
  let priority = initialPriority
  const pendingListeners = new Set<() => void>()
  const priorityListeners = new Set<() => void>()
  const inputListeners = new Set<() => void>()
  const nonCriticalWorkListeners = new Set<() => void>()
  const requestedBatchBytes: Array<number | null> = []
  let hasPendingInitialization = false
  const notifyPending = () => pendingListeners.forEach((listener) => listener())

  const target: TerminalWorkloadTarget = {
    drainOutput: async (maximumBatchBytes) => {
      requestedBatchBytes.push(maximumBatchBytes)
      if (pendingCount === 0) return null
      pendingCount -= 1
      drainOrder.push(id)
      notifyPending()
      return result
    },
    getOutputPriority: () => priority,
    hasPendingInitialization: () => hasPendingInitialization,
    hasPendingOutput: () => pendingCount > 0,
    id,
    onOutputPendingChange: (listener) => {
      pendingListeners.add(listener)
      return () => pendingListeners.delete(listener)
    },
    onOutputPriorityChange: (listener) => {
      priorityListeners.add(listener)
      return () => priorityListeners.delete(listener)
    },
    onNonCriticalWorkChange: (listener) => {
      nonCriticalWorkListeners.add(listener)
      return () => nonCriticalWorkListeners.delete(listener)
    },
    onTerminalInput: (listener) => {
      inputListeners.add(listener)
      return () => inputListeners.delete(listener)
    },
    runInitialization: async () => {
      if (!hasPendingInitialization) return false
      hasPendingInitialization = false
      drainOrder.push(`initialize:${id}`)
      nonCriticalWorkListeners.forEach((listener) => listener())
      return true
    }
  }

  return {
    emitInput: () => inputListeners.forEach((listener) => listener()),
    enqueue: (count = 1) => {
      pendingCount += count
      notifyPending()
    },
    enqueueInitialization: () => {
      hasPendingInitialization = true
      nonCriticalWorkListeners.forEach((listener) => listener())
    },
    requestedBatchBytes,
    setPriority: (nextPriority: typeof priority) => {
      priority = nextPriority
      priorityListeners.forEach((listener) => listener())
    },
    target
  }
}

function createHost(): TerminalWorkloadSchedulerHost & {
  readonly advanceNow: (milliseconds: number) => void
  readonly drainOrder: string[]
  readonly flushFrame: (milliseconds: number) => Promise<void>
  readonly flushIdle: (deadline: IdleDeadline) => Promise<void>
  readonly pendingFrames: () => number
  readonly pendingIdleCallbacks: () => number
} {
  let now = 0
  let nextHandle = 1
  const frameCallbacks = new Map<number, FrameRequestCallback>()
  const idleCallbacks = new Map<number, IdleRequestCallback>()
  const drainOrder: string[] = []

  return {
    advanceNow: (milliseconds) => {
      now += milliseconds
    },
    cancelFrame: (handle) => frameCallbacks.delete(handle),
    cancelIdle: (handle) => idleCallbacks.delete(handle),
    drainOrder,
    flushFrame: async (milliseconds) => {
      now += milliseconds
      const callbacks = [...frameCallbacks.values()]
      frameCallbacks.clear()
      callbacks.forEach((callback) => callback(now))
      await Promise.resolve()
      await Promise.resolve()
    },
    flushIdle: async (deadline) => {
      const callbacks = [...idleCallbacks.values()]
      idleCallbacks.clear()
      callbacks.forEach((callback) => callback(deadline))
      await Promise.resolve()
      await Promise.resolve()
    },
    now: () => now,
    pendingFrames: () => frameCallbacks.size,
    pendingIdleCallbacks: () => idleCallbacks.size,
    requestFrame: (callback) => {
      const handle = nextHandle++
      frameCallbacks.set(handle, callback)
      return handle
    },
    requestIdle: (callback) => {
      const handle = nextHandle++
      idleCallbacks.set(handle, callback)
      return handle
    }
  }
}
