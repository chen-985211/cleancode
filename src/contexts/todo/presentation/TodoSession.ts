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
  loading: boolean
  loadFailed: boolean
  saveFailed: boolean
}
export class TodoSession {
  private state: SessionState = { items: [], loading: true, loadFailed: false, saveFailed: false }
  private readonly listeners = new Set<() => void>()
  private readonly latest = new Map<string, TodoDraft>()
  private readonly failed = new Set<string>()
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
  change(draft: TodoDraft, images: TodoImage[] = []) {
    if (
      this.state.loading ||
      this.state.loadFailed ||
      (!hasTodoContent(draft) && !this.find(draft.id) && !this.failed.has(draft.id))
    )
      return
    for (const image of images) this.unsavedImages.set(image.id, image)
    this.latest.set(draft.id, draft)
    this.publish({ items: updateTodoList(this.state.items, draft, Date.now()) })
    void this.write(draft)
  }
  private async write(draft: TodoDraft) {
    const images = draft.images.flatMap((id) => this.unsavedImages.get(id) ?? [])
    try {
      await this.api.saveTodo({ projectId: this.projectId, draft, images })
      for (const image of images) this.unsavedImages.delete(image.id)
      if (this.latest.get(draft.id) !== draft) return
      this.latest.delete(draft.id)
      this.failed.delete(draft.id)
    } catch {
      if (this.latest.get(draft.id) !== draft) return
      this.failed.add(draft.id)
    }
    this.publish({ saveFailed: this.failed.size > 0 })
  }
  retry() {
    if (this.state.loadFailed) {
      void this.load()
      return
    }
    for (const id of this.failed) {
      const d = this.latest.get(id)
      if (d) void this.write(d)
    }
  }
  image(id: string) {
    const data = this.unsavedImages.get(id)?.data
    return data ? Promise.resolve(data) : this.api.readTodoImage({ projectId: this.projectId, id })
  }
}
