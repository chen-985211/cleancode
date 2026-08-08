import { fireEvent, render, screen, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'

describe('project sidebar branch selector motion', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [
          createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
            gitBranches: [
              {
                isCurrent: true,
                isLocked: false,
                isMainWorkspaceBranch: true,
                isSelectableInMainWorkspace: false,
                lockReason: null,
                name: 'main',
                worktreeDirectory: '/tmp/alpha-project'
              },
              {
                isCurrent: false,
                isLocked: false,
                isMainWorkspaceBranch: false,
                isSelectableInMainWorkspace: true,
                lockReason: null,
                name: 'feature/free',
                worktreeDirectory: null
              }
            ]
          })
        ])
      })
    })
  })

  it('returns focus on Escape while retaining one inert closing surface', async () => {
    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })
    const trigger = within(projectCard).getByRole('button', {
      name: '选择默认工作区分支 main'
    })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: '选择默认工作区分支' })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '选择默认工作区分支' })).toBeNull()
    expect(dialog).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(dialog).toHaveAttribute('inert')
    expect(trigger).toHaveFocus()
  })
})
