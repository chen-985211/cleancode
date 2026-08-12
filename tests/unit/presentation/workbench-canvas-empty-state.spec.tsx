import { render, screen } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

describe('workbench canvas empty state', () => {
  it('presents the desktop welcome action without a card or decorative icon', async () => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi()
    })

    render(<AppShell />)

    const brand = await screen.findByRole('heading', { name: 'CleanCode' })
    const welcomeState = brand.closest('.canvas-empty--welcome')

    expect(brand).toHaveClass('canvas-empty__brand')
    expect(welcomeState).not.toBeNull()
    expect(welcomeState?.querySelector('.canvas-empty__panel')).not.toBeInTheDocument()
    expect(welcomeState?.querySelector('.canvas-empty__icon')).not.toBeInTheDocument()
    expect(screen.queryByText('打开项目开始使用')).not.toBeInTheDocument()
    expect(screen.queryByText('选择一个本地项目目录，进入工作台。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开项目' })).toBeEnabled()
  })
})
