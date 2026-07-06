import { Check, GitBranch, Plus, Search } from 'lucide-react'

import type { WorkbenchSnapshot } from './types'

type GitBranchNavigationItem = WorkbenchSnapshot['gitBranches'][number]

interface BranchSelectorPopoverProps {
  readonly branches: readonly GitBranchNavigationItem[]
  readonly searchQuery: string
  readonly onSearchQueryChange: (query: string) => void
  readonly onChooseBranch: (branch: GitBranchNavigationItem) => void
}

export function BranchSelectorPopover({
  branches,
  searchQuery,
  onSearchQueryChange,
  onChooseBranch
}: BranchSelectorPopoverProps) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const visibleBranches = normalizedQuery
    ? branches.filter((branch) => branch.name.toLocaleLowerCase().includes(normalizedQuery))
    : branches
  const orderedVisibleBranches = orderBranchSelectorItems(visibleBranches)

  return (
    <div className="branch-selector-popover" role="dialog" aria-label="选择默认工作区分支">
      <label className="sr-only" htmlFor="branch-selector-search">
        搜索分支
      </label>
      <div className="branch-selector-search">
        <Search size={15} aria-hidden="true" />
        <input
          id="branch-selector-search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="搜索分支"
        />
      </div>
      <div className="branch-selector-label">分支</div>
      <div className="branch-selector-options">
        {orderedVisibleBranches.map((branch) => {
          const isWorktreeBranch = Boolean(
            branch.worktreeDirectory && !branch.isMainWorkspaceBranch
          )
          const isDisabled = !branch.isSelectableInMainWorkspace && !branch.isMainWorkspaceBranch

          return (
            <button
              className={
                branch.isMainWorkspaceBranch
                  ? 'branch-selector-option branch-selector-option--current'
                  : 'branch-selector-option'
              }
              key={branch.name}
              type="button"
              disabled={isDisabled}
              onClick={() => onChooseBranch(branch)}
            >
              <GitBranch size={15} aria-hidden="true" />
              <span className="branch-selector-option__content">
                <span className="truncate">{branch.name}</span>
                {isWorktreeBranch ? (
                  <span className="branch-selector-option__meta">独立工作区</span>
                ) : null}
              </span>
              {branch.isMainWorkspaceBranch ? <Check size={17} aria-hidden="true" /> : null}
            </button>
          )
        })}
        {visibleBranches.length === 0 ? (
          <div className="branch-selector-empty" role="status">
            没有匹配的分支
          </div>
        ) : null}
      </div>
      <button className="branch-selector-create" type="button" disabled>
        <Plus size={16} aria-hidden="true" />
        创建并检出新分支...
      </button>
    </div>
  )
}

function orderBranchSelectorItems(
  branches: readonly GitBranchNavigationItem[]
): GitBranchNavigationItem[] {
  return [...branches].sort(
    (leftBranch, rightBranch) =>
      getBranchSelectorPriority(leftBranch) - getBranchSelectorPriority(rightBranch)
  )
}

function getBranchSelectorPriority(branch: GitBranchNavigationItem): number {
  if (branch.name === 'main') {
    return 0
  }

  if (branch.isMainWorkspaceBranch) {
    return 1
  }

  return 2
}
