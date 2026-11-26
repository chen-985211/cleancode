import { act, fireEvent, render, screen } from '@testing-library/react'
import type { TodoApi } from '../../../../src/contexts/todo/application/ProjectTodos'
import { ProjectTodoDrawer } from '../../../../src/contexts/todo/presentation/ProjectTodoDrawer'

describe('pending clipboard images', () => {
  it.each([true, false])(
    'finishes the paste against its original captured item (deleted=%s)',
    async (deleted) => {
      const readers: FileReader[] = []
      vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (
        this: FileReader
      ) {
        readers.push(this)
      })
      const saveTodo = vi.fn<TodoApi['saveTodo']>().mockResolvedValue(undefined)
      render(
        <ProjectTodoDrawer
          projectId="project"
          api={{ listTodos: async () => [], readTodoImage: vi.fn(), saveTodo }}
        />
      )
      const opener = screen.getByRole('button', { name: '打开待办清单' })
      fireEvent.click(opener)
      fireEvent.click(await screen.findByRole('button', { name: '记一条' }))
      const title = screen.getByRole('textbox', { name: '待办内容' })
      const files = [new File(['image'], 'capture.png', { type: 'image/png' })]
      fireEvent.paste(title, { clipboardData: { files, getData: () => '' } })
      fireEvent.change(title, { target: { value: 'original' } })
      fireEvent.keyDown(title, { key: 'Enter' })
      const original = await screen.findByRole('button', { name: 'original' })
      if (deleted) {
        fireEvent.contextMenu(original)
        fireEvent.click(await screen.findByRole('menuitem', { name: '删除此条' }))
      }
      expect(readers).toHaveLength(1)
      await act(async () => {
        Object.defineProperty(readers[0], 'result', { value: 'data:image/png;base64,AAAA' })
        readers[0].dispatchEvent(new Event('load'))
      })
      expect(opener).toHaveTextContent(deleted ? '00/00' : '00/01')
      const withImage = saveTodo.mock.calls
        .map(([command]) => command)
        .filter((command) => command.images?.length)
      if (deleted) expect(withImage).toEqual([])
      else
        expect(withImage).toMatchObject([
          { draft: { text: 'original', images: [expect.any(String)] } }
        ])
    }
  )
})
