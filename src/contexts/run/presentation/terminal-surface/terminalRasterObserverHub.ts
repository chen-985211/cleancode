interface TerminalRasterObservationCallbacks {
  readonly onGeometryChange: () => void
  readonly onIntersectionChange: (isIntersecting: boolean) => void
}

const observerHubsByOwner = new WeakMap<Element | Document, TerminalRasterObserverHub>()

export function observeTerminalRasterElement(
  element: HTMLElement,
  callbacks: TerminalRasterObservationCallbacks
): () => void {
  const intersectionRoot = element.closest('.canvas-surface')
  const owner = intersectionRoot ?? element.ownerDocument
  let hub = observerHubsByOwner.get(owner)
  if (!hub) {
    hub = new TerminalRasterObserverHub(intersectionRoot, element.ownerDocument.defaultView)
    observerHubsByOwner.set(owner, hub)
  }

  const release = hub.observe(element, callbacks)
  let isReleased = false
  return () => {
    if (isReleased) return
    isReleased = true
    release()
    if (hub?.isEmpty) {
      hub.dispose()
      observerHubsByOwner.delete(owner)
    }
  }
}

class TerminalRasterObserverHub {
  private readonly observations = new Map<Element, TerminalRasterObservationCallbacks>()
  private readonly intersectionObserver: IntersectionObserver | null
  private readonly resizeObserver: ResizeObserver | null
  private readonly view: Window | null

  constructor(intersectionRoot: Element | null, view: Window | null) {
    this.view = view
    this.intersectionObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(this.handleIntersection, { root: intersectionRoot })
    this.resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.handleResize)
    this.view?.addEventListener('resize', this.handleWindowResize)
  }

  get isEmpty(): boolean {
    return this.observations.size === 0
  }

  observe(element: Element, callbacks: TerminalRasterObservationCallbacks): () => void {
    this.observations.set(element, callbacks)
    this.intersectionObserver?.observe(element)
    this.resizeObserver?.observe(element)

    return () => {
      if (!this.observations.delete(element)) return
      this.intersectionObserver?.unobserve(element)
      this.resizeObserver?.unobserve(element)
    }
  }

  dispose(): void {
    this.intersectionObserver?.disconnect()
    this.resizeObserver?.disconnect()
    this.view?.removeEventListener('resize', this.handleWindowResize)
    this.observations.clear()
  }

  private readonly handleIntersection: IntersectionObserverCallback = (entries) => {
    for (const entry of entries) {
      this.observations.get(entry.target)?.onIntersectionChange(entry.isIntersecting)
    }
  }

  private readonly handleResize: ResizeObserverCallback = (entries) => {
    if (entries.length === 0) {
      this.handleWindowResize()
      return
    }
    for (const entry of entries) this.observations.get(entry.target)?.onGeometryChange()
  }

  private readonly handleWindowResize = (): void => {
    for (const observation of this.observations.values()) observation.onGeometryChange()
  }
}
