import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'

import { AgentProviderPreferences } from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'
import { FileSystemAgentProviderPreferencesRepository } from '../../../../src/contexts/agent/infrastructure/persistence/FileSystemAgentProviderPreferencesRepository'

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn()
}))

describe('Agent Provider preferences file sharing', () => {
  const previous = AgentProviderPreferences.create().toSnapshot()
  const updated = { ...previous, defaultProviderId: 'codex' }
  let files: Map<string, string>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    files = new Map([['preferences.json', JSON.stringify(previous)]])
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(readFile).mockImplementation(async (path) => files.get(String(path))!)
    vi.mocked(writeFile).mockImplementation(async (path, contents) => {
      files.set(String(path), String(contents))
    })
    vi.mocked(rename).mockImplementation(async (from, to) => {
      files.set(String(to), files.get(String(from))!)
      files.delete(String(from))
    })
    vi.mocked(unlink).mockImplementation(async (path) => {
      files.delete(String(path))
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetAllMocks()
  })

  it.each(['EPERM', 'EACCES', 'EBUSY'])(
    'persists the selected Provider after a temporary %s lock',
    async (code) => {
      vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('Locked'), { code }))
      const repository = new FileSystemAgentProviderPreferencesRepository('preferences.json')
      const result = expect(repository.save(updated)).resolves.toBeUndefined()
      await Promise.all([result, vi.runAllTimersAsync()])
      await expect(repository.load()).resolves.toEqual(updated)
      expect([...files.keys()]).toEqual(['preferences.json'])
    }
  )

  it.each([
    ['win32', 'EPERM'],
    ['win32', 'ENOSPC'],
    ['darwin', 'EACCES'],
    ['linux', 'EPERM']
  ])(
    'preserves previous preferences and cleans staging files after a persistent %s %s failure',
    async (platform, code) => {
      vi.stubGlobal('process', { ...process, platform })
      vi.mocked(rename).mockRejectedValue(Object.assign(new Error('Locked'), { code }))
      const repository = new FileSystemAgentProviderPreferencesRepository('preferences.json')
      const result = expect(repository.save(updated)).rejects.toMatchObject({ code })
      await Promise.all([result, vi.runAllTimersAsync()])
      await expect(repository.load()).resolves.toEqual(previous)
      expect([...files.keys()]).toEqual(['preferences.json'])
    }
  )
})
