import type { WorkspaceDefaults } from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'

interface SaveState {
  readonly value: WorkspaceDefaults
  readonly status: 'idle' | 'saving' | 'saved' | 'error'
  readonly error: unknown
  readonly revision: number
}

/** Owns drafts beyond settings mounts; each project has one serial write stream. */
export class WorkspaceDefaultsAutosave {
  private readonly states = new Map<string, SaveState>()
  private readonly writes = new Map<string, Promise<void>>()
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly save: (directory: string, value: WorkspaceDefaults) => Promise<void>
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  get(directory: string): SaveState | undefined {
    return this.states.get(directory)
  }
  seed(directory: string, value: WorkspaceDefaults): void {
    if (!this.states.has(directory))
      this.set(directory, { value, status: 'idle', error: null, revision: 0 })
  }
  edit(directory: string, value: WorkspaceDefaults): void {
    this.set(directory, {
      value,
      status: 'saving',
      error: null,
      revision: (this.get(directory)?.revision ?? 0) + 1
    })
    if (!this.writes.has(directory)) this.start(directory)
  }
  async flush(directory: string): Promise<void> {
    while (this.writes.has(directory)) await this.writes.get(directory)
    const state = this.get(directory)
    if (state?.status === 'error') throw state.error
  }
  async retry(directory: string): Promise<void> {
    const state = this.get(directory)
    if (!state) return
    this.edit(directory, state.value)
    await this.flush(directory)
  }
  private set(directory: string, state: SaveState): void {
    this.states.set(directory, state)
    this.listeners.forEach((listener) => listener())
  }
  private start(directory: string): void {
    // The loop consumes all newer revisions before releasing this project's write stream.
    const pending = this.drain(directory).finally(() => {
      this.writes.delete(directory)
      if (this.get(directory)?.status === 'saving') this.start(directory)
    })
    this.writes.set(directory, pending)
  }
  private async drain(directory: string): Promise<void> {
    for (;;) {
      const sent = this.get(directory)!
      let error: unknown = null
      try {
        await this.save(directory, sent.value)
      } catch (failure) {
        error = failure
      }
      const latest = this.get(directory)!
      if (latest.revision !== sent.revision) continue
      this.set(directory, { ...latest, status: error ? 'error' : 'saved', error })
      return
    }
  }
}
