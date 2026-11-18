import { AppError, type AppErrorDetails } from '../../../../shared-kernel/domain/errors/AppError'

export const projectDomainErrorCodes = [
  'BRANCH_WORKSPACE_ALREADY_EXISTS',
  'BRANCH_WORKSPACE_NOT_FOUND',
  'GIT_BRANCH_IS_ALREADY_BOUND_TO_WORKSPACE',
  'GIT_BRANCH_NAME_INVALID',
  'INVALID_CLEANCODE_PROJECT_METADATA',
  'MAIN_WORKSPACE_CANNOT_BE_ARCHIVED',
  'ONLY_GIT_WORKTREE_WORKSPACES_CAN_BE_ARCHIVED',
  'PROJECT_HAS_NO_CURRENT_WORKSPACE',
  'PROJECT_ISSUE_ALREADY_LINKED',
  'PROJECT_ISSUE_INVALID',
  'PROJECT_NOT_REMEMBERED',
  'WORKSPACE_DEFAULTS_INVALID',
  'WORKSPACE_INITIALIZATION_CONFLICT',
  'WORKSPACE_INITIALIZATION_INVALID'
] as const

export type ProjectDomainErrorCode = (typeof projectDomainErrorCodes)[number]
const codes = new Set<string>(projectDomainErrorCodes)

export function isProjectDomainErrorCode(code: unknown): code is ProjectDomainErrorCode {
  return typeof code === 'string' && codes.has(code)
}

export class ProjectDomainError extends AppError<ProjectDomainErrorCode> {
  readonly context = 'project'
  constructor(
    code: ProjectDomainErrorCode,
    message: string,
    details?: AppErrorDetails,
    correlationId?: string
  ) {
    super({ code, message, details, correlationId, isExpected: true })
    this.name = 'ProjectDomainError'
  }
}

export function createProjectDomainError(
  code: ProjectDomainErrorCode,
  message: string,
  details?: AppErrorDetails,
  correlationId?: string
): ProjectDomainError {
  return new ProjectDomainError(code, message, details, correlationId)
}
