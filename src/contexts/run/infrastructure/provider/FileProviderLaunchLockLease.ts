import type { FileHandle } from 'node:fs/promises'

import type { ProcessEpochReference } from './ProcessEpochLiveness'

export interface ProviderLaunchLockLease {
  assertOwned(): Promise<void>
  refresh(): Promise<void>
  close(): Promise<void>
}

interface FileProviderLaunchLockLeaseOptions {
  readonly assertOwned: () => Promise<void>
  readonly handle: FileHandle
  readonly ownerId: string
  readonly processEpoch?: ProcessEpochReference
  readonly release: () => Promise<void>
  readonly runRefresh?: <T>(operation: () => Promise<T>) => Promise<T>
}

export function createFileProviderLaunchLockLease(
  options: FileProviderLaunchLockLeaseOptions
): ProviderLaunchLockLease {
  return new FileProviderLaunchLockLease(options)
}

class FileProviderLaunchLockLease implements ProviderLaunchLockLease {
  private closePromise: Promise<void> | null = null
  private handleClosed = false
  private isClosed = false

  constructor(private readonly options: FileProviderLaunchLockLeaseOptions) {}

  async assertOwned(): Promise<void> {
    if (this.isClosed || this.closePromise) {
      throw new Error('Terminal Provider launch lock is already closed.')
    }
    await this.options.assertOwned()
  }

  async refresh(): Promise<void> {
    if (this.isClosed) return
    await (this.options.runRefresh ?? runDirectly)(async () => {
      await this.assertOwned()
      const contents = Buffer.from(
        `${JSON.stringify({
          schemaVersion: 1,
          ownerId: this.options.ownerId,
          processId: process.pid,
          acquiredAt: new Date().toISOString(),
          ...(this.options.processEpoch ? { processEpoch: this.options.processEpoch } : {})
        })}\n`,
        'utf8'
      )
      await writeCompleteBuffer(this.options.handle, contents)
      await this.options.handle.truncate(contents.length)
      await this.options.handle.sync()
      await this.assertOwned()
    })
  }

  async close(): Promise<void> {
    if (this.isClosed) return
    if (this.closePromise) return this.closePromise
    this.closePromise = this.release()
    try {
      await this.closePromise
      this.isClosed = true
    } finally {
      this.closePromise = null
    }
  }

  private async release(): Promise<void> {
    if (!this.handleClosed) {
      await this.options.handle.close()
      this.handleClosed = true
    }
    await this.options.release()
  }
}

function runDirectly<T>(operation: () => Promise<T>): Promise<T> {
  return operation()
}

async function writeCompleteBuffer(handle: FileHandle, contents: Buffer): Promise<void> {
  let offset = 0
  while (offset < contents.length) {
    const { bytesWritten } = await handle.write(contents, offset, contents.length - offset, offset)
    if (bytesWritten <= 0) {
      throw new Error('Terminal Provider launch lock heartbeat write made no progress.')
    }
    offset += bytesWritten
  }
}
