import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectIssuesPanel } from '../../../../src/contexts/project/presentation/components/ProjectIssuesPanel'
import { createWorkbenchSnapshot } from '../../../fixtures/presentation/appShellFixtures'
import {
  createExpectedAppError,
  serializeAppError
} from '../../../../src/shared-kernel/application/errors/AppError'

const issue = {
  id: 'I_42',
  repository: 'owner/repo',
  number: 42,
  title: 'Resize terminal',
  url: 'https://github.com/owner/repo/issues/42',
  body: 'Reproduction steps',
  state: 'OPEN' as const,
  labels: ['bug'],
  assignees: ['dev']
}
const result = {
  repository: { name: 'owner/repo', defaultBranch: 'main' },
  issues: [issue],
  hasMore: false
}

describe('project issues panel', () => {
  afterEach(() => {
    delete window.cleancode
  })
  it('uses a checked directional menu for labels with keyboard selection and focus restoration', async () => {
    const list = vi.fn(async () => result)
    window.cleancode = { listProjectIssues: list } as unknown as NonNullable<Window['cleancode']>
    const close = vi.fn()
    render(
      <ProjectIssuesPanel
        project={createWorkbenchSnapshot('/project', 'project').project}
        onClose={close}
        onStart={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onProjectChanged={vi.fn()}
      />
    )
    await screen.findByRole('button', { name: issue.title })
    const trigger = screen.getByRole('button', { name: '标签' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const all = screen.getByRole('menuitemradio', { name: '全部标签' })
    expect(all).toHaveAttribute('aria-checked', 'true')
    expect(all).toHaveFocus()
    fireEvent.keyDown(all, { key: 'End' })
    const bug = screen.getByRole('menuitemradio', { name: 'bug' })
    expect(bug).toHaveFocus()
    fireEvent.keyDown(bug, { key: 'Enter' })
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'bug' }))
    )
    expect(trigger).toHaveFocus()
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(close).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })
  it('cancels repository editing on an outside pointer without saving or stealing focus', async () => {
    const project = createWorkbenchSnapshot('/project', 'project').project
    const configure = vi.fn()
    window.cleancode = {
      listProjectIssues: vi.fn(async () => result),
      configureProjectIssues: configure
    } as unknown as NonNullable<Window['cleancode']>
    render(
      <ProjectIssuesPanel
        project={project}
        title="任务"
        onClose={vi.fn()}
        onStart={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onProjectChanged={vi.fn()}
      />
    )
    const source = await screen.findByRole('button', { name: 'owner/repo' })
    expect(screen.queryByRole('heading', { name: '任务' })).not.toBeInTheDocument()
    fireEvent.click(source)
    const editor = screen.getByRole('textbox', { name: 'GitHub 仓库' })
    fireEvent.change(editor, { target: { value: 'discard/repo' } })
    fireEvent.pointerDown(editor)
    expect(editor).toBeInTheDocument()
    const search = screen.getByRole('searchbox')
    search.focus()
    fireEvent.pointerDown(search)
    expect(screen.queryByRole('textbox', { name: 'GitHub 仓库' })).not.toBeInTheDocument()
    expect(search).toHaveFocus()
    expect(configure).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'owner/repo' }))
    expect(screen.getByRole('textbox', { name: 'GitHub 仓库' })).toHaveValue('owner/repo')
  })
  it('edits the repository in its header slot and discards a cancelled draft', async () => {
    const project = createWorkbenchSnapshot('/project', 'project').project
    const configure = vi.fn(async () => ({ ...project, issueRepository: 'other/repo' }))
    window.cleancode = {
      listProjectIssues: vi.fn(async () => result),
      configureProjectIssues: configure
    } as unknown as NonNullable<Window['cleancode']>
    const changed = vi.fn()
    const close = vi.fn()
    render(
      <ProjectIssuesPanel
        project={project}
        onClose={close}
        onStart={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onProjectChanged={changed}
      />
    )
    fireEvent.click(await screen.findByRole('button', { name: 'owner/repo' }))
    const input = screen.getByRole('textbox', { name: 'GitHub 仓库' })
    expect(input.closest('header')).not.toBeNull()
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'discard/repo' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(configure).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    const source = screen.getByRole('button', { name: 'owner/repo' })
    expect(source).toHaveFocus()
    fireEvent.click(source)
    const reopened = screen.getByRole('textbox', { name: 'GitHub 仓库' })
    expect(reopened).toHaveValue('owner/repo')
    fireEvent.change(reopened, { target: { value: 'other/repo' } })
    configure.mockRejectedValueOnce(new Error('Temporary failure'))
    fireEvent.submit(reopened.closest('form')!)
    await screen.findByRole('alert')
    expect(reopened).toHaveValue('other/repo')
    expect(changed).not.toHaveBeenCalled()
    fireEvent.submit(reopened.closest('form')!)
    await waitFor(() =>
      expect(changed).toHaveBeenCalledWith(
        expect.objectContaining({ issueRepository: 'other/repo' })
      )
    )
    expect(configure).toHaveBeenCalledWith({
      projectDirectory: '/project',
      repository: 'other/repo'
    })
    expect(screen.queryByRole('textbox', { name: 'GitHub 仓库' })).not.toBeInTheDocument()
  })
  it('browses a full list before opening a detail and only asks for branches when starting', async () => {
    window.cleancode = {
      listProjectIssues: vi.fn(async () => result),
      getProjectIssue: vi.fn(async () => issue)
    } as unknown as NonNullable<Window['cleancode']>
    const onStart = vi.fn(async () => true)
    render(
      <ProjectIssuesPanel
        project={createWorkbenchSnapshot('/project', 'project').project}
        onClose={vi.fn()}
        onStart={onStart}
        onOpenWorkspace={vi.fn()}
        onProjectChanged={vi.fn()}
      />
    )
    const row = await screen.findByRole('button', { name: issue.title })
    expect(screen.queryByRole('heading', { name: issue.title })).not.toBeInTheDocument()
    fireEvent.click(row)
    await screen.findByRole('heading', { name: issue.title })
    expect(screen.queryByLabelText('基准分支')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开始处理' }))
    expect(screen.getByRole('dialog', { name: '开始处理' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '分支名称' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '开始处理' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始处理' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: '开始处理' }))
    expect(screen.getByLabelText('基准分支')).toHaveValue('main')
    expect(onStart).not.toHaveBeenCalled()
    const heading = screen.getByRole('heading', { name: issue.title })
    fireEvent.click(screen.getByRole('button', { name: '返回任务列表' }))
    expect(heading).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: issue.title })).not.toBeInTheDocument()
    fireEvent.click(row)
    expect(screen.getByRole('heading', { name: issue.title })).toBe(heading)
    fireEvent.click(screen.getByRole('button', { name: '返回任务列表' }))
    expect(screen.getByRole('button', { name: issue.title })).toHaveFocus()
  })
  it.each([
    ['GITHUB_REQUEST_FAILED', 'GitHub 请求失败。请检查网络、登录状态及仓库访问权限，然后重试。'],
    ['GITHUB_ISSUES_DISABLED', '可以在顶部选择其他 GitHub 仓库作为任务来源。'],
    ['GITHUB_PERMISSION_DENIED', '当前 GitHub 账号无权读取此仓库的 Issues。请检查账号及令牌权限。'],
    [
      'GITHUB_RESOURCE_UNAVAILABLE',
      '仓库或 Issue 不存在，或当前账号没有访问权限。请检查仓库配置及登录账号。'
    ],
    ['GITHUB_RATE_LIMITED', '已达到 GitHub API 请求限额，请稍后刷新。']
  ] as const)('explains %s and preserves the identified repository', async (code, message) => {
    window.cleancode = {
      listProjectIssues: vi.fn().mockRejectedValue(
        serializeAppError(
          createExpectedAppError(code, 'Request failed', {
            repository: 'external/project'
          })
        )
      )
    } as unknown as NonNullable<Window['cleancode']>
    render(
      <ProjectIssuesPanel
        project={createWorkbenchSnapshot('/project', 'project').project}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onProjectChanged={vi.fn()}
      />
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).toHaveClass('project-issues__unavailable')
    expect(document.querySelector('.project-issues__columns')).toBeInTheDocument()
    expect(screen.getByText('external/project')).toBeInTheDocument()
    expect(screen.queryByText('没有符合条件的未关闭 Issue')).not.toBeInTheDocument()
  })
  it('shows an empty state only for a successful query with no matching issues', async () => {
    window.cleancode = {
      listProjectIssues: vi.fn(async () => ({ ...result, issues: [] }))
    } as unknown as NonNullable<Window['cleancode']>
    render(
      <ProjectIssuesPanel
        project={createWorkbenchSnapshot('/project', 'project').project}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onProjectChanged={vi.fn()}
      />
    )
    await screen.findByText('没有符合条件的未关闭 Issue')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('owner/repo')).toBeInTheDocument()
  })
  it('opens an associated workspace instead of creating another one', async () => {
    const project = createWorkbenchSnapshot('/project', 'project').project
    const onOpenWorkspace = vi.fn()
    window.cleancode = {
      listProjectIssues: vi.fn(async () => result),
      getProjectIssue: vi.fn(async () => issue)
    } as unknown as NonNullable<Window['cleancode']>
    render(
      <ProjectIssuesPanel
        project={{
          ...project,
          workspaces: [
            {
              workspaceId: 'task',
              workspaceKind: 'linked-worktree',
              directory: '/task',
              gitBranch: 'issue/42',
              displayName: 'issue/42',
              isCurrent: true,
              issue
            }
          ]
        }}
        onClose={vi.fn()}
        onStart={vi.fn()}
        onOpenWorkspace={onOpenWorkspace}
        onProjectChanged={vi.fn()}
      />
    )
    const workspaceLink = await screen.findByRole('button', { name: '打开工作区 issue/42' })
    fireEvent.click(workspaceLink)
    expect(onOpenWorkspace).toHaveBeenCalledExactlyOnceWith('task')
    expect(window.cleancode.getProjectIssue).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: issue.title })).not.toBeInTheDocument()
    expect(workspaceLink.parentElement?.closest('button')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: issue.title }))
    fireEvent.click(await screen.findByRole('button', { name: '打开工作区' }))
    expect(onOpenWorkspace).toHaveBeenCalledWith('task')
    expect(screen.queryByRole('button', { name: '开始处理' })).not.toBeInTheDocument()
  })
  it('keeps filters with the project and ignores a late response from a different project', async () => {
    const one = createWorkbenchSnapshot('/one', 'one').project
    const two = createWorkbenchSnapshot('/two', 'two').project
    let finish!: (value: typeof result) => void
    const list = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValue({ ...result, issues: [{ ...issue, id: 'I_2', title: 'Second project' }] })
    window.cleancode = {
      listProjectIssues: list,
      getProjectIssue: vi.fn(async () => issue)
    } as unknown as NonNullable<Window['cleancode']>
    const props = {
      onClose: vi.fn(),
      onStart: vi.fn(),
      onOpenWorkspace: vi.fn(),
      onProjectChanged: vi.fn()
    }
    const { rerender } = render(<ProjectIssuesPanel {...props} project={one} />)
    await waitFor(() => expect(list).toHaveBeenCalledOnce())
    rerender(<ProjectIssuesPanel {...props} project={two} />)
    await screen.findByRole('button', { name: 'Second project' })
    finish(result)
    await waitFor(() => expect(screen.queryByText('Resize terminal')).not.toBeInTheDocument())
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bug' } })
    rerender(<ProjectIssuesPanel {...props} project={one} />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    rerender(<ProjectIssuesPanel {...props} project={two} />)
    expect(screen.getByRole('searchbox')).toHaveValue('bug')
  })
})
