import { Folders } from 'lucide-react'
import type { FormEvent, RefObject } from 'react'

interface ProjectSidebarBranchWorkspaceFormProps {
  readonly branchName: string
  readonly formRef: RefObject<HTMLFormElement | null>
  readonly projectId: string
  readonly onBranchNameChange: (branchName: string) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ProjectSidebarBranchWorkspaceForm({
  branchName,
  formRef,
  projectId,
  onBranchNameChange,
  onSubmit
}: ProjectSidebarBranchWorkspaceFormProps) {
  return (
    <form className="branch-workspace-form" ref={formRef} onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={`${projectId}-branch-name`}>
        分支名称
      </label>
      <input
        id={`${projectId}-branch-name`}
        value={branchName}
        onChange={(event) => onBranchNameChange(event.target.value)}
        placeholder="新分支名称"
      />
      <button type="submit">
        <Folders size={13} aria-hidden="true" />
        <span>创建 Worktree</span>
      </button>
    </form>
  )
}
