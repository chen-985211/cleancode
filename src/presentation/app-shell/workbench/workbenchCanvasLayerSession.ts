interface LayerRelease {
  readonly ids: readonly string[]
}
interface LayerSnapshot {
  readonly nodeOrder: readonly string[]
  readonly releases: readonly LayerRelease[]
}

// Releases may finish saving positions out of order. Keep their optimistic
// previews separate, and serialize only successful layer writes in gesture order.
// The queue belongs to its workspace and can finish after its view is unmounted.
export class WorkbenchCanvasLayerSession {
  private snapshot: LayerSnapshot
  private readonly listeners = new Set<() => void>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(nodeOrder: readonly string[]) {
    this.snapshot = { nodeOrder, releases: [] }
  }

  getSnapshot = (): LayerSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(snapshot: LayerSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }

  release({
    ids,
    commit,
    project,
    save
  }: {
    readonly ids: readonly string[]
    readonly commit: () => boolean | void | Promise<boolean | void>
    readonly project: (nodeOrder: readonly string[]) => readonly string[]
    readonly save: (nodeOrder: readonly string[]) => Promise<void>
  }): Promise<boolean> {
    const release = { ids }
    this.publish({ ...this.snapshot, releases: [...this.snapshot.releases, release] })
    // Attach rejection handling immediately, even while an older release is pending.
    const positionSaved = commitLayerPosition(commit)
    const completed = this.queue.then(async () => {
      let nodeOrder = this.snapshot.nodeOrder
      let saved = false
      try {
        if (await positionSaved) {
          const nextOrder = project(nodeOrder)
          await save(nextOrder)
          nodeOrder = nextOrder
          saved = true
        }
      } catch {
        // Position and layer adapters own error feedback. Only roll back this preview.
      }
      this.publish({
        nodeOrder,
        releases: this.snapshot.releases.filter((entry) => entry !== release)
      })
      return saved
    })
    this.queue = completed
    return completed
  }
}

export async function commitLayerPosition(
  commit: () => boolean | void | Promise<boolean | void>
): Promise<boolean> {
  try {
    return (await commit()) !== false
  } catch {
    return false
  }
}
