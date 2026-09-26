import { registerProjectIssueIpcHandlers } from '../../../../src/platform/electron-main/projectIssueIpcHandlers'
import type { IpcInvokeResult } from '../../../../src/platform/ipc/registerIpcHandler'

describe('project issues IPC', () => {
  it('validates issue numbers and filters before entering the application', async () => {
    const handlers = new Map<
      string,
      (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
    >()
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
  })
})
