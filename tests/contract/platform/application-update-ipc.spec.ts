import { registerApplicationUpdateIpc } from '../../../src/platform/electron-main/applicationUpdateIpc'
import type { IpcMainLike } from '../../../src/platform/ipc/registerIpcHandler'

describe('application update IPC boundary', () => {
  function harness(trusted = true) {
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    const snapshot = { revision: 1, status: 'ready' as const, version: '0.2.0', percent: 100 }
    const service = {
      getSnapshot: () => snapshot,
      subscribe: vi.fn(() => () => undefined),
      check: vi.fn(async () => snapshot),
      install: vi.fn(async () => snapshot),
      dispose: vi.fn()
    }
    registerApplicationUpdateIpc({
      ipcMain: {
        handle: (channel, handler) => {
          handlers.set(channel, handler)
        }
      },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      isTrustedSender: () => trusted,
      service
    })
    return {
      service,
      call: (action: string, command?: unknown) =>
        handlers.get(`cleancode:${action}-application-update`)!(null, command)
    }
  }
  it.each([
    null,
    {},
    { version: 1 },
    { version: '0.2.0', url: 'https://untrusted.invalid' },
    { version: 'x'.repeat(100) }
  ])('rejects malformed install commands (%j)', async (command) => {
    const { call, service } = harness()
    expect(await call('install', command)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_IPC_COMMAND' }
    })
    expect(service.install).not.toHaveBeenCalled()
  })
  it.each(['get', 'check', 'install'])('rejects %s from an untrusted sender', async (action) => {
    const { call, service } = harness(false)
    expect(
      await call(action, action === 'install' ? { version: '0.2.0' } : undefined)
    ).toMatchObject({ ok: false })
    expect(service.install).not.toHaveBeenCalled()
    expect(service.check).not.toHaveBeenCalled()
  })
  it('forwards only the confirmed version and never accepts a download address', async () => {
    const { call, service } = harness()
    expect(await call('install', { version: '0.2.0' })).toMatchObject({
      ok: true,
      value: { status: 'ready' }
    })
    expect(service.install).toHaveBeenCalledWith('0.2.0')
    expect(await call('check', { url: 'https://untrusted.invalid' })).toMatchObject({ ok: false })
  })
})
