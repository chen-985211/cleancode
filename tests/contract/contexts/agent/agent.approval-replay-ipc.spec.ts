import { registerAgentIpcHandlers } from '../../../../src/platform/electron-main/agentIpcHandlers'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'
import { createAgentIpcHandlersInput, FakeIpcMain } from './agentIpcContractHarness'

const channel = 'cleancode:replay-agent-tool-approvals'

it('replays approvals for the exact workspace through a channel independent of session attachment', async () => {
  const ipcMain = new FakeIpcMain()
  const replayAgentToolApprovals = vi.fn()
  const input = createAgentIpcHandlersInput({ ipcMain, replayAgentToolApprovals })
  const attach = vi.spyOn(input, 'attachAgentSession')
  registerAgentIpcHandlers(input)
  const scope = { projectDirectory: '/repo/app', workspaceId: 'feature' }

  await expect(ipcMain.invoke(channel, scope)).resolves.toEqual({ ok: true, value: undefined })

  expect(replayAgentToolApprovals).toHaveBeenCalledExactlyOnceWith(scope)
  expect(attach).not.toHaveBeenCalled()
})

it.each([
  null,
  {},
  { projectDirectory: '/repo/app' },
  { projectDirectory: '/repo/app', workspaceId: '' },
  { projectDirectory: '/repo/app', workspaceId: ' main' },
  { projectDirectory: 42, workspaceId: 'main' }
])('rejects an invalid approval replay scope without calling the owner: %j', async (scope) => {
  const ipcMain = new FakeIpcMain()
  const replayAgentToolApprovals = vi.fn()
  registerAgentIpcHandlers(createAgentIpcHandlersInput({ ipcMain, replayAgentToolApprovals }))

  await expect(ipcMain.invoke(channel, scope)).resolves.toMatchObject({
    error: { code: 'INVALID_IPC_COMMAND', isExpected: true },
    ok: false
  })
  expect(replayAgentToolApprovals).not.toHaveBeenCalled()
})

it('preserves the structured error when approval replay fails', async () => {
  const ipcMain = new FakeIpcMain()
  const replayAgentToolApprovals = vi.fn(() => {
    throw createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Session unavailable.')
  })
  registerAgentIpcHandlers(createAgentIpcHandlersInput({ ipcMain, replayAgentToolApprovals }))

  await expect(
    ipcMain.invoke(channel, { projectDirectory: '/repo/app', workspaceId: 'main' })
  ).resolves.toMatchObject({
    error: { code: 'AGENT_SESSION_NOT_FOUND', isExpected: true },
    ok: false
  })
})
