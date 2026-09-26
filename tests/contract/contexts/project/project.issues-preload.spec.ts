import {
  createExpectedAppError,
  serializeAppError
} from '../../../../src/shared-kernel/application/errors/AppError'
const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  getPathForFile: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener
  },
  webUtils: { getPathForFile: electronMocks.getPathForFile }
}))

import '../../../../src/platform/electron-preload/preload'

const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1] as NonNullable<Window['cleancode']>

describe('project issues preload contract', () => {
  beforeEach(() => electronMocks.invoke.mockReset())
  it('preserves query and creation payloads and unwraps successful IPC responses', async () => {
    const command = {
      projectDirectory: '/project',
      repository: 'owner/repo',
      number: 42,
      branchName: 'issue/42',
      baseBranch: 'main'
    }
    electronMocks.invoke.mockResolvedValue({ ok: true, value: { marker: 'result' } })
    const entries = [
      ['list-project-issues', () => api.listProjectIssues(command)],
      ['get-project-issue', () => api.getProjectIssue(command)],
      ['configure-project-issues', () => api.configureProjectIssues(command)],
      ['start-issue-workspace', () => api.startIssueWorkspace(command)]
    ] as const
    for (const [channel, run] of entries) {
      await expect(run()).resolves.toEqual({ marker: 'result' })
      expect(electronMocks.invoke).toHaveBeenLastCalledWith(`cleancode:${channel}`, command)
    }
  })
  it('preserves safe failure fields in a value that contextBridge can copy', async () => {
    const failure = serializeAppError(
      createExpectedAppError('GITHUB_AUTH_REQUIRED', 'Authentication required', {
        repository: 'owner/repo'
      }),
      { correlationId: 'request-1' }
    )
    electronMocks.invoke.mockResolvedValue({
      ok: false,
      error: failure
    })
    const received = await api
      .listProjectIssues({ projectDirectory: '/project' })
      .catch((error) => error)
    expect(received).toEqual(failure)
    expect(received).not.toBeInstanceOf(Error)
  })
})
