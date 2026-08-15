import type { TerminalSurfaceRasterTarget } from './terminalSurfaceRegistry'
import { observeTerminalRasterElement } from './terminalRasterObserverHub'
import type { TerminalRasterScale } from './terminalZoomRasterPolicy'

export class TerminalXtermRasterTarget {
  private element: HTMLDivElement | null = null
  private mutationObserver: MutationObserver | null = null
  private observerCleanup: (() => void) | null = null
  private presentationOwner: HTMLElement | null = null
  private isFocused = false
  private isIntersecting = false
  private isPresentationVisible = false
  private priority: 'focused' | 'visible' | 'hidden' = 'hidden'
  private rasterGeometry: RasterGeometry | null = null
  private scale: TerminalRasterScale = 1
  private readonly costListeners = new Set<() => void>()
  private readonly priorityListeners = new Set<() => void>()

  readonly target: TerminalSurfaceRasterTarget = {
    getRasterCost: (scale) => this.getRasterCost(scale),
    getRasterPriority: () => this.priority,
    getRasterScale: () => this.scale,
    onRasterCostChange: (listener) => {
      this.costListeners.add(listener)
      return () => this.costListeners.delete(listener)
    },
    onRasterPriorityChange: (listener) => {
      this.priorityListeners.add(listener)
      return () => this.priorityListeners.delete(listener)
    },
    setRasterScale: (scale) => this.setScale(scale)
  }

  constructor(private readonly applyScale: (scale: TerminalRasterScale) => void) {}

  attach(element: HTMLDivElement): void {
    this.detach(this.element)
    this.element = element
    this.presentationOwner = findTerminalPresentationOwner(element)
    element.addEventListener('focusin', this.handleFocusIn)
    element.addEventListener('focusout', this.handleFocusOut)
    this.isFocused = element.contains(element.ownerDocument.activeElement)
    this.isIntersecting = element.isConnected
    this.isPresentationVisible = isElementPresentationVisible(element)
    this.refreshPriority()
    this.refreshRasterGeometry()
    element.dataset.terminalRasterScale = String(this.scale)

    this.observerCleanup = observeTerminalRasterElement(element, {
      onGeometryChange: this.handleGeometryChange,
      onIntersectionChange: (isIntersecting) => {
        if (this.element !== element) return
        this.isIntersecting = isIntersecting
        this.refreshPriority()
      }
    })

    if (typeof MutationObserver !== 'undefined') {
      const presentationOwner = this.presentationOwner
      if (presentationOwner) {
        this.mutationObserver = new MutationObserver(() => {
          if (this.element !== element) return
          this.isPresentationVisible = isElementPresentationVisible(element)
          this.isFocused = element.contains(element.ownerDocument.activeElement)
          this.refreshPriority()
          this.refreshRasterGeometry()
        })
        observeTerminalPresentationOwner(this.mutationObserver, presentationOwner)
      }
    }
  }

  detach(element: HTMLDivElement | null): void {
    if (!element || this.element !== element) return
    element.removeEventListener('focusin', this.handleFocusIn)
    element.removeEventListener('focusout', this.handleFocusOut)
    this.observerCleanup?.()
    this.observerCleanup = null
    this.mutationObserver?.disconnect()
    this.mutationObserver = null
    if (this.presentationOwner) delete this.presentationOwner.dataset.terminalSurfacePriority
    this.presentationOwner = null
    this.element = null
    this.isFocused = false
    this.isIntersecting = false
    this.isPresentationVisible = false
    this.refreshPriority()
    this.updateRasterGeometry(null)
  }

  private setScale(scale: TerminalRasterScale): void {
    if (scale === this.scale) return
    this.applyScale(scale)
    this.scale = scale
    if (this.element) this.element.dataset.terminalRasterScale = String(scale)
  }

  private readonly handleFocusIn = (): void => {
    if (!this.element) return
    this.isFocused = true
    this.refreshPriority()
  }

  private readonly handleFocusOut = (event: FocusEvent): void => {
    const element = this.element
    if (!element) return
    this.isFocused = event.relatedTarget instanceof Node && element.contains(event.relatedTarget)
    this.refreshPriority()
  }

  private readonly handleGeometryChange = (): void => {
    this.refreshRasterGeometry()
  }

  private refreshPriority(): void {
    const nextPriority =
      !this.element || !this.isIntersecting || !this.isPresentationVisible
        ? 'hidden'
        : this.isFocused
          ? 'focused'
          : 'visible'
    const didChange = nextPriority !== this.priority
    this.priority = nextPriority
    if (this.presentationOwner) {
      this.presentationOwner.dataset.terminalSurfacePriority = nextPriority
    }
    if (!didChange) return
    for (const listener of this.priorityListeners) listener()
  }

  private refreshRasterGeometry(): void {
    const element = this.element
    if (!element) {
      this.updateRasterGeometry(null)
      return
    }
    const width = element.clientWidth
    const height = element.clientHeight
    const devicePixelRatio = element.ownerDocument.defaultView?.devicePixelRatio ?? 1
    this.updateRasterGeometry(
      width > 0 && height > 0 && Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
        ? { devicePixelRatio, height, width }
        : null
    )
  }

  private updateRasterGeometry(geometry: RasterGeometry | null): void {
    if (isSameRasterGeometry(this.rasterGeometry, geometry)) return
    this.rasterGeometry = geometry
    for (const listener of this.costListeners) listener()
  }

  private getRasterCost(scale: TerminalRasterScale): number {
    const geometry = this.rasterGeometry
    if (!geometry) return 0
    const width = Math.ceil(geometry.width * geometry.devicePixelRatio * scale)
    const height = Math.ceil(geometry.height * geometry.devicePixelRatio * scale)
    return width * height
  }
}

function findTerminalPresentationOwner(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>('[data-terminal-block-id], [data-agent-console-node]')
}

interface RasterGeometry {
  readonly devicePixelRatio: number
  readonly height: number
  readonly width: number
}

function isSameRasterGeometry(left: RasterGeometry | null, right: RasterGeometry | null): boolean {
  return (
    left?.devicePixelRatio === right?.devicePixelRatio &&
    left?.height === right?.height &&
    left?.width === right?.width
  )
}

function observeTerminalPresentationOwner(observer: MutationObserver, owner: HTMLElement): void {
  observer.observe(owner, {
    attributeFilter: ['class', 'data-terminal-parked', 'hidden'],
    attributes: true
  })
}

function isElementPresentationVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  const view = element.ownerDocument.defaultView
  if (!view) return true

  const elementStyle = view.getComputedStyle(element)
  if (elementStyle.visibility === 'hidden' || elementStyle.visibility === 'collapse') return false

  let current: HTMLElement | null = element
  while (current) {
    const style = view.getComputedStyle(current)
    if (style.display === 'none' || style.getPropertyValue('content-visibility') === 'hidden') {
      return false
    }
    current = current.parentElement
  }
  return true
}
