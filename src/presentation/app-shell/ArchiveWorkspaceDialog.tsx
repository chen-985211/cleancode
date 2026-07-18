import { Archive } from 'lucide-react'

import { ProjectSidebarConfirmationDialog } from './ProjectSidebarConfirmationDialog'

interface ArchiveWorkspaceDialogProps {
  readonly isCurrentWorkspace: boolean
  readonly isLocked: boolean
  readonly lockReason: string | null
  readonly workspaceName: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ArchiveWorkspaceDialog({
  isCurrentWorkspace,
  isLocked,
  lockReason,
  workspaceName,
  onCancel,
  onConfirm
}: ArchiveWorkspaceDialogProps) {
  const ariaLabel = isLocked ? `解除锁并归档工作区 ${workspaceName}` : `归档工作区 ${workspaceName}`
  const description = isLocked
    ? `这个 worktree 已被 Git 锁定：${lockReason ?? '未提供锁定原因'}。确认后将先解除锁，再移除目录。`
    : `将移除这个 worktree 目录，但保留 Git 分支 ${workspaceName}。之后可以从默认工作区重新创建。`
  const detail = isLocked
    ? `Git 分支 ${workspaceName} 会被保留；如果目录包含未提交更改，归档仍会被拒绝。`
    : isCurrentWorkspace
      ? '当前正在使用该工作区，归档前将自动切回默认工作区。'
      : undefined

  return (
    <ProjectSidebarConfirmationDialog
      ariaLabel={ariaLabel}
      confirmLabel={isLocked ? '解除锁并归档' : '归档工作区'}
      description={description}
      detail={detail}
      icon={<Archive size={16} aria-hidden="true" />}
      title={ariaLabel}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
