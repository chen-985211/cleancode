import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectTodos } from '../../../../src/contexts/todo/application/ProjectTodos'
import { todosInStatus } from '../../../../src/contexts/todo/domain/ProjectTodoList'
import { FileTodoRepository } from '../../../../src/contexts/todo/infrastructure/FileTodoRepository'
const first = '1697984e-7f02-42ef-b620-9d21f12911b3'
const second = '268e4874-2271-4a62-8ce9-60ca0076788c'
const image = '31614eff-f39f-4bca-b5b6-410026f23de1'
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6qUAAAAASUVORK5CYII='
const draft = { id: first, text: '', note: '', links: [], images: [image], status: 'todo' as const }
describe('project to-do persistence', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cc-todos-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  const load = () => new ProjectTodos(new FileTodoRepository(directory))
  it('serializes overlapping edits, restores images, and isolates projects', async () => {
    const todos = load()
    await todos.save('first', draft, [{ id: image, data: png }])
    await Promise.all([
      todos.save('first', { ...draft, text: 'first edit' }),
      todos.save('first', { ...draft, id: second, text: 'another item', images: [] }),
      todos.save('first', { ...draft, text: 'latest', status: 'done' })
    ])
    const restored = load()
    expect(await restored.list('other')).toEqual([])
    expect(await restored.list('first')).toMatchObject([
      { id: first, text: 'latest', status: 'done', completedAt: expect.any(Number) },
      { id: second }
    ])
    expect(await restored.image('first', image)).toBe(png)
    await expect(restored.image('other', image)).rejects.toThrow()
  })
  it('keeps the committed item when its replacement references a missing image', async () => {
    const todos = load()
    await todos.save('first', { ...draft, text: 'original', images: [] })
    await expect(todos.save('first', draft)).rejects.toThrow()
    expect(await todos.list('first')).toMatchObject([{ text: 'original', images: [] }])
  })
  it('restores the last arrival first in each status after ordinary edits and reopening', async () => {
    const todos = load()
    const [a, b, c] = ['甲', '乙', '丙'].map((text) => ({
      ...draft,
      id: crypto.randomUUID(),
      text,
      images: []
    }))
    await todos.save('project', [a, b, c])
    await todos.save('project', { ...a, status: 'active' })
    await todos.save('project', { ...c, status: 'active' })
    await todos.save('project', { ...a, status: 'active', note: 'edited' })
    expect(todosInStatus(await load().list('project'), 'active').map((item) => item.id)).toEqual([
      c.id,
      a.id
    ])
    await todos.save('project', { ...c, status: 'done' })
    await todos.save('project', { ...a, status: 'done' })
    expect(todosInStatus(await load().list('project'), 'done').map((item) => item.id)).toEqual([
      a.id,
      c.id
    ])
    await todos.save('project', a)
    expect(todosInStatus(await load().list('project'), 'todo').map((item) => item.id)).toEqual([
      a.id,
      b.id
    ])
  })
  it('publishes a whole numbered capture in one write and retains its original on failure', async () => {
    const todos = load()
    const original = { ...draft, text: '1. first\n2. second', images: [] }
    await todos.save('first', original)
    const parts = [
      { ...original, text: 'second' },
      { ...original, id: second, text: 'first' }
    ]
    await expect(
      todos.save('first', [parts[0], { ...parts[1], images: [image] }])
    ).rejects.toThrow()
    expect(await todos.list('first')).toMatchObject([{ text: original.text }])
    await todos.save('first', parts)
    await todos.save('first', parts)
    expect((await load().list('first')).reverse().map((item) => item.text)).toEqual([
      'first',
      'second'
    ])
  })
  it('keeps the list readable when a saved order reaches the integer limit', async () => {
    const todos = load()
    const original = {
      ...draft,
      text: 'existing',
      images: [],
      statusOrder: Number.MAX_SAFE_INTEGER
    }
    await todos.save('project', original)
    await todos.save('project', { ...draft, id: second, text: 'new', images: [] })
    const items = await load().list('project')
    expect(todosInStatus(items, 'todo').map((item) => item.id)).toEqual([second, first])
  })
})
