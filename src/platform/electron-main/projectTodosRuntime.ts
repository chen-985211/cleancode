import { ProjectTodos, type TodoImage } from '../../contexts/todo/application/ProjectTodos'
import { isTodoDraft, isTodoId } from '../../contexts/todo/domain/ProjectTodoList'
import { FileTodoRepository } from '../../contexts/todo/infrastructure/FileTodoRepository'
import { createIpcError } from '../ipc/IpcError'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import { todoChannels } from '../ipc/todoChannels'
import type { Logger } from '../logging/Logger'
const invalid = (): never => {
  throw createIpcError('INVALID_IPC_COMMAND', 'Invalid to-do command.')
}
function project(value: unknown): string {
  return typeof value === 'string' && value.trim() && value.length <= 512 ? value : invalid()
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || !value || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function isImage(value: unknown): value is TodoImage {
  const image = record(value)
  return (
    isTodoId(image.id) &&
    typeof image.data === 'string' &&
    /^data:image\/(?:png|jpeg|webp|gif|avif|bmp);base64,[a-z\d+/]+=*$/i.test(image.data)
  )
}
export function registerProjectTodos(directory: string, ipcMain: IpcMainLike, logger: Logger) {
  const repository = new FileTodoRepository(directory)
  const todos = new ProjectTodos(repository)
  const base = { ipcMain, logger, scope: 'todo' }
  registerIpcHandler({
    ...base,
    channel: todoChannels.list,
    operation: 'listTodos',
    handler: (value) => todos.list(project(value))
  })
  registerIpcHandler({
    ...base,
    channel: todoChannels.image,
    operation: 'readTodoImage',
    handler: (value) => {
      const { projectId, id } = record(value)
      if (!isTodoId(id)) return invalid()
      return todos.image(project(projectId), id)
    }
  })
  registerIpcHandler({
    ...base,
    channel: todoChannels.save,
    operation: 'saveTodo',
    handler: (value) => {
      const { projectId, draft, images = [] } = record(value)
      if (
        !isTodoDraft(draft) ||
        !Array.isArray(images) ||
        !images.every(isImage) ||
        !images.every((image) => draft.images.includes(image.id))
      )
        return invalid()
      return todos.save(project(projectId), draft, images)
    }
  })
  return repository
}
