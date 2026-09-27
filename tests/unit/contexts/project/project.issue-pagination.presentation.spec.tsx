import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ProjectIssuesSnapshot } from '../../../../src/contexts/project/application/dto/ProjectIssues'
import { ProjectIssuesPanel } from '../../../../src/contexts/project/presentation/components/ProjectIssuesPanel'
import { useProjectIssues } from '../../../../src/contexts/project/presentation/view-models/useProjectIssues'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'

function page(count: number, hasMore = true): ProjectIssuesSnapshot {
  return {
    repository: { name: 'owner/repo', defaultBranch: 'main' },
    issues: Array.from({ length: count }, (_, index) => ({
      id: `issue-${index + 1}`,
      number: index + 1,
      title: `Issue ${index + 1}`,
      repository: 'owner/repo',
      url: `https://github.com/owner/repo/issues/${index + 1}`,
      body: '',
      state: 'OPEN',
      labels: ['bug'],
      assignees: []
    })),
    hasMore
  }
}

function pendingPage() {
  let resolve!: (value: ProjectIssuesSnapshot) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<ProjectIssuesSnapshot>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function setup() {
  const list = vi.fn<NonNullable<Window['cleancode']>['listProjectIssues']>()
  list.mockResolvedValueOnce(page(50))
  window.cleancode = { listProjectIssues: list } as unknown as NonNullable<Window['cleancode']>
  const props = {
    project: createWorkbenchSnapshot('/project', 'project').project,
    onClose: vi.fn(),
    onStart: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onProjectChanged: vi.fn()
  }
  return { list, props, ...render(<ProjectIssuesPanel {...props} />) }
}

describe('project Issue pagination', () => {
  afterEach(() => {
    delete window.cleancode
  })

  it('keeps existing rows and the focused pagination control while extending the list', async () => {
    const { list } = setup()
    const next = pendingPage()
    list.mockReturnValueOnce(next.promise)
    const row = await screen.findByRole('button', { name: 'Issue 50' })
    const more = screen.getByRole('button', { name: '加载更多' })
    more.focus()
    fireEvent.click(more)

    expect(row).toBeInTheDocument()
    expect(more).toHaveFocus()
    expect(more).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '正在加载…' })).toBe(more)
    expect(screen.getByLabelText('Issue 列表')).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(more)
    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100 }))

    await act(async () => next.resolve(page(100)))
    expect(screen.getByRole('button', { name: 'Issue 50' })).toBe(row)
    expect(screen.getByRole('button', { name: 'Issue 100' })).toBeInTheDocument()
    expect(more).toHaveFocus()
    expect(more).toHaveAccessibleName('加载更多')
    expect(screen.getByLabelText('Issue 列表')).toHaveAttribute('aria-busy', 'false')
  })

  it('retains readable results after a failure and retries the same page before advancing', async () => {
    const { list } = setup()
    const next = pendingPage()
    list.mockReturnValueOnce(next.promise)
    const row = await screen.findByRole('button', { name: 'Issue 50' })
    const more = screen.getByRole('button', { name: '加载更多' })
    more.focus()
    fireEvent.click(more)
    await act(async () => next.reject(new Error('Network unavailable')))

    expect(row).toBeInTheDocument()
    expect(more).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('无法加载 Issues，请重试。')
    expect(screen.getByRole('button', { name: '重试加载' })).toBe(more)
    const retry = pendingPage()
    list.mockReturnValueOnce(retry.promise)
    fireEvent.click(more)
    expect(row).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(list.mock.calls.map(([query]) => query.limit)).toEqual([50, 100, 100])
    await act(async () => retry.resolve(page(100)))

    list.mockResolvedValueOnce(page(150, false))
    fireEvent.click(more)
    await screen.findByRole('button', { name: 'Issue 150' })
    expect(list.mock.calls.map(([query]) => query.limit)).toEqual([50, 100, 100, 150])
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('allows retrying the final batch before applying the 500-Issue cap', async () => {
    const project = createWorkbenchSnapshot('/project', 'project').project
    const list = vi.fn<NonNullable<Window['cleancode']>['listProjectIssues']>()
    list.mockResolvedValueOnce(page(50))
    window.cleancode = { listProjectIssues: list } as unknown as NonNullable<Window['cleancode']>
    const { result } = renderHook(() => useProjectIssues(project, true))
    await waitFor(() => expect(result.current.data?.issues).toHaveLength(50))
    for (let limit = 100; limit <= 450; limit += 50) {
      list.mockResolvedValueOnce(page(limit))
      await act(async () => result.current.loadMore())
      expect(result.current.data?.issues).toHaveLength(limit)
    }
    const failure = new Error('Network unavailable')
    list.mockRejectedValueOnce(failure)
    await act(async () => result.current.loadMore())
    expect(result.current.moreError).toBe(failure)
    expect(result.current.data?.issues).toHaveLength(450)
    list.mockResolvedValueOnce(page(500))
    await act(async () => result.current.loadMore())
    expect(result.current.data?.issues).toHaveLength(500)
    expect(result.current.moreError).toBeUndefined()
    expect(list.mock.calls.slice(-2).map(([query]) => query.limit)).toEqual([500, 500])
    await act(async () => result.current.loadMore())
    expect(list).toHaveBeenCalledTimes(11)
  })

  it.each([
    'project',
    'directory',
    'repository',
    'search',
    'assignee',
    'label',
    'refresh'
  ] as const)(
    'hides previous rows on %s changes and ignores late pagination responses',
    async (change) => {
      const { list, props, rerender } = setup()
      const next = pendingPage()
      const replacement = pendingPage()
      list.mockReturnValueOnce(next.promise).mockReturnValueOnce(replacement.promise)
      const row = await screen.findByRole('button', { name: 'Issue 50' })
      fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
      if (change === 'project') {
        rerender(
          <ProjectIssuesPanel
            {...props}
            project={createWorkbenchSnapshot('/other', 'other').project}
          />
        )
      } else if (change === 'directory' || change === 'repository') {
        const project = {
          ...props.project,
          ...(change === 'directory' ? { directory: '/moved' } : { issueRepository: 'other/repo' })
        }
        rerender(<ProjectIssuesPanel {...props} project={project} />)
      } else if (change === 'search') {
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'changed query' } })
        fireEvent.click(screen.getByRole('button', { name: '搜索' }))
      } else if (change === 'assignee') {
        fireEvent.click(screen.getByRole('button', { name: '分配给我' }))
      } else if (change === 'label') {
        fireEvent.click(screen.getByRole('button', { name: '标签' }))
        fireEvent.click(screen.getByRole('menuitemradio', { name: 'bug' }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: '刷新 Issues' }))
      }

      expect(row).not.toBeInTheDocument()
      await act(async () => next.resolve(page(100)))
      expect(screen.queryByRole('button', { name: 'Issue 100' })).not.toBeInTheDocument()
      await act(async () => replacement.resolve(page(0, false)))
      await waitFor(() =>
        expect(screen.getByText('没有符合条件的未关闭 Issue')).toBeInTheDocument()
      )
      expect(screen.queryByRole('button', { name: 'Issue 50' })).not.toBeInTheDocument()
    }
  )
})
