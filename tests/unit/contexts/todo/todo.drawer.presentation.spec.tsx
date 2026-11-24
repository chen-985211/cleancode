import { fireEvent, render, screen } from '@testing-library/react'
import { ProjectTodoDrawer } from '../../../../src/contexts/todo/presentation/ProjectTodoDrawer'

describe('project to-do drawer keyboard entry', () => {
  it('keeps the open control before the drawer in tab order and closes it with Escape', async () => {
    const api = { listTodos: vi.fn(async () => []), saveTodo: vi.fn(), readTodoImage: vi.fn() }
    render(<ProjectTodoDrawer projectId="project" api={api} />)
    const button = screen.getByRole('button', { name: '打开待办清单' })
    button.focus()
    fireEvent.click(button)
    const add = await screen.findByRole('button', { name: '记一条' })
    expect(button.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: '待办清单' })).toBeNull()
    expect(button).toHaveFocus()
  })
})
