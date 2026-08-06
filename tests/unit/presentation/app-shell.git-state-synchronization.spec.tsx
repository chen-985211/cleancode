import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
    let resolveFirstSynchronization!: (workbench: typeof synchronizedWorkbench) => void
    const firstSynchronization = new Promise<typeof synchronizedWorkbench>((resolve) => {
      resolveFirstSynchronization = resolve
    })
    const synchronizeProjectGitState = vi
      .fn()
      .mockReturnValueOnce(firstSynchronization)
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
    act(() => resolveFirstSynchronization(synchronizedWorkbench))
    await waitFor(() => expect(within(projectCard).getByText('feature/free')).toBeInTheDocument())
    expect(terminateTerminal).not.toHaveBeenCalled()
  })

  it('does not let an older git synchronization overwrite a newer workspace graph', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'main'
    })
    const synchronizedWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'feature/free'
    })
    const graphWithTerminal = {
      ...workbench.graph,
      blocks: [
        {
          id: 'terminal-new',
          type: 'terminal' as const,
          name: 'Terminal 1',
          description: 'Local terminal',
          launchCommand: '',
          position: { x: 180, y: 270 },
          size: { width: 720, height: 460 }
        }
      ]
    }
    let resolveSynchronization!: (workbench: typeof synchronizedWorkbench) => void
    const synchronization = new Promise<typeof synchronizedWorkbench>((resolve) => {
      resolveSynchronization = resolve
    })
    const synchronizeProjectGitState = vi
      .fn()
      .mockReturnValueOnce(synchronization)
      .mockResolvedValue(null)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        createTerminalBlock: vi.fn(async () => graphWithTerminal),
        listWorkbenches: vi.fn(async () => [workbench]),
        synchronizeProjectGitState
      })
    })

    render(<AppShell />)
    await screen.findByRole('group', { name: '项目 alpha-project' })
    await waitFor(() => expect(synchronizeProjectGitState).toHaveBeenCalledOnce())

    const pane = document.querySelector<HTMLElement>('.react-flow__pane')
    if (!pane) throw new Error('Expected a React Flow pane')
    fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
    fireEvent.click(await screen.findByRole('menuitem', { name: '新建终端积木' }))
    await waitFor(() =>
      expect(document.querySelector('[data-terminal-block-id="terminal-new"]')).not.toBeNull()
    )

    await act(async () => {
      resolveSynchronization(synchronizedWorkbench)
      await synchronization
    })
    expect(screen.queryByText('feature/free')).not.toBeInTheDocument()
    expect(document.querySelector('[data-terminal-block-id="terminal-new"]')).not.toBeNull()
  })
})
