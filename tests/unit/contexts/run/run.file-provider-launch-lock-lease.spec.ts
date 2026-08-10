import type { FileHandle } from 'node:fs/promises'

import { createFileProviderLaunchLockLease } from '../../../../src/contexts/run/infrastructure/provider/FileProviderLaunchLockLease'

describe('FileProviderLaunchLockLease', () => {
  it('keeps the previous owner record readable until the refreshed record is written', async () => {
    const operations: string[] = []
    let contents = Buffer.from('existing-owner-record\n', 'utf8')
    const handle = {
      close: vi.fn(async () => undefined),
      sync: vi.fn(async () => {
        operations.push('sync')
      }),
      truncate: vi.fn(async (length: number) => {
        operations.push('truncate')
        contents = contents.subarray(0, length)
      }),
      write: vi.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
        operations.push('write')
        expect(contents.toString('utf8')).toBe('existing-owner-record\n')
        const requiredLength = Math.max(contents.length, position + length)
        const next = Buffer.alloc(requiredLength)
        contents.copy(next)
        buffer.copy(next, position, offset, offset + length)
        contents = next
        return { buffer, bytesWritten: length }
      })
    } as unknown as FileHandle
    const lease = createFileProviderLaunchLockLease({
      assertOwned: vi.fn(async () => undefined),
      handle,
      ownerId: 'owner-id',
      release: vi.fn(async () => undefined)
    })

    await lease.refresh()

    expect(operations).toEqual(['write', 'truncate', 'sync'])
    expect(JSON.parse(contents.toString('utf8'))).toMatchObject({
      ownerId: 'owner-id',
      processId: process.pid,
      schemaVersion: 1
    })
  })
})
