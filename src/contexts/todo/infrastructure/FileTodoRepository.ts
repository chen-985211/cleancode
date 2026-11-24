import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { isTodoId, isTodoItem, type TodoItem } from '../domain/ProjectTodoList'
import type { TodoImage, TodoRepository } from '../application/ProjectTodos'

// Serialize each project's complete read–modify–replace operation, including attachment cleanup.
export class FileTodoRepository implements TodoRepository {
  private readonly pending = new Map<string, Promise<unknown>>()
  constructor(private readonly root: string) {}
  async drain() {
    await Promise.allSettled(this.pending.values())
  }
  list(projectId: string) {
    return this.serial(projectId, async (dir) => {
      const items = await readItems(dir)
      await discardUnusedImages(dir, items)
      return items
    })
  }
  async image(projectId: string, id: string) {
    if (!isTodoId(id)) throw new Error('Invalid to-do image identifier.')
    return readFile(join(this.directory(projectId), id + '.image'), 'utf8')
  }
  change(projectId: string, images: TodoImage[], apply: (items: TodoItem[]) => TodoItem[]) {
    return this.serial(projectId, async (dir) => {
      const before = await readItems(dir)
      const after = apply(before)
      const known = new Set(before.flatMap((item) => item.images))
      const needed = new Set(after.flatMap((item) => item.images))
      const added = new Map(images.map((image) => [image.id, image.data]))
      for (const id of needed)
        if (!known.has(id) && !added.has(id)) throw new Error('Missing to-do image.')
      await mkdir(dir, { recursive: true })
      for (const [id, data] of added) {
        if (!needed.has(id) || known.has(id)) continue
        await replaceFile(dir, id + '.image', data)
      }
      await replaceFile(dir, 'list.json', JSON.stringify({ version: 1, items: after }))
      for (const id of known)
        if (!needed.has(id)) await rm(join(dir, id + '.image'), { force: true })
    })
  }
  private directory(projectId: string) {
    return join(this.root, 'todos', createHash('sha256').update(projectId).digest('hex'))
  }
  private async serial<T>(key: string, work: (dir: string) => Promise<T>): Promise<T> {
    const next = (this.pending.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => work(this.directory(key)))
    this.pending.set(key, next)
    try {
      return await next
    } finally {
      if (this.pending.get(key) === next) this.pending.delete(key)
    }
  }
}
function missing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}
async function readItems(dir: string): Promise<TodoItem[]> {
  let raw: string
  try {
    raw = await readFile(join(dir, 'list.json'), 'utf8')
  } catch (error) {
    if (missing(error)) return []
    throw error
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Invalid to-do store.')
  }
  if (data?.version !== 1 || !Array.isArray(data.items) || !data.items.every(isTodoItem))
    throw new Error('Invalid to-do store.')
  return data.items
}
async function discardUnusedImages(dir: string, items: TodoItem[]) {
  const keep = new Set(items.flatMap((item) => item.images.map((id) => id + '.image')))
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (error) {
    if (missing(error)) return
    throw error
  }
  for (const name of files)
    if ((name.endsWith('.image') && !keep.has(name)) || name.endsWith('.tmp'))
      await rm(join(dir, name), { force: true })
}
async function replaceFile(dir: string, name: string, data: string) {
  const tmp = join(dir, randomUUID() + '.tmp')
  try {
    const f = await open(tmp, 'wx', 0o600)
    try {
      await f.writeFile(data)
      await f.sync()
    } finally {
      await f.close()
    }
    await rename(tmp, join(dir, name))
    if (process.platform !== 'win32') {
      const d = await open(dir, 'r')
      try {
        await d.sync()
      } finally {
        await d.close()
      }
    }
  } finally {
    await rm(tmp, { force: true })
  }
}
