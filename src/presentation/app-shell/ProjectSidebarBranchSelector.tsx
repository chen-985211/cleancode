import { Check, GitBranch, Plus, Search } from 'lucide-react'

import type { WorkbenchSnapshot } from './types'
import { useI18n } from './i18n/useI18n'

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
  const { t } = useI18n()
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const visibleBranches = normalizedQuery
    ? branches.filter((branch) => branch.name.toLocaleLowerCase().includes(normalizedQuery))
    : branches
  const orderedVisibleBranches = orderBranchSelectorItems(visibleBranches)

  return (
    <div className="branch-selector-popover" role="dialog" aria-label={t('branchSelector.dialog')}>
      <label className="sr-only" htmlFor="branch-selector-search">
        {t('branchSelector.search')}
      </label>
      <div className="branch-selector-search">
        <Search size={15} aria-hidden="true" />
        <input
          id="branch-selector-search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={t('branchSelector.search')}
        />
      </div>
      <div className="branch-selector-label">{t('branchSelector.branches')}</div>
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
                  <span className="branch-selector-option__meta">
                    {t('branchSelector.worktree')}
                  </span>
                ) : null}
              </span>
              {branch.isMainWorkspaceBranch ? <Check size={17} aria-hidden="true" /> : null}
            </button>
          )
        })}
        {visibleBranches.length === 0 ? (
          <div className="branch-selector-empty" role="status">
            {t('branchSelector.empty')}
          </div>
        ) : null}
      </div>
      <button className="branch-selector-create" type="button" disabled>
        <Plus size={16} aria-hidden="true" />
        {t('branchSelector.create')}
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
