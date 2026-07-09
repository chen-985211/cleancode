import { render, screen, waitFor, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'

describe('app shell git state synchronization', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('refreshes the default workspace branch without terminating terminals', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'main'
    })
    const synchronizedWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'feature/free'
    })
    const synchronizeProjectGitState = vi
      .fn()
      .mockResolvedValueOnce(synchronizedWorkbench)
      .mockResolvedValue(null)
    const terminateTerminal = vi.fn()

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        synchronizeProjectGitState,
        terminateTerminal
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    expect(within(projectCard).getByText('main')).toBeInTheDocument()
    await waitFor(() =>
      expect(synchronizeProjectGitState).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project'
      })
    )
    await waitFor(() => expect(within(projectCard).getByText('feature/free')).toBeInTheDocument())
    expect(terminateTerminal).not.toHaveBeenCalled()
  })
})
