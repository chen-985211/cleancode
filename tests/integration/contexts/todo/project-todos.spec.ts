import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectTodos } from '../../../../src/contexts/todo/application/ProjectTodos'
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
})
