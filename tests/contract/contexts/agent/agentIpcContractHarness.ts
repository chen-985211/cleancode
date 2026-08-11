import type { IpcInvokeResult, IpcMainLike } from '../../../../src/platform/ipc/registerIpcHandler'
import type { Logger } from '../../../../src/platform/logging/Logger'

export class FakeIpcMain implements IpcMainLike {
  private readonly handlers = new Map<
    string,
    (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  >()

  handle(
    channel: string,
    listener: (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  ): void {
    this.handlers.set(channel, listener)
  }

  invoke<TResult>(
    channel: string,
    command?: unknown,
    event: unknown = createSenderEvent()
  ): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler(event, command) as Promise<IpcInvokeResult<TResult>>
  }
}

export class SilentLogger implements Logger {
  debug(event: Parameters<Logger['debug']>[0]): void {
    this.ignore(event)
  }

  info(event: Parameters<Logger['info']>[0]): void {
    this.ignore(event)
  }

  warn(event: Parameters<Logger['warn']>[0]): void {
    this.ignore(event)
  }

  error(event: Parameters<Logger['error']>[0]): void {
    this.ignore(event)
  }

  private ignore(event: Parameters<Logger['debug']>[0]): void {
    void event
  }
}

export function createSender(): {
  readonly isDestroyed: () => boolean
  readonly send: ReturnType<typeof vi.fn>
} {
  return {
    isDestroyed: () => false,
    send: vi.fn()
  }
}

function createSenderEvent(): { readonly sender: ReturnType<typeof createSender> } {
  return { sender: createSender() }
}
