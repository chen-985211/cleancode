export const todoStates = ['todo', 'active', 'done'] as const
export type TodoState = (typeof todoStates)[number]
export interface TodoDraft {
  id: string
  text: string
  note: string
  links: string[]
  images: string[]
  status: TodoState
  /** Order of entry into this status. Autosave carries it across retries. */
  statusOrder?: number
  /** Time of the completion carried by this status order, including a delayed save. */
  completedAt?: number | null
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
    (d.statusOrder === undefined || (Number.isSafeInteger(d.statusOrder) && d.statusOrder > 0)) &&
    (d.completedAt == null || Number.isFinite(d.completedAt)) &&
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

export function todosInStatus(items: TodoItem[], status: TodoState) {
  const rows = items.filter((item) => item.status === status)
  // Unranked items keep their existing display order until they next change status.
  if (status === 'todo') rows.reverse()
  return rows.sort(
    (a, b) =>
      (b.statusOrder ?? 0) - (a.statusOrder ?? 0) || (b.completedAt ?? 0) - (a.completedAt ?? 0)
  )
}

function compactStatusOrders(byId: Map<string, TodoItem>) {
  const ranks = [...new Set(Array.from(byId.values(), (item) => item.statusOrder ?? 0))]
  const compact = new Map(ranks.sort((a, b) => a - b).map((rank, i) => [rank, i + 1]))
  for (const item of byId.values()) {
    if (item.statusOrder !== undefined)
      byId.set(item.id, { ...item, statusOrder: compact.get(item.statusOrder) })
  }
  return ranks.length
}

export function updateTodoList(
  items: TodoItem[],
  changes: TodoDraft | TodoDraft[],
  now: number
): TodoItem[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  let lastOrder = items.reduce((last, item) => Math.max(last, item.statusOrder ?? 0), 0)
  for (const draft of Array.isArray(changes) ? changes : [changes]) {
    if (!hasTodoContent(draft)) {
      byId.delete(draft.id)
      continue
    }
    const old = byId.get(draft.id)
    let statusOrder = old?.statusOrder
    const newerEntry = (draft.statusOrder ?? 0) > (statusOrder ?? 0)
    // A retried draft can have returned to its stored status after visiting another.
    if (old?.status !== draft.status || newerEntry) {
      if (lastOrder === Number.MAX_SAFE_INTEGER) lastOrder = compactStatusOrders(byId)
      lastOrder = Math.max(lastOrder + 1, draft.statusOrder ?? 0)
      statusOrder = lastOrder
    }
    byId.set(draft.id, {
      id: draft.id,
      text: draft.text,
      note: draft.note,
      status: draft.status,
      links: [...new Set(draft.links.map((link) => httpLink(link)!))],
      images: [...new Set(draft.images)],
      createdAt: old?.createdAt ?? now,
      statusOrder,
      completedAt:
        draft.status === 'done'
          ? ((newerEntry ? draft.completedAt : old?.completedAt) ?? now)
          : null
    })
  }
  return [...byId.values()]
}
