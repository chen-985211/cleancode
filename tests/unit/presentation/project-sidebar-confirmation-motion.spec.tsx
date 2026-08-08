import { render, screen } from '@testing-library/react'

import { ProjectSidebarConfirmationDialog } from '../../../src/presentation/app-shell/ProjectSidebarConfirmationDialog'
import { I18nProvider } from '../../../src/presentation/app-shell/i18n/I18nProvider'

describe('project sidebar confirmation motion', () => {
  it('keeps modal content mounted and inert through the closing phase', () => {
    const props = {
      ariaLabel: '归档工作区 test',
      confirmLabel: '归档工作区',
      description: '确认归档',
      icon: <span aria-hidden="true" />,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      title: '归档工作区 test'
    }
    const { rerender } = render(
      <I18nProvider initialLocale="zh-CN">
        <ProjectSidebarConfirmationDialog {...props} open />
      </I18nProvider>
    )
    const dialog = screen.getByRole('dialog', { name: '归档工作区 test' })

    rerender(
      <I18nProvider initialLocale="zh-CN">
        <ProjectSidebarConfirmationDialog {...props} open={false} />
      </I18nProvider>
    )

    expect(screen.queryByRole('dialog', { name: '归档工作区 test' })).toBeNull()
    expect(dialog).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(dialog).toHaveAttribute('inert')
  })
})
