import { TerminalXtermRasterTarget } from '../../../src/presentation/app-shell/terminalXtermRasterTarget'

describe('terminal xterm raster target', () => {
  let intersectionObservers: FakeIntersectionObserver[]
  let resizeObservers: FakeResizeObserver[]

  beforeEach(() => {
    intersectionObservers = []
    resizeObservers = []
    vi.stubGlobal(
      'IntersectionObserver',
      createIntersectionObserverConstructor(intersectionObservers)
    )
    vi.stubGlobal('ResizeObserver', createResizeObserverConstructor(resizeObservers))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
    document.head.querySelector('[data-test-terminal-raster-style]')?.remove()
  })

  it('notifies when focus moves into and out of an attached visible terminal', () => {
    const { target, viewport } = createAttachedTarget(intersectionObservers)
    const input = document.createElement('textarea')
    const outside = document.createElement('button')
    viewport.append(input)
    document.body.append(outside)
    const onPriorityChange = vi.fn()
    target.target.onRasterPriorityChange?.(onPriorityChange)

    input.focus()

    expect(target.target.getRasterPriority()).toBe('focused')
    expect(onPriorityChange).toHaveBeenCalledOnce()

    outside.focus()

    expect(target.target.getRasterPriority()).toBe('visible')
    expect(onPriorityChange).toHaveBeenCalledTimes(2)
  })

  it('projects the shared visibility priority onto the terminal node owner', () => {
    const { anchor, target, viewport } = createAttachedTarget(intersectionObservers)
    const input = document.createElement('textarea')
    viewport.append(input)

    expect(anchor.dataset.terminalSurfacePriority).toBe('visible')

    input.focus()
    expect(anchor.dataset.terminalSurfacePriority).toBe('focused')

    intersectionObservers[0]?.emit(false)
    expect(anchor.dataset.terminalSurfacePriority).toBe('hidden')

    target.detach(viewport)
    expect(anchor.dataset.terminalSurfacePriority).toBeUndefined()
  })

  it('uses the same visibility projection for an Agent terminal owner', () => {
    const { anchor } = createAttachedTarget(intersectionObservers, {
      ownerAttribute: 'agent'
    })

    expect(anchor.dataset.agentConsoleNode).toBe('agent-1')
    expect(anchor.dataset.terminalSurfacePriority).toBe('visible')

    intersectionObservers[0]?.emit(false)
    expect(anchor.dataset.terminalSurfacePriority).toBe('hidden')
  })

  it('keeps a parked visibility-hidden terminal hidden even when it intersects, then announces its return', async () => {
    const style = document.createElement('style')
    style.dataset.testTerminalRasterStyle = 'true'
    style.textContent = '.terminal-node-anchor--parked { visibility: hidden; }'
    document.head.append(style)
    const { anchor, target } = createAttachedTarget(intersectionObservers)
    const onPriorityChange = vi.fn()
    target.target.onRasterPriorityChange?.(onPriorityChange)

    anchor.classList.add('terminal-node-anchor--parked')
    await flushMutationObservers()
    intersectionObservers[0]?.emit(true)

    expect(target.target.getRasterPriority()).toBe('hidden')
    expect(onPriorityChange).toHaveBeenCalledOnce()

    anchor.classList.remove('terminal-node-anchor--parked')
    await flushMutationObservers()

    expect(target.target.getRasterPriority()).toBe('visible')
    expect(onPriorityChange).toHaveBeenCalledTimes(2)
  })

  it('observes only the terminal presentation owner, not animated React Flow ancestors', () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const { anchor, canvas } = createAttachedTarget(intersectionObservers)

    expect(observe).toHaveBeenCalledOnce()
    expect(observe).toHaveBeenCalledWith(anchor, {
      attributeFilter: ['class', 'data-terminal-parked', 'hidden'],
      attributes: true
    })
    expect(observe.mock.calls.some(([target]) => target === canvas)).toBe(false)
  })

  it('reports scale-specific backing pixel cost and announces geometry changes', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
    const { target, viewport } = createAttachedTarget(intersectionObservers, {
      width: 400,
      height: 240
    })
    const onCostChange = vi.fn()
    target.target.onRasterCostChange?.(onCostChange)

    expect(target.target.getRasterCost(1)).toBe(800 * 480)
    expect(target.target.getRasterCost(1.75)).toBe(1_400 * 840)

    defineElementSize(viewport, 500, 300)
    resizeObservers[0]?.emit()

    expect(target.target.getRasterCost(1.75)).toBe(1_750 * 1_050)
    expect(onCostChange).toHaveBeenCalledOnce()
  })

  it('disconnects every observer and listener on detach', async () => {
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')
    const { anchor, target, viewport } = createAttachedTarget(intersectionObservers, {
      width: 400,
      height: 240
    })
    const removeElementListener = vi.spyOn(viewport, 'removeEventListener')
    const input = document.createElement('textarea')
    viewport.append(input)
    const onPriorityChange = vi.fn()
    const onCostChange = vi.fn()
    target.target.onRasterPriorityChange?.(onPriorityChange)
    target.target.onRasterCostChange?.(onCostChange)

    target.detach(viewport)
    onPriorityChange.mockClear()
    onCostChange.mockClear()

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    anchor.classList.add('terminal-node-anchor--parked')
    intersectionObservers[0]?.emit(true)
    defineElementSize(viewport, 800, 480)
    resizeObservers[0]?.emit()
    window.dispatchEvent(new Event('resize'))
    await flushMutationObservers()

    expect(target.target.getRasterPriority()).toBe('hidden')
    expect(target.target.getRasterCost(1.75)).toBe(0)
    expect(onPriorityChange).not.toHaveBeenCalled()
    expect(onCostChange).not.toHaveBeenCalled()
    expect(intersectionObservers[0]?.disconnect).toHaveBeenCalledOnce()
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce()
    expect(mutationDisconnect).toHaveBeenCalledOnce()
    expect(removeElementListener).toHaveBeenCalledWith('focusin', expect.any(Function))
    expect(removeElementListener).toHaveBeenCalledWith('focusout', expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})

function createAttachedTarget(
  intersectionObservers: FakeIntersectionObserver[],
  {
    height = 240,
    ownerAttribute = 'terminal',
    width = 400
  }: {
    readonly height?: number
    readonly ownerAttribute?: 'agent' | 'terminal'
    readonly width?: number
  } = {}
) {
  const canvas = document.createElement('div')
  canvas.className = 'canvas-surface'
  const anchor = document.createElement('div')
  anchor.className = 'terminal-node-anchor'
  if (ownerAttribute === 'agent') anchor.dataset.agentConsoleNode = 'agent-1'
  else anchor.dataset.terminalBlockId = 'terminal-block'
  const viewport = document.createElement('div')
  defineElementSize(viewport, width, height)
  anchor.append(viewport)
  canvas.append(anchor)
  document.body.append(canvas)
  const target = new TerminalXtermRasterTarget(vi.fn())
  target.attach(viewport)
  intersectionObservers[0]?.emit(true)
  return { anchor, canvas, target, viewport }
}

function createIntersectionObserverConstructor(instances: FakeIntersectionObserver[]) {
  return class {
    readonly disconnect = vi.fn()
    private readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      instances.push(this as unknown as FakeIntersectionObserver)
    }

    observe = vi.fn()
    unobserve = vi.fn()
    takeRecords = vi.fn(() => [])
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds = [0]

    emit(isIntersecting: boolean): void {
      this.callback(
        [{ isIntersecting } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      )
    }
  } as unknown as typeof IntersectionObserver
}

interface FakeIntersectionObserver {
  readonly disconnect: ReturnType<typeof vi.fn>
  emit(isIntersecting: boolean): void
}

function createResizeObserverConstructor(instances: FakeResizeObserver[]) {
  return class {
    readonly disconnect = vi.fn()

    constructor(private readonly callback: ResizeObserverCallback) {
      instances.push(this as unknown as FakeResizeObserver)
    }

    observe = vi.fn()
    unobserve = vi.fn()

    emit(): void {
      this.callback([], this as unknown as ResizeObserver)
    }
  } as unknown as typeof ResizeObserver
}

interface FakeResizeObserver {
  readonly disconnect: ReturnType<typeof vi.fn>
  emit(): void
}

function defineElementSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: height },
    clientWidth: { configurable: true, value: width }
  })
}

async function flushMutationObservers(): Promise<void> {
  await Promise.resolve()
}
