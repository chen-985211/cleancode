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
      mcpToolCategories: { canvas: true, collaboration: true },
      permissionMode: 'yolo'
    })

    await repository.save({
      defaultCleancodeMcpEnabled: false,
      mcpToolCategories: { canvas: false, collaboration: true },
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
      mcpToolCategories: { canvas: false, collaboration: true },
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

  it('loads legacy preferences without rewriting them and saves categories independently', async () => {
    const path = join(directory, 'legacy.json')
    const legacy = JSON.stringify({ version: 1, defaultCleancodeMcpEnabled: false })
    await writeFile(path, legacy)
    const repository = new FileSystemAgentProviderPreferencesRepository(path)
    const restored = await repository.load()
    expect(restored.mcpToolCategories).toEqual({ canvas: true, collaboration: true })
    expect(await readFile(path, 'utf8')).toBe(legacy)
    await repository.save({
      ...restored,
      mcpToolCategories: { canvas: true, collaboration: false }
    })
    expect(await new FileSystemAgentProviderPreferencesRepository(path).load()).toMatchObject({
      defaultCleancodeMcpEnabled: false,
      mcpToolCategories: { canvas: true, collaboration: false }
    })
  })

  it('recovers safely from malformed persisted JSON', async () => {
    const path = join(directory, 'agent-provider-preferences.json')
    await writeFile(path, '{malformed', 'utf8')
    const repository = new FileSystemAgentProviderPreferencesRepository(path)

    await expect(repository.load()).resolves.toMatchObject({
      defaultCleancodeMcpEnabled: true,
      mcpToolCategories: { canvas: true, collaboration: true },
      permissionMode: 'yolo'
    })
  })
})
