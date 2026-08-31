import { render, screen } from '@testing-library/react'
import { useRef } from 'react'

import { BranchSelectorPopover } from '../../../../src/contexts/project/presentation/components/ProjectSidebarBranchSelector'
import { ProjectSidebarProjectRemovalPopover } from '../../../../src/contexts/project/presentation/components/ProjectSidebarProjectRemovalPopover'
import { I18nProvider } from '../../../../src/presentation/i18n/I18nProvider'

describe('anchored sidebar surfaces', () => {
  it('retains the branch selector as an inert closing surface', () => {
    const { rerender } = renderSurface(<BranchSelectorHarness open />)
    const popover = screen.getByRole('dialog', { name: '选择默认工作区分支' })

    rerender(wrap(<BranchSelectorHarness open={false} />))

    expect(screen.queryByRole('dialog', { name: '选择默认工作区分支' })).toBeNull()
    expect(popover).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(popover).toHaveAttribute('inert')
  })

  it('retains project removal confirmation until its anchored exit completes', () => {
    const { rerender } = renderSurface(<ProjectRemovalHarness open />)
    const popover = screen.getByRole('dialog', { name: '移除项目 Alpha' })

    rerender(wrap(<ProjectRemovalHarness open={false} />))

    expect(screen.queryByRole('dialog', { name: '移除项目 Alpha' })).toBeNull()
    expect(popover).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(popover).toHaveAttribute('inert')
  })
})

function BranchSelectorHarness({ open }: { readonly open: boolean }) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <div ref={anchorRef} />
      <BranchSelectorPopover
        open={open}
        anchorRef={anchorRef}
        branches={[
          {
            isCurrent: true,
            isLocked: false,
            isMainWorkspaceBranch: true,
            isSelectableInMainWorkspace: false,
            lockReason: null,
            name: 'main',
            worktreeDirectory: '/tmp/alpha'
          }
        ]}
        popoverRef={popoverRef}
        searchQuery=""
        onChooseBranch={vi.fn()}
        onSearchQueryChange={vi.fn()}
      />
    </>
  )
}

function ProjectRemovalHarness({ open }: { readonly open: boolean }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef} type="button">
        remove
      </button>
      <ProjectSidebarProjectRemovalPopover
        open={open}
        projectName="Alpha"
        triggerRef={triggerRef}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    </>
  )
}

function renderSurface(surface: React.ReactNode) {
  return render(wrap(surface))
}

function wrap(surface: React.ReactNode) {
  return <I18nProvider initialLocale="zh-CN">{surface}</I18nProvider>
}
