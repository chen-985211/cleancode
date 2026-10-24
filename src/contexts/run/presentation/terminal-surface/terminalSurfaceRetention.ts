import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'

interface RetainableSurface {
  dispose(): void
  setScrollbackRows(rows: TerminalScrollbackRows): void
}

const retainedSurfaceLimit = 6
const retainedSurfaceLifetimeMs = 5 * 60_000

interface RetainedSurface<Surface> {
  readonly surface: Surface
  readonly timer: ReturnType<typeof setTimeout>
  readonly ownerKey: string
}

/** One shared count/age budget for mounted streams and detached projections. */
export class TerminalSurfaceRetention<Surface extends RetainableSurface> {
  private readonly entries = new Map<string, RetainedSurface<Surface>>()
  private trimQueued = false

  constructor(private readonly onChange: () => void = () => undefined) {}

  peek(key: string): Surface | undefined {
    return this.entries.get(key)?.surface
  }

  take(key: string, ownerKey: string): Surface | undefined {
    for (const [otherKey, entry] of this.entries) {
      if (otherKey !== key && entry.ownerKey === ownerKey) this.evict(otherKey)
    }
    const entry = this.entries.get(key)
    if (!entry) return undefined
    clearTimeout(entry.timer)
    this.entries.delete(key)
    this.onChange()
    return entry.surface
  }

  put(key: string, ownerKey: string, surface: Surface): void {
    this.evict(key)
    const timer = setTimeout(() => this.evict(key), retainedSurfaceLifetimeMs)
    this.entries.set(key, { surface, timer, ownerKey })
    this.onChange()
    if (this.trimQueued) return
    this.trimQueued = true
    // React removes outgoing hosts before attaching incoming hosts in the same commit.
    // Let those incoming views claim their leases before enforcing the inactive budget.
    queueMicrotask(() => {
      this.trimQueued = false
      while (this.entries.size > retainedSurfaceLimit) this.evict(this.entries.keys().next().value!)
    })
  }

  setScrollbackRows(rows: TerminalScrollbackRows): void {
    for (const entry of this.entries.values()) entry.surface.setScrollbackRows(rows)
  }

  dispose(): void {
    for (const key of this.entries.keys()) this.evict(key)
  }

  evict(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    clearTimeout(entry.timer)
    entry.surface.dispose()
    this.onChange()
  }
}
