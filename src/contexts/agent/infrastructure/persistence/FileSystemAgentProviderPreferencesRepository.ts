import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
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
    try {
      await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 })
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temporaryPath, this.filePath)
          return
        } catch (error) {
          if (
            process.platform !== 'win32' ||
            attempt >= 5 ||
            !['EACCES', 'EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')
          )
            throw error
          // Windows readers/scanners can briefly lock the existing destination.
          await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt))
        }
      }
    } finally {
      await unlink(temporaryPath).catch(() => undefined)
    }
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
