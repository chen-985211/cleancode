import { registerApplicationRepositoryStarsIpc } from '../../../src/platform/electron-main/applicationRepositoryStarsIpc'
import type { IpcInvokeResult } from '../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../src/platform/logging/Logger'
import { createExpectedAppError } from '../../../src/shared-kernel/application/errors/AppError'

describe('application repository stars IPC', () => {
  const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

  function fixture() {
    const handlers = new Map<
      string,
      (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
    >()
    const read = vi.fn().mockResolvedValue(3200)
    registerApplicationRepositoryStarsIpc({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      },
      logger,
      read,
      isTrustedSender: (event) => event === 'renderer'
    })
    const invoke = handlers.get('cleancode:get-application-repository-stars')!
    return { read, invoke }
  }

  it('returns only the count for the fixed application repository', async () => {
    const { read, invoke } = fixture()
    await expect(invoke('renderer')).resolves.toEqual({ ok: true, value: 3200 })
    expect(read).toHaveBeenCalledWith()
  })

  it.each([null, {}, { url: 'https://example.com' }, 'token'])(
    'rejects caller-supplied input %s before requesting GitHub',
    async (command) => {
      const { read, invoke } = fixture()
      await expect(invoke('renderer', command)).resolves.toMatchObject({
        ok: false,
        error: { code: 'INVALID_IPC_COMMAND' }
      })
      expect(read).not.toHaveBeenCalled()
    }
  )

  it('rejects an unknown renderer', async () => {
    const { read, invoke } = fixture()
    await expect(invoke('unknown')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND' }
    })
    expect(read).not.toHaveBeenCalled()
  })

  it('preserves structured failure information through the shared IPC wrapper', async () => {
    const { read, invoke } = fixture()
    read.mockRejectedValueOnce(
      createExpectedAppError('GITHUB_REQUEST_FAILED', 'Repository stars unavailable.')
    )
    await expect(invoke('renderer')).resolves.toMatchObject({
      ok: false,
      error: { code: 'GITHUB_REQUEST_FAILED', correlationId: expect.any(String) }
    })
  })
})
