import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  atomicWriteProviderMetadata,
  type TerminalProviderMetadata
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'

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
      const metadata = createMetadata()
      const provisionalMetadata = createMetadata(0)
      await writeMetadataFixture(provisionalMetadata)

      await atomicWriteProviderMetadata(metadataPath, metadata, {
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
      expect(delays).toEqual([10])
      expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(metadata)
      expect(await readdir(rootDirectory)).toEqual(['provider.json'])
    }
  )

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

  async function writeMetadataFixture(metadata: TerminalProviderMetadata): Promise<void> {
    await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, 'utf8')
  }
})

function createMetadata(processId = 4242): TerminalProviderMetadata {
  return {
    schemaVersion: 1,
    protocolVersion: 1,
    instanceId: 'provider-instance',
    authToken: 'provider-secret',
    endpoint: 'provider-endpoint',
    processId,
    startedAt: '2026-08-08T00:00:00.000Z'
  }
}

function createFileSystemError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: provider metadata replacement failed`), { code })
}
