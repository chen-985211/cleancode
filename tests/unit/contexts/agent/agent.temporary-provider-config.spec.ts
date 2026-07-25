const fileSystem = vi.hoisted(() => ({
  chmod: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn()
}))

vi.mock('node:fs/promises', () => ({ ...fileSystem, default: fileSystem }))

import { join } from 'node:path'

import { createTemporaryProviderConfig } from '../../../../src/contexts/agent/infrastructure/providers/shared/TemporaryProviderConfig'

describe('temporary Agent Provider config', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fileSystem.mkdtemp.mockResolvedValue('/tmp/cleancode-provider-config')
    fileSystem.chmod.mockResolvedValue(undefined)
    fileSystem.writeFile.mockResolvedValue(undefined)
    fileSystem.rm.mockResolvedValue(undefined)
  })

  it('creates the temporary directory and config with private permissions', async () => {
    const config = await createTemporaryProviderConfig(
      'cleancode-provider-',
      'provider.json',
      '{"enabled":true}'
    )

    expect(fileSystem.chmod).toHaveBeenCalledWith('/tmp/cleancode-provider-config', 0o700)
    expect(fileSystem.writeFile).toHaveBeenCalledWith(
      join('/tmp/cleancode-provider-config', 'provider.json'),
      '{"enabled":true}',
      { encoding: 'utf8', mode: 0o600 }
    )

    await config.dispose()
  })

  it('removes its directory when config creation fails after allocation', async () => {
    const writeFailure = new Error('config write failed')
    fileSystem.writeFile.mockRejectedValueOnce(writeFailure)

    await expect(
      createTemporaryProviderConfig('cleancode-provider-', 'provider.json', '{}')
    ).rejects.toBe(writeFailure)

    expect(fileSystem.rm).toHaveBeenCalledWith('/tmp/cleancode-provider-config', {
      force: true,
      recursive: true
    })
  })

  it('preserves setup and cleanup failures when rollback cannot remove the directory', async () => {
    const writeFailure = new Error('config write failed')
    const cleanupFailure = new Error('config cleanup failed')
    fileSystem.writeFile.mockRejectedValueOnce(writeFailure)
    fileSystem.rm.mockRejectedValueOnce(cleanupFailure)

    const error = await createTemporaryProviderConfig(
      'cleancode-provider-',
      'provider.json',
      '{}'
    ).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error).toMatchObject({ errors: [writeFailure, cleanupFailure] })
  })

  it('retries disposal after a transient removal failure', async () => {
    const cleanupFailure = new Error('config cleanup failed')
    fileSystem.rm.mockRejectedValueOnce(cleanupFailure).mockResolvedValueOnce(undefined)
    const config = await createTemporaryProviderConfig('cleancode-provider-', 'provider.json', '{}')

    await expect(config.dispose()).rejects.toBe(cleanupFailure)
    await expect(config.dispose()).resolves.toBeUndefined()
    await expect(config.dispose()).resolves.toBeUndefined()

    expect(fileSystem.rm).toHaveBeenCalledTimes(2)
  })
})
