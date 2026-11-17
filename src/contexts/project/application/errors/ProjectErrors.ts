import {
  AppError,
  createExpectedAppError,
  isCommonErrorCode,
  type CommonErrorCode,
  type AppErrorDetails
} from '../../../../shared-kernel/domain/errors/AppError'
import {
  projectDomainErrorCodes,
  isProjectDomainErrorCode,
  type ProjectDomainErrorCode
} from '../../domain/errors/ProjectDomainError'

const projectApplicationErrorCodes = [
  'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
  'GITHUB_AUTH_REQUIRED',
  'GITHUB_BASE_UNAVAILABLE',
  'GITHUB_CLI_UNAVAILABLE',
  'GITHUB_ISSUES_DISABLED',
  'GITHUB_PERMISSION_DENIED',
  'GITHUB_RATE_LIMITED',
  'GITHUB_REPOSITORY_NOT_CONFIGURED',
  'GITHUB_REQUEST_FAILED',
  'GITHUB_RESOURCE_UNAVAILABLE',
  'GIT_BRANCH_ALREADY_EXISTS',
  'GIT_BRANCH_CHECKED_OUT_IN_WORKTREE',
  'GIT_BRANCH_NOT_FOUND',
  'GIT_REPOSITORY_HAS_NO_CURRENT_BRANCH',
  'GIT_WORKTREE_LOCKED',
  'INVALID_CLEANCODE_PROJECT_REGISTRY',
  'MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
  'NOT_GIT_REPOSITORY',
  'PROJECT_NOT_FOUND',
  'WORKSPACE_EXTERNAL_OPEN_FAILED',
  'WORKSPACE_INITIALIZATION_CANVAS_NOT_EMPTY',
  'WORKSPACE_INITIALIZATION_INTERRUPTED',
  'WORKSPACE_INITIALIZATION_NOT_FOUND',
  'WORKSPACE_INITIALIZATION_SCOPE_STALE',
  'WORKSPACE_OPEN_TARGET_UNAVAILABLE'
] as const

type ProjectApplicationErrorCode = (typeof projectApplicationErrorCodes)[number]
export const projectErrorCodes = [
  ...projectDomainErrorCodes,
  ...projectApplicationErrorCodes
] as const
export type ProjectErrorCode =
  ProjectDomainErrorCode | ProjectApplicationErrorCode | CommonErrorCode
const codes = new Set<string>(projectApplicationErrorCodes)

export function isProjectErrorCode(code: unknown): code is ProjectErrorCode {
  return (
    isCommonErrorCode(code) ||
    isProjectDomainErrorCode(code) ||
    (typeof code === 'string' && codes.has(code))
  )
}

export class ProjectApplicationError extends AppError<
  ProjectApplicationErrorCode | ProjectDomainErrorCode
> {
  readonly context = 'project'
  constructor(
    code: ProjectApplicationErrorCode | ProjectDomainErrorCode,
    message: string,
    details?: AppErrorDetails
  ) {
    super({ code, message, details, isExpected: true })
    this.name = 'ProjectApplicationError'
  }
}

export function createProjectError(
  code: ProjectErrorCode,
  message: string,
  details?: AppErrorDetails
): AppError<ProjectErrorCode> {
  if (isCommonErrorCode(code)) return createExpectedAppError(code, message, details)
  return new ProjectApplicationError(code, message, details)
}
