import type {
  ListProjectIssuesQuery,
  ProjectIssueQuery,
  StartIssueWorkspaceCommand
} from '../../contexts/project/application/dto/ProjectIssues'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'

export function registerProjectIssueIpcHandlers(input: {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly list: (query: ListProjectIssuesQuery) => Promise<unknown>
  readonly detail: (query: ProjectIssueQuery) => Promise<unknown>
  readonly configure: (command: {
    projectDirectory: string
    repository: string
  }) => Promise<unknown>
  readonly start: (command: StartIssueWorkspaceCommand) => Promise<unknown>
}) {
  const register = (
    channel: string,
    operation: string,
    handler: (command: unknown) => Promise<unknown>
  ) =>
    registerIpcHandler({
      channel,
      operation,
      handler,
      ipcMain: input.ipcMain,
      logger: input.logger,
      scope: 'project.issues'
    })
  register('cleancode:list-project-issues', 'listProjectIssues', async (command) => {
    const value = record(command)
    if (value.assignedToMe !== undefined && typeof value.assignedToMe !== 'boolean') invalid()
    if (
      value.limit !== undefined &&
      (!Number.isSafeInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 500)
    )
      invalid()
    return input.list({
      projectDirectory: text(value, 'projectDirectory'),
      ...(value.search !== undefined ? { search: text(value, 'search', true) } : {}),
      ...(value.label !== undefined ? { label: text(value, 'label', true) } : {}),
      ...(value.assignedToMe !== undefined ? { assignedToMe: value.assignedToMe as boolean } : {}),
      ...(value.limit !== undefined ? { limit: value.limit as number } : {})
    })
  })
  register('cleancode:get-project-issue', 'getProjectIssue', (command) =>
    input.detail(issueQuery(command))
  )
  register('cleancode:configure-project-issues', 'configureProjectIssues', (command) => {
    const value = record(command)
    return input.configure({
      projectDirectory: text(value, 'projectDirectory'),
      repository: text(value, 'repository')
    })
  })
  register('cleancode:start-issue-workspace', 'startIssueWorkspace', (command) => {
    const value = record(command)
    return input.start({
      ...issueQuery(value),
      branchName: text(value, 'branchName'),
      baseBranch: text(value, 'baseBranch')
    })
  })
}
function issueQuery(command: unknown): ProjectIssueQuery {
  const value = record(command)
  if (!Number.isSafeInteger(value.number) || Number(value.number) < 1) invalid()
  return {
    projectDirectory: text(value, 'projectDirectory'),
    repository: text(value, 'repository'),
    number: value.number as number
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function text(value: Record<string, unknown>, key: string, empty = false): string {
  const item = value[key]
  if (
    typeof item !== 'string' ||
    (!empty && !item.trim()) ||
    item.length > 4096 ||
    item.includes('\0')
  )
    invalid()
  return item
}
function invalid(): never {
  throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid project issue command.')
}
