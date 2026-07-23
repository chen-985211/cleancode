import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { AgentProviderPreferencesRepository } from '../../application/ports/AgentProviderPreferencesRepository'
import {
  AgentProviderPreferences,
  type AgentProviderPreferencesSnapshot
} from '../../domain/aggregates/AgentProviderPreferences'

export class FileSystemAgentProviderPreferencesRepository implements AgentProviderPreferencesRepository {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AgentProviderPreferencesSnapshot> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      return AgentProviderPreferences.restore(JSON.parse(raw)).toSnapshot()
    } catch (error) {
      if (isMissingFile(error) || error instanceof SyntaxError) {
        return AgentProviderPreferences.create().toSnapshot()
      }
      throw error
    }
  }

  async save(preferences: AgentProviderPreferencesSnapshot): Promise<void> {
    const normalized = AgentProviderPreferences.restore(preferences).toSnapshot()
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, this.filePath)
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}
