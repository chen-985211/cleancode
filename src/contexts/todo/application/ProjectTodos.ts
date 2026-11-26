import { updateTodoList, type TodoDraft, type TodoItem } from '../domain/ProjectTodoList'

export interface TodoImage {
  id: string
  data: string
}
export interface TodoRepository {
  list(projectId: string): Promise<TodoItem[]>
  image(projectId: string, id: string): Promise<string>
  change(
    projectId: string,
    images: TodoImage[],
    apply: (items: TodoItem[]) => TodoItem[]
  ): Promise<void>
}
export class ProjectTodos {
  constructor(private readonly repository: TodoRepository) {}
  list(projectId: string) {
    return this.repository.list(projectId)
  }
  image(projectId: string, id: string) {
    return this.repository.image(projectId, id)
  }
  save(projectId: string, changes: TodoDraft | TodoDraft[], images: TodoImage[] = []) {
    return this.repository.change(projectId, images, (items) =>
      updateTodoList(items, changes, Date.now())
    )
  }
}
export interface TodoApi {
  onTodoPageHide?(flush: () => void): () => void
  listTodos(projectId: string): Promise<TodoItem[]>
  saveTodo(
    command: { projectId: string; images?: TodoImage[] } & (
      { draft: TodoDraft } | { drafts: TodoDraft[] }
    )
  ): Promise<void>
  readTodoImage(command: { projectId: string; id: string }): Promise<string>
}
