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
interface TodoIpcMain extends IpcMainLike {
  on(
    channel: string,
    listener: (event: { returnValue: unknown }, command?: unknown) => void
  ): unknown
}

export function registerProjectTodos(directory: string, ipcMain: TodoIpcMain, logger: Logger) {
  const repository = new FileTodoRepository(directory)
  const todos = new ProjectTodos(repository)
  const base = { ipcMain, logger, scope: 'todo' }
  registerIpcHandler({
    ...base,
    channel: todoChannels.drain,
    operation: 'finishTodoWritesBeforeUnload',
    ipcMain: {
      handle(channel, handle) {
        ipcMain.on(channel, (event, command) => {
          void handle(event, command).then((result) => {
            event.returnValue = result
          })
        })
      }
    },
    handler: async (command) => {
      if (command !== undefined) return invalid()
      await repository.drain()
      return true
    }
  })
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
      const command = record(value)
      const { projectId, images = [] } = command
      if ('draft' in command === 'drafts' in command) return invalid()
      const drafts = 'draft' in command ? [command.draft] : command.drafts
      if (!Array.isArray(drafts) || !drafts.length || !drafts.every(isTodoDraft)) return invalid()
      if (new Set(drafts.map((draft) => draft.id)).size !== drafts.length) return invalid()
      const referenced = new Set(drafts.flatMap((draft) => draft.images))
      if (
        !Array.isArray(images) ||
        !images.every(isImage) ||
        !images.every((image) => referenced.has(image.id))
      )
        return invalid()
      return todos.save(project(projectId), drafts, images)
    }
  })
  return repository
}
