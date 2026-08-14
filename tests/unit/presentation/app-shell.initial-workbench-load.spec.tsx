import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import { createDeferred } from '../../fixtures/deferred'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('app shell initial workbench load', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('keeps a pending project restoration distinct from the empty workspace', () => {
    const restoration = createDeferred<ReturnType<typeof createWorkbenchSnapshot>[]>()

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(() => restoration.promise)
      })
    })

    render(<AppShell />)

    const loadingState = screen.getByRole('status', { name: '正在恢复上次的工作台' })
    const shimmerText = loadingState.querySelector('.canvas-empty__loading-text')

    expect(loadingState).toHaveClass('canvas-empty--loading')
    expect(loadingState.querySelector('.canvas-empty__panel')).not.toBeInTheDocument()
    expect(loadingState.querySelector('.canvas-empty__icon')).not.toBeInTheDocument()
    expect(shimmerText).toHaveTextContent('正在恢复上次的工作台')
    const shimmerCharacters = shimmerText?.querySelectorAll('.canvas-empty__loading-character')
    expect(shimmerCharacters).toHaveLength(10)
    expect(shimmerCharacters?.item(9)).toHaveStyle('--cc-loading-shimmer-delay: 0.9s')
    expect(screen.getByText('正在恢复项目')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CleanCode' })).not.toBeInTheDocument()
  })

  it('shows the empty workspace only after restoration completes without projects', async () => {
    const restoration = createDeferred<ReturnType<typeof createWorkbenchSnapshot>[]>()

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(() => restoration.promise)
      })
    })

    render(<AppShell />)

    expect(screen.queryByRole('heading', { name: 'CleanCode' })).not.toBeInTheDocument()

    await act(async () => restoration.resolve([]))

    expect(await screen.findByRole('heading', { name: 'CleanCode' })).toBeInTheDocument()
  })

  it('never exposes the empty workspace while restoring a remembered project', async () => {
    const restoration = createDeferred<ReturnType<typeof createWorkbenchSnapshot>[]>()
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(() => restoration.promise)
      })
    })

    render(<AppShell />)

    expect(screen.queryByRole('heading', { name: 'CleanCode' })).not.toBeInTheDocument()

    await act(async () => restoration.resolve([workbench]))
    await screen.findByText('alpha-project')

    expect(screen.queryByRole('heading', { name: 'CleanCode' })).not.toBeInTheDocument()
  })

  it('does not let a late restoration replace a project opened by the user', async () => {
    const restoration = createDeferred<ReturnType<typeof createWorkbenchSnapshot>[]>()
    const restoredWorkbench = createWorkbenchSnapshot('/tmp/restored-project', 'restored-project')
    const openedWorkbench = createWorkbenchSnapshot('/tmp/opened-project', 'opened-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        addProject: vi.fn(async () => openedWorkbench),
        listWorkbenches: vi.fn(() => restoration.promise)
      })
    })

    render(<AppShell />)

    fireEvent.click(screen.getByRole('button', { name: '添加项目' }))
    await screen.findByText('opened-project')
    await act(async () => restoration.resolve([restoredWorkbench]))

    expect(screen.getByText('opened-project')).toBeInTheDocument()
    expect(screen.queryByText('restored-project')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CleanCode' })).not.toBeInTheDocument()
  })

  it('shows a retryable error without pretending the workspace is empty', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const listWorkbenches = vi
      .fn()
      .mockRejectedValueOnce(new Error('registry unavailable'))
      .mockResolvedValueOnce([workbench])

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ listWorkbenches })
    })

    render(<AppShell />)

    expect(await screen.findByRole('alert')).toHaveTextContent('无法恢复项目')
    expect(screen.queryByRole('heading', { name: 'CleanCode' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(listWorkbenches).toHaveBeenCalledTimes(2))
    await screen.findByText('alpha-project')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
