import type { TodoApi, TodoImage } from '../application/ProjectTodos'
import {
  hasTodoContent,
  updateTodoList,
  type TodoDraft,
  type TodoItem
} from '../domain/ProjectTodoList'

export function blankTodo(): TodoDraft {
  return { id: crypto.randomUUID(), text: '', note: '', status: 'todo', links: [], images: [] }
}
type SessionState = {
  items: TodoItem[]
  expanded: ReadonlySet<string>
  showCompleted: boolean
  loading: boolean
  loadFailed: boolean
  saveFailed: boolean
}
export class TodoSession {
  readonly reading: {
    scrollTop: number
    anchor?: { id: string; inset: number }
  } = { scrollTop: 0 }
  private state: SessionState = {
    items: [],
    expanded: new Set(),
    showCompleted: true,
    loading: true,
    loadFailed: false,
    saveFailed: false
  }
  private readonly listeners = new Set<() => void>()
  private readonly latest = new Map<string, TodoDraft>()
  private inFlight: TodoDraft[] | null = null
  private writeQueued = false
  private readonly unsavedImages = new Map<string, TodoImage>()
  constructor(
    private readonly api: TodoApi,
    private readonly projectId: string
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  snapshot = () => this.state
  private publish(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  private started = false
  start() {
    if (!this.started) {
      this.started = true
      void this.load()
    }
  }
  private async load() {
    this.publish({ loading: true, loadFailed: false })
    try {
      this.publish({ items: await this.api.listTodos(this.projectId), loading: false })
    } catch {
      this.publish({ loadFailed: true, loading: false })
    }
  }
  find(id: string) {
    return this.state.items.find((item) => item.id === id)
  }
  setShowCompleted(showCompleted: boolean) {
    this.publish({ showCompleted })
  }
  setExpanded(id: string, expanded: boolean) {
    if (this.state.expanded.has(id) === expanded) return
    const next = new Set(this.state.expanded)
    if (expanded) next.add(id)
    else next.delete(id)
    this.publish({ expanded: next })
  }
  change(changes: TodoDraft | TodoDraft[], images: TodoImage[] = []) {
    if (this.state.loading || this.state.loadFailed) return
    const drafts = (Array.isArray(changes) ? changes : [changes]).filter(
      (draft) => hasTodoContent(draft) || this.find(draft.id) || this.latest.has(draft.id)
    )
    if (!drafts.length) return
    for (const image of images) this.unsavedImages.set(image.id, image)
    const items = updateTodoList(this.state.items, drafts, Date.now())
    const byId = new Map(items.map((item) => [item.id, item]))
    for (const draft of drafts) {
      const item = byId.get(draft.id)
      this.latest.set(draft.id, {
        ...draft,
        statusOrder: item?.statusOrder,
        ...(item?.status === 'done' && { completedAt: item.completedAt })
      })
    }
    this.publish({ items })
    if (this.inFlight) this.writeQueued = true
    else void this.writePending()
  }
  private async writePending() {
    const drafts = [...this.latest.values()]
    drafts.sort((a, b) => (a.statusOrder ?? 0) - (b.statusOrder ?? 0))
    this.inFlight = drafts
    this.writeQueued = false
    const imageIds = new Set(drafts.flatMap((draft) => draft.images))
    const images = [...imageIds].flatMap((id) => this.unsavedImages.get(id) ?? [])
    const content = drafts.length === 1 ? { draft: drafts[0] } : { drafts }
    let saveFailed = false
    try {
      await this.api.saveTodo({ projectId: this.projectId, ...content, images })
      if (this.inFlight !== drafts) return
      for (const image of images) this.unsavedImages.delete(image.id)
      for (const draft of drafts) {
        if (this.latest.get(draft.id) === draft) this.latest.delete(draft.id)
      }
    } catch {
      if (this.inFlight !== drafts) return
      saveFailed = true
    }
    this.inFlight = null
    if (!this.latest.size) this.unsavedImages.clear()
    if (this.writeQueued) void this.writePending()
    else if (this.state.saveFailed !== saveFailed) this.publish({ saveFailed })
  }
  flushOnPageHide() {
    // The renderer may leave before the acknowledgement. Hand the full pending
    // batch to the main process's per-project queue while IPC is still available.
    if (this.writeQueued) void this.writePending()
  }
  retry() {
    if (this.state.loadFailed) {
      void this.load()
      return
    }
    if (this.state.saveFailed && !this.inFlight) void this.writePending()
  }
  image(id: string) {
    const data = this.unsavedImages.get(id)?.data
    return data ? Promise.resolve(data) : this.api.readTodoImage({ projectId: this.projectId, id })
  }
}
