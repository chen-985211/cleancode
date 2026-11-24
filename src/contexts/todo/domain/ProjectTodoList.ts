export const todoStates = ['todo', 'active', 'done'] as const
export type TodoState = (typeof todoStates)[number]
export interface TodoDraft {
  id: string
  text: string
  note: string
  links: string[]
  images: string[]
  status: TodoState
}
export interface TodoItem extends TodoDraft {
  createdAt: number
  completedAt: number | null
}

export function isTodoId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
}
export function httpLink(text: string): string | null {
  try {
    const url = new URL(text)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
export function hasTodoContent(d: TodoDraft) {
  return Boolean(d.text.trim() || d.note.trim() || d.links.length || d.images.length)
}
export function isTodoDraft(value: unknown): value is TodoDraft {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<TodoDraft>
  return (
    isTodoId(d.id) &&
    typeof d.text === 'string' &&
    typeof d.note === 'string' &&
    todoStates.includes(d.status!) &&
    Array.isArray(d.links) &&
    d.links.every((v) => typeof v === 'string' && httpLink(v)) &&
    Array.isArray(d.images) &&
    d.images.every(isTodoId)
  )
}
export function isTodoItem(value: unknown): value is TodoItem {
  if (!isTodoDraft(value) || !hasTodoContent(value)) return false
  const item = value as TodoItem
  return (
    Number.isFinite(item.createdAt) &&
    (item.status === 'done' ? Number.isFinite(item.completedAt) : item.completedAt === null)
  )
}
export function updateTodoList(items: TodoItem[], draft: TodoDraft, now: number): TodoItem[] {
  const old = items.find((item) => item.id === draft.id)
  if (!hasTodoContent(draft)) return items.filter((item) => item.id !== draft.id)
  const item: TodoItem = {
    id: draft.id,
    text: draft.text,
    note: draft.note,
    status: draft.status,
    links: [...new Set(draft.links.map((link) => httpLink(link)!))],
    images: [...new Set(draft.images)],
    createdAt: old?.createdAt ?? now,
    completedAt: draft.status === 'done' ? (old?.completedAt ?? now) : null
  }
  return old ? items.map((t) => (t.id === item.id ? item : t)) : [...items, item]
}
