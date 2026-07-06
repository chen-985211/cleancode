import { getAppErrorCode, type AppErrorCode } from '../../shared-kernel/application/errors/AppError'

const userFacingMessages: Partial<Record<AppErrorCode, string>> = {
  BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES: '工作区有未提交更改，无法归档。',
  BRANCH_WORKSPACE_NOT_FOUND: '分支工作区不存在，请刷新后重试。',
  GIT_BRANCH_ALREADY_EXISTS: 'Git 分支已存在，无法创建同名工作区。',
  GIT_BRANCH_CHECKED_OUT_IN_WORKTREE: '这个分支已经绑定到其他 worktree，无法在默认工作区切换。',
  GIT_BRANCH_NOT_FOUND: 'Git 分支不存在，请刷新分支列表后重试。',
  MAIN_WORKSPACE_CANNOT_BE_ARCHIVED: '默认工作区不能归档。',
  MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES: '默认工作区有未提交更改，无法切换分支。',
  NOT_GIT_REPOSITORY: '当前项目不是 Git 仓库，无法执行分支操作。',
  PROJECT_NOT_FOUND: '项目不存在，请重新添加项目。',
  UNEXPECTED_ERROR: '操作失败，请稍后重试。'
}

export function resolveUserFacingErrorMessage(error: unknown, fallback: string): string {
  const code = getAppErrorCode(error)

  if (code) {
    return userFacingMessages[code] ?? fallback
  }

  return fallback
}
