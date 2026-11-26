import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ProjectTodoDrawer } from '../../../../src/contexts/todo/presentation/ProjectTodoDrawer'
import { blankTodo } from '../../../../src/contexts/todo/presentation/TodoSession'

it('navigates only the opened to-do in attachment order, including offscreen and unreadable images', async () => {
  const observers: IntersectionObserverCallback[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback)
      }
      observe() {}
      disconnect() {}
    }
  )
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  const ids: string[] = Array.from({ length: 4 }, () => crypto.randomUUID())
  const item = { ...blankTodo(), text: '参考截图', images: ids, createdAt: 1, completedAt: null }
  const other = { ...item, id: crypto.randomUUID(), images: [crypto.randomUUID()], text: '另一条' }
  const sources = ids.map((_, i) => 'data:image/png;base64,' + btoa(String(i)))
  let resolveFirst!: (data: string) => void
  const firstImage = new Promise<string>((resolve) => {
    resolveFirst = resolve
  })
  const api = {
    listTodos: async () => [item, other],
    readTodoImage: vi.fn(async ({ id }: { id: string }) => {
      if (id === ids[0]) return firstImage
      if (id === ids[3]) throw new Error('Missing image')
      return sources[ids.indexOf(id)]!
    }),
    saveTodo: vi.fn()
  }
  render(<ProjectTodoDrawer projectId="project" api={api} />)
  fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
  fireEvent.click(await screen.findByRole('button', { name: item.text }))
  // Only the second thumbnail has scrolled into view when the gallery opens.
  await act(async () =>
    observers[1]!(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
  )
  const opener = await screen.findByRole('button', { name: '放大查看截图' })
  fireEvent.click(opener)
  const dialog = within(screen.getByRole('dialog', { name: '截图预览' }))
  const previous = dialog.getByRole('button', { name: '上一张' })
  const next = dialog.getByRole('button', { name: '下一张' })
  async function expectSlide(index: number) {
    await waitFor(() => expect(dialog.getByRole('img')).toHaveAttribute('src', sources[index]))
    expect(dialog.getByRole('status')).toHaveTextContent(`${index + 1} / 4`)
  }
  await expectSlide(1)
  fireEvent.click(previous)
  fireEvent.keyDown(previous, { key: 'ArrowLeft' })
  expect(await dialog.findByText('无法读取截图')).toBeVisible()
  fireEvent.keyDown(next, { key: 'ArrowLeft' })
  await expectSlide(2)
  await act(async () => resolveFirst(sources[0]!))
  await expectSlide(2)
  fireEvent.click(next)
  fireEvent.keyDown(next, { key: 'ArrowRight' })
  await expectSlide(0)
  expect(api.readTodoImage).not.toHaveBeenCalledWith({ projectId: 'project', id: other.images[0] })
  fireEvent.keyDown(next, { key: 'Escape' })
  await waitFor(() => expect(opener).toHaveFocus())
  expect(screen.getByRole('textbox', { name: '待办内容' })).toHaveValue(item.text)
  expect(api.saveTodo).not.toHaveBeenCalled()
})
