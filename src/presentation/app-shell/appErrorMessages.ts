import { getAppErrorCode, type AppErrorCode } from '../../shared-kernel/application/errors/AppError'

const userFacingMessages: Partial<Record<AppErrorCode, string>> = {
  BLOCK_GRAPH_SNAPSHOT_CORRUPTED: '项目画布数据已损坏，请先恢复数据后再打开。',
  BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES: '工作区有未提交更改，无法归档。',
  BRANCH_WORKSPACE_NOT_FOUND: '分支工作区不存在，请刷新后重试。',
  GIT_BRANCH_ALREADY_EXISTS: 'Git 分支已存在，无法创建同名工作区。',
  GIT_BRANCH_CHECKED_OUT_IN_WORKTREE: '这个分支已经绑定到其他 worktree，无法在默认工作区切换。',
  GIT_BRANCH_NOT_FOUND: 'Git 分支不存在，请刷新分支列表后重试。',
  MAIN_WORKSPACE_CANNOT_BE_ARCHIVED: '默认工作区不能归档。',
  MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES: '默认工作区有未提交更改，无法切换分支。',
  NOT_GIT_REPOSITORY: '当前项目不是 Git 仓库，无法执行分支操作。',
  PROJECT_NOT_FOUND: '项目不存在，请重新添加项目。',
  TERMINAL_CONNECTION_DUPLICATE: '这条终端依赖已经存在。',
  TERMINAL_CONNECTION_INVALID: '终端不能连接到自身。',
  TERMINAL_EXECUTION_CONFIG_INVALID: '终端执行配置无效，请检查退出码、超时和就绪条件。',
  TERMINAL_SHELL_UNSUPPORTED:
    '当前 Shell 暂不支持工作流命令，请改用 zsh、bash、sh、fish 或 PowerShell。',
  TERMINAL_WORKFLOW_COMMAND_MISSING: '流程中的每个终端都需要配置启动命令。',
  TERMINAL_WORKFLOW_CYCLE: '这条依赖会形成环路，无法连接。',
  TERMINAL_WORKFLOW_EMPTY: '没有可运行的终端命令。',
  UNEXPECTED_ERROR: '操作失败，请稍后重试。'
}

export function resolveUserFacingErrorMessage(error: unknown, fallback: string): string {
  const code = getAppErrorCode(error)

  if (code) {
    return userFacingMessages[code] ?? fallback
  }

  return fallback
}
