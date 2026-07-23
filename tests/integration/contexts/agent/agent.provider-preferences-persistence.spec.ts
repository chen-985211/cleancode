import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileSystemAgentProviderPreferencesRepository } from '../../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentProviderPreferencesRepository'

describe('Agent Provider preferences persistence', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-agent-provider-preferences-'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('defaults a missing file to Yolo and atomically persists normalized settings', async () => {
    const path = join(directory, 'agent-provider-preferences.json')
    const repository = new FileSystemAgentProviderPreferencesRepository(path)

    await expect(repository.load()).resolves.toMatchObject({
      defaultCleancodeMcpEnabled: true,
      permissionMode: 'yolo'
    })

    await repository.save({
      defaultCleancodeMcpEnabled: false,
      defaultProviderId: 'codex',
      disabledProviderIds: ['opencode'],
      permissionMode: 'manual',
      providerOverrides: {
        codex: {
          argumentsText: '--model gpt-5',
          environment: { CODEX_HOME: '/tmp/codex' },
          executable: '/opt/bin/codex'
        }
      },
      version: 1
    })

    await expect(repository.load()).resolves.toEqual({
      defaultCleancodeMcpEnabled: false,
      defaultProviderId: 'codex',
      disabledProviderIds: ['opencode'],
      permissionMode: 'manual',
      providerOverrides: {
        codex: {
          argumentsText: '--model gpt-5',
          environment: { CODEX_HOME: '/tmp/codex' },
          executable: '/opt/bin/codex'
        }
      },
      version: 1
    })
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1 })
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    }
  })

  it('recovers safely from malformed persisted JSON', async () => {
    const path = join(directory, 'agent-provider-preferences.json')
    await writeFile(path, '{malformed', 'utf8')
    const repository = new FileSystemAgentProviderPreferencesRepository(path)

    await expect(repository.load()).resolves.toMatchObject({
      defaultCleancodeMcpEnabled: true,
      permissionMode: 'yolo'
    })
  })
})
