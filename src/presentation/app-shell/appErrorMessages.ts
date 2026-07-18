import { getAppErrorCode, type AppErrorCode } from '../../shared-kernel/application/errors/AppError'

const userFacingMessages: Partial<Record<AppErrorCode, string>> = {
  BLOCK_GRAPH_SNAPSHOT_CORRUPTED: '项目画布数据已损坏，请先恢复数据后再打开。',
  BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED: '项目画布数据版本过新，请升级 cleancode 后再打开。',
  BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES: '工作区有未提交更改，无法归档。',
  BRANCH_WORKSPACE_NOT_FOUND: '分支工作区不存在，请刷新后重试。',
  GIT_BRANCH_ALREADY_EXISTS: 'Git 分支已存在，无法创建同名工作区。',
  GIT_BRANCH_CHECKED_OUT_IN_WORKTREE: '这个分支已经绑定到其他 worktree，无法在默认工作区切换。',
  GIT_BRANCH_NOT_FOUND: 'Git 分支不存在，请刷新分支列表后重试。',
  GIT_WORKTREE_LOCKED: '工作区已被 Git 锁定，请确认锁信息后重试。',
  COMMAND_TIMED_OUT: '服务未在规定时间内就绪，请检查启动日志和就绪条件。',
  MAIN_WORKSPACE_CANNOT_BE_ARCHIVED: '默认工作区不能归档。',
  MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES: '默认工作区有未提交更改，无法切换分支。',
  NOT_GIT_REPOSITORY: '当前项目不是 Git 仓库，无法执行分支操作。',
  PROJECT_NOT_FOUND: '项目不存在，请重新添加项目。',
  PROJECT_NOT_REMEMBERED: '项目不在最近项目列表中，请重新添加项目。',
  RUN_SCOPE_STALE: '项目或工作区已经变化，请刷新后重新启动。',
  RUN_START_BLOCKED: '运行环境正在清理或已经变化，请稍后重试。',
  SERVICE_ENDPOINT_NOT_OPENABLE: '这个服务地址已失效或不支持直接打开。',
  SERVICE_LISTENER_OWNERSHIP_MISMATCH: '服务端口由其他进程监听，请修改端口配置后重试。',
  SERVICE_LISTENER_OWNERSHIP_UNVERIFIED: '无法确认服务端口的监听者归属，已停止本次运行。',
  SERVICE_PORT_ALLOCATION_EXHAUSTED: '未能分配可用端口，请修改端口配置后重试。',
  SERVICE_PORT_CLEANUP_FAILED: '服务已停止，但端口清理未完成，请稍后重试。',
  SERVICE_PORT_FIXED_CONFLICT: '固定端口已被占用，请定位占用服务或修改端口配置。',
  SERVICE_PORT_MANAGEMENT_UNSUPPORTED: '当前环境不支持托管端口，请改用受支持的运行环境。',
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
