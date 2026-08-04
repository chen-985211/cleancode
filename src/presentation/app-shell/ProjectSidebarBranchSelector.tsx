import { Check, GitBranch, Plus, Search } from 'lucide-react'
import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import type { WorkbenchSnapshot } from './types'
import { useI18n } from './i18n/useI18n'

type GitBranchNavigationItem = WorkbenchSnapshot['gitBranches'][number]

interface BranchSelectorPopoverProps {
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly branches: readonly GitBranchNavigationItem[]
  readonly popoverRef: RefObject<HTMLDivElement | null>
  readonly searchQuery: string
  readonly onSearchQueryChange: (query: string) => void
  readonly onChooseBranch: (branch: GitBranchNavigationItem) => void
}

interface BranchSelectorPopoverPosition {
  readonly left: number
  readonly top: number
}

export function BranchSelectorPopover({
  anchorRef,
  branches,
  popoverRef,
  searchQuery,
  onSearchQueryChange,
  onChooseBranch
}: BranchSelectorPopoverProps) {
  const { t } = useI18n()
  const [position, setPosition] = useState<BranchSelectorPopoverPosition | null>(null)
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const visibleBranches = normalizedQuery
    ? branches.filter((branch) => branch.name.toLocaleLowerCase().includes(normalizedQuery))
    : branches
  const orderedVisibleBranches = orderBranchSelectorItems(visibleBranches)

  useLayoutEffect(() => {
    const positionPopover = (): void => {
      const anchor = anchorRef.current
      const popover = popoverRef.current
      if (!anchor || !popover) return

      setPosition(
        resolveBranchSelectorPopoverPosition({
          anchorRect: anchor.getBoundingClientRect(),
          popoverHeight: popover.offsetHeight,
          popoverWidth: popover.offsetWidth,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth
        })
      )
    }

    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [anchorRef, popoverRef])

  return createPortal(
    <div
      className="branch-selector-popover"
      ref={popoverRef}
      role="dialog"
      aria-label={t('branchSelector.dialog')}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden'
      }}
    >
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
    </div>,
    document.body
  )
}

function resolveBranchSelectorPopoverPosition(input: {
  readonly anchorRect: DOMRect
  readonly popoverHeight: number
  readonly popoverWidth: number
  readonly viewportHeight: number
  readonly viewportWidth: number
}): BranchSelectorPopoverPosition {
  const viewportPadding = 8
  const horizontalGap = 10
  const preferredTopOffset = 64
  const maxLeft = Math.max(
    viewportPadding,
    input.viewportWidth - input.popoverWidth - viewportPadding
  )
  const maxTop = Math.max(
    viewportPadding,
    input.viewportHeight - input.popoverHeight - viewportPadding
  )

  return {
    left: Math.min(Math.max(input.anchorRect.right + horizontalGap, viewportPadding), maxLeft),
    top: Math.min(Math.max(input.anchorRect.top - preferredTopOffset, viewportPadding), maxTop)
  }
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
