import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { GitBranchIcon } from '@phosphor-icons/react/dist/csr/GitBranch'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { useLayoutEffect, useState, type RefObject } from 'react'

import type { GitBranchNavigationItemSnapshot } from '../../application/dto/GitBranchNavigationSnapshot'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'

type GitBranchNavigationItem = GitBranchNavigationItemSnapshot

interface BranchSelectorPopoverProps {
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly branches: readonly GitBranchNavigationItem[]
  readonly open: boolean
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
  open,
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
    if (!open) return undefined

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
  }, [anchorRef, open, popoverRef])

  return (
    <AnchoredSurfaceMotion
      className="branch-selector-popover anchored-surface-motion anchored-surface-motion--from-left"
      ref={popoverRef}
      open={open}
      portalContainer={document.body}
      role="dialog"
      aria-label={t('branchSelector.dialog')}
      data-side="right"
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
        <MagnifyingGlassIcon size={15} aria-hidden="true" />
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
              <GitBranchIcon size={15} aria-hidden="true" />
              <span className="branch-selector-option__content">
                <span className="truncate">{branch.name}</span>
                {isWorktreeBranch ? (
                  <span className="branch-selector-option__meta">
                    {t('branchSelector.worktree')}
                  </span>
                ) : null}
              </span>
              {branch.isMainWorkspaceBranch ? (
                <CheckIcon size={17} weight="bold" aria-hidden="true" />
              ) : null}
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
        <PlusIcon size={16} weight="bold" aria-hidden="true" />
        {t('branchSelector.create')}
      </button>
    </AnchoredSurfaceMotion>
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
