import { registerProjectIssueIpcHandlers } from '../../../../src/platform/electron-main/projectIssueIpcHandlers'
import type { IssueWorkspacePhase } from '../../../../src/contexts/project/application/dto/ProjectIssues'
import type { IpcInvokeResult } from '../../../../src/platform/ipc/registerIpcHandler'

describe('project issues IPC', () => {
  it('sends correlated progress only to the requesting renderer and tolerates its closure', async () => {
    const handlers = new Map<
      string,
      (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
    >()
    const start = vi.fn(
      async (_command: unknown, progress?: (phase: IssueWorkspacePhase) => void) => {
        progress?.('preparing')
        progress?.('creating')
        return 'created'
      }
    )
    registerProjectIssueIpcHandlers({
      ipcMain: {
        handle: (name, handler) => {
          handlers.set(name, handler)
        }
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      start,
      prepare: vi.fn(),
      list: vi.fn(),
      detail: vi.fn(),
      configure: vi.fn()
    })
    const invoke = handlers.get('cleancode:start-issue-workspace')!
    const command = {
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/42',
      baseBranch: 'main',
      operationId: 'operation-1'
    }
    const sender = { isDestroyed: () => false, send: vi.fn() }
    expect(await invoke({ sender }, command)).toEqual({ ok: true, value: 'created' })
    expect(sender.send.mock.calls).toEqual([
      ['cleancode:issue-workspace-progress', { operationId: 'operation-1', phase: 'preparing' }],
      ['cleancode:issue-workspace-progress', { operationId: 'operation-1', phase: 'creating' }]
    ])
    sender.send.mockClear()
    expect(await invoke({ sender: { ...sender, isDestroyed: () => true } }, command)).toMatchObject(
      { ok: true }
    )
    expect(sender.send).not.toHaveBeenCalled()
    sender.send.mockImplementation(() => {
      throw new Error('Renderer closed')
    })
    expect(await invoke({ sender }, command)).toMatchObject({ ok: true })
    expect(await invoke({ sender }, { ...command, operationId: 2 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND' }
    })
  })

  it('validates issue numbers and filters before entering the application', async () => {
    const handlers = new Map<
      string,
      (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
    >()
    const prepare = vi.fn(async () => undefined)
    const start = vi.fn(),
      list = vi.fn(async () => ({ issues: [] }))
    registerProjectIssueIpcHandlers({
      ipcMain: {
        handle: (name, handler) => {
          handlers.set(name, handler)
        }
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      list,
      detail: vi.fn(),
      configure: vi.fn(),
      prepare,
      start
    })
    const command = {
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/42',
      baseBranch: 'main'
    }
    expect(
      await handlers.get('cleancode:start-issue-workspace')!({}, { ...command, number: -1 })
    ).toMatchObject({ ok: false, error: { code: 'INVALID_IPC_COMMAND' } })
    expect(
      await handlers.get('cleancode:list-project-issues')!(
        {},
        { projectDirectory: '/project', assignedToMe: 'false' }
      )
    ).toMatchObject({ ok: false })
    expect(start).not.toHaveBeenCalled()
    await handlers.get('cleancode:start-issue-workspace')!({}, command)
    expect(start).toHaveBeenCalledWith(command)
    const prepareHandler = handlers.get('cleancode:prepare-issue-workspace')
    expect(prepareHandler).toBeDefined()
    await prepareHandler!({}, { ...command, baseBranch: '\0' })
    expect(prepare).not.toHaveBeenCalled()
    await prepareHandler!({}, command)
    expect(prepare).toHaveBeenCalledWith({
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      baseBranch: 'main'
    })
  })
})
