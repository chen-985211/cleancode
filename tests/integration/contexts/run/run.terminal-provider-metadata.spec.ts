import { mkdir, mkdtemp, readFile, readdir, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  atomicWriteProviderMetadata,
  removeStaleProviderMetadata,
  type TerminalProviderMetadata
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import {
  createTerminalProviderHeartbeat,
  createTerminalProviderLivenessReference,
  getTerminalProviderHeartbeatPath,
  terminalProviderHeartbeatStaleAfterMs
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderHeartbeat'
import { terminalProviderProtocolVersion } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { createDeferred } from '../../../fixtures/deferred'

describe('terminal provider metadata persistence', () => {
  let rootDirectory = ''
  let metadataPath = ''

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-metadata-'))
    metadataPath = join(rootDirectory, 'provider.json')
  })

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it.each(['EPERM', 'EACCES', 'EBUSY'] as const)(
    'retries transient Windows %s replacement failures without delaying the test',
    async (code) => {
      const delays: number[] = []
      let renameAttempts = 0
      const assertWriteAllowed = vi.fn(async () => undefined)
      const metadata = createMetadata()
      const provisionalMetadata = createMetadata(0)
      await writeMetadataFixture(provisionalMetadata)

      await atomicWriteProviderMetadata(metadataPath, metadata, {
        assertWriteAllowed,
        platform: 'win32',
        rename: async (source, target) => {
          renameAttempts += 1
          if (renameAttempts === 1) throw createFileSystemError(code)
          await rename(source, target)
        },
        wait: async (durationMs) => {
          delays.push(durationMs)
          expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(provisionalMetadata)
        }
      })

      expect(renameAttempts).toBe(2)
      expect(assertWriteAllowed).toHaveBeenCalledTimes(3)
      expect(delays).toEqual([10])
      expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(metadata)
      expect(await readdir(rootDirectory)).toEqual(['provider.json'])
    }
  )

  it('checks write authorization immediately before and after metadata replacement', async () => {
    const provisionalMetadata = createMetadata(0, 'provisional-provider')
    const replacementMetadata = createMetadata(4242, 'replacement-provider')
    const observedOwners: string[] = []
    await writeMetadataFixture(provisionalMetadata)

    await atomicWriteProviderMetadata(metadataPath, replacementMetadata, {
      assertWriteAllowed: async () => {
        const current = JSON.parse(await readFile(metadataPath, 'utf8'))
        observedOwners.push(current.instanceId)
      }
    })

    expect(observedOwners).toEqual([provisionalMetadata.instanceId, replacementMetadata.instanceId])
  })

  it('leaves existing metadata intact when write authorization is revoked before replacement', async () => {
    const failure = new Error('Provider launch ownership was lost.')
    const provisionalMetadata = createMetadata(0, 'provisional-provider')
    await writeMetadataFixture(provisionalMetadata)

    await expect(
      atomicWriteProviderMetadata(metadataPath, createMetadata(), {
        assertWriteAllowed: async () => {
          throw failure
        }
      })
    ).rejects.toBe(failure)

    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(provisionalMetadata)
    expect(await readdir(rootDirectory)).toEqual(['provider.json'])
  })

  it('holds the metadata guard until post-replacement rejection cleanup completes', async () => {
    const failure = new Error('Provider launch ownership was lost.')
    const cleanupEntered = createDeferred<void>()
    const releaseCleanup = createDeferred<void>()
    const events: string[] = []
    let writeChecks = 0
    await writeMetadataFixture(createMetadata(0, 'provisional-provider'))

    const rejectedWrite = atomicWriteProviderMetadata(
      metadataPath,
      createMetadata(4242, 'rejected-provider'),
      {
        assertWriteAllowed: async () => {
          writeChecks += 1
          if (writeChecks === 2) throw failure
        },
        onWriteRejected: async (error) => {
          expect(error).toBe(failure)
          events.push('cleanup-started')
          cleanupEntered.resolve(undefined)
          await releaseCleanup.promise
          events.push('cleanup-completed')
        }
      }
    )
    const rejectedWriteResult = expect(rejectedWrite).rejects.toBe(failure)
    await cleanupEntered.promise

    let successorSettled = false
    const successorWrite = atomicWriteProviderMetadata(
      metadataPath,
      createMetadata(4243, 'successor-provider'),
      {
        assertWriteAllowed: async () => {
          events.push('successor-entered')
        }
      }
    ).finally(() => {
      successorSettled = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    const successorSettledDuringCleanup = successorSettled
    const eventsDuringCleanup = [...events]
    releaseCleanup.resolve(undefined)
    await rejectedWriteResult
    await successorWrite

    expect(successorSettledDuringCleanup).toBe(false)
    expect(eventsDuringCleanup).toEqual(['cleanup-started'])
    expect(events).toEqual([
      'cleanup-started',
      'cleanup-completed',
      'successor-entered',
      'successor-entered'
    ])
    expect(JSON.parse(await readFile(metadataPath, 'utf8')).instanceId).toBe('successor-provider')
  })

  it.each([
    { code: 'EPERM', platform: 'linux' as const },
    { code: 'ENOSPC', platform: 'win32' as const }
  ])('does not retry $code replacement failures on $platform', async ({ code, platform }) => {
    const failure = createFileSystemError(code)
    const provisionalMetadata = createMetadata(0)
    const renameFile = vi.fn(async () => {
      throw failure
    })
    const wait = vi.fn(async () => undefined)
    await writeMetadataFixture(provisionalMetadata)

    await expect(
      atomicWriteProviderMetadata(metadataPath, createMetadata(), {
        platform,
        rename: renameFile,
        wait
      })
    ).rejects.toBe(failure)

    expect(renameFile).toHaveBeenCalledOnce()
    expect(wait).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(provisionalMetadata)
    expect(await readdir(rootDirectory)).toEqual(['provider.json'])
  })

  it('stops after the bounded Windows retry schedule is exhausted', async () => {
    const failure = createFileSystemError('EPERM')
    const provisionalMetadata = createMetadata(0)
    const renameFile = vi.fn(async () => {
      throw failure
    })
    const delays: number[] = []
    await writeMetadataFixture(provisionalMetadata)

    await expect(
      atomicWriteProviderMetadata(metadataPath, createMetadata(), {
        platform: 'win32',
        rename: renameFile,
        wait: async (durationMs) => {
          delays.push(durationMs)
        }
      })
    ).rejects.toBe(failure)

    expect(renameFile).toHaveBeenCalledTimes(6)
    expect(delays).toEqual([10, 20, 40, 80, 160])
    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(provisionalMetadata)
    expect(await readdir(rootDirectory)).toEqual(['provider.json'])
  })

  it('does not delete metadata published by a successor Provider instance', async () => {
    const endpoint = join(rootDirectory, 'provider.sock')
    const stale = createMetadata(4241, 'stale-provider', endpoint)
    const successor = createMetadata(4242, 'successor-provider', endpoint)
    await writeMetadataFixture(successor)

    await expect(removeStaleProviderMetadata(stale, metadataPath)).resolves.toBe(false)

    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(successor)
  })

  it('treats the heartbeat identity as part of the Provider generation fence', async () => {
    const stale = {
      ...createMetadata(4241, 'shared-provider-instance'),
      liveness: createTerminalProviderLivenessReference()
    }
    const successor = {
      ...createMetadata(4242, 'shared-provider-instance'),
      liveness: createTerminalProviderLivenessReference()
    }
    await writeMetadataFixture(successor)

    await expect(removeStaleProviderMetadata(stale, metadataPath)).resolves.toBe(false)

    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(successor)
  })

  it('removes metadata only while the expected Provider instance still owns it', async () => {
    const stale = createMetadata(4241, 'stale-provider', join(rootDirectory, 'provider.sock'))
    await writeMetadataFixture(stale)

    await expect(removeStaleProviderMetadata(stale, metadataPath)).resolves.toBe(true)

    await expect(readFile(metadataPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('revokes the matching heartbeat before removing stale metadata', async () => {
    const metadata = {
      ...createMetadata(4241, 'stale-provider', join(rootDirectory, 'provider.sock')),
      liveness: createTerminalProviderLivenessReference()
    }
    const heartbeatPath = getTerminalProviderHeartbeatPath(rootDirectory, metadata.liveness)
    const heartbeat = await createTerminalProviderHeartbeat({
      stateDirectory: rootDirectory,
      owner: metadata,
      onFailure: vi.fn()
    })
    await writeMetadataFixture(metadata)

    await expect(removeStaleProviderMetadata(metadata, metadataPath)).resolves.toBe(true)

    await expect(readFile(heartbeatPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(heartbeat.refresh()).rejects.toThrow(
      'Terminal Provider heartbeat ownership was lost.'
    )
    await heartbeat.close()
  })

  it('preserves metadata with a live heartbeat when dead liveness is required', async () => {
    const metadata = {
      ...createMetadata(process.pid, 'live-provider', join(rootDirectory, 'provider.sock')),
      liveness: createTerminalProviderLivenessReference()
    }
    const heartbeatPath = await writeHeartbeatFixture(metadata)
    await writeMetadataFixture(metadata)

    await expect(
      removeStaleProviderMetadata(metadata, metadataPath, { requireDeadLiveness: true })
    ).resolves.toBe(false)

    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(metadata)
    await expect(readFile(heartbeatPath, 'utf8')).resolves.toContain(metadata.instanceId)
  })

  it('removes metadata only after a matching heartbeat is observed dead', async () => {
    const metadata = {
      ...createMetadata(process.pid, 'dead-provider', join(rootDirectory, 'provider.sock')),
      liveness: createTerminalProviderLivenessReference()
    }
    const staleAt = new Date(Date.now() - terminalProviderHeartbeatStaleAfterMs - 1_000)
    const heartbeatPath = await writeHeartbeatFixture(metadata, staleAt)
    await writeMetadataFixture(metadata)

    await expect(
      removeStaleProviderMetadata(metadata, metadataPath, { requireDeadLiveness: true })
    ).resolves.toBe(true)

    await expect(readFile(metadataPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(heartbeatPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('fails closed when required liveness cannot be observed', async () => {
    const metadata = {
      ...createMetadata(process.pid, 'unknown-provider', join(rootDirectory, 'provider.sock')),
      liveness: createTerminalProviderLivenessReference()
    }
    const heartbeatPath = await writeHeartbeatFixture(metadata)
    await writeFile(heartbeatPath, '{invalid-heartbeat', 'utf8')
    await writeMetadataFixture(metadata)

    await expect(
      removeStaleProviderMetadata(metadata, metadataPath, { requireDeadLiveness: true })
    ).resolves.toBe(false)

    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(metadata)
    await expect(readFile(heartbeatPath, 'utf8')).resolves.toBe('{invalid-heartbeat')
  })

  async function writeMetadataFixture(metadata: TerminalProviderMetadata): Promise<void> {
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, 'utf8')
  }

  async function writeHeartbeatFixture(
    metadata: TerminalProviderMetadata & {
      readonly liveness: NonNullable<TerminalProviderMetadata['liveness']>
    },
    modifiedAt = new Date()
  ): Promise<string> {
    const heartbeatPath = getTerminalProviderHeartbeatPath(rootDirectory, metadata.liveness)
    await mkdir(dirname(heartbeatPath), { mode: 0o700, recursive: true })
    await writeFile(
      heartbeatPath,
      `${JSON.stringify({
        schemaVersion: 1,
        heartbeatId: metadata.liveness.heartbeatId,
        instanceId: metadata.instanceId,
        processId: metadata.processId,
        startedAt: metadata.startedAt
      })}\n`,
      'utf8'
    )
    await utimes(heartbeatPath, modifiedAt, modifiedAt)
    return heartbeatPath
  }
})

function createMetadata(
  processId = 4242,
  instanceId = 'provider-instance',
  endpoint = 'provider-endpoint'
): TerminalProviderMetadata {
  return {
    schemaVersion: 1,
    protocolVersion: terminalProviderProtocolVersion,
    instanceId,
    authToken: 'provider-secret',
    endpoint,
    processId,
    startedAt: '2026-08-08T00:00:00.000Z'
  }
}

function createFileSystemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: provider metadata replacement failed`), { code })
}
