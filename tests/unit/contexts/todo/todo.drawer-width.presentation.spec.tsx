import { fireEvent, render, screen } from '@testing-library/react'
import { ProjectTodoDrawer } from '../../../../src/contexts/todo/presentation/ProjectTodoDrawer'

it('clamps a saved drawer width to the visible canvas and restores it when space returns', async () => {
  const api = { listTodos: async () => [], saveTodo: vi.fn(), readTodoImage: vi.fn() }
  const widthKey = 'cleancode.todo.drawerWidth'
  localStorage.setItem(widthKey, '720')
  onTestFinished(() => localStorage.removeItem(widthKey))
  const drawer = (canvasWidth: number) => (
    <ProjectTodoDrawer
      projectId="project"
      api={api}
      canvasWidth={canvasWidth}
      reservedCanvasWidth={300}
    />
  )
  const view = render(drawer(1200))
  fireEvent.click(screen.getByRole('button', { name: '打开待办清单' }))
  const separator = await screen.findByRole('separator')
  for (const [canvasWidth, maximum, actual] of [
    [1200, 768, 720],
    [744, 444, 444],
    [728, 428, 428],
    [1200, 768, 720]
  ]) {
    view.rerender(drawer(canvasWidth))
    expect(separator).toHaveAttribute('aria-valuemax', String(maximum))
    expect(separator).toHaveAttribute('aria-valuenow', String(actual))
    expect(document.querySelector('.project-todo-dock')).toHaveStyle({ width: actual + 'px' })
  }
})
