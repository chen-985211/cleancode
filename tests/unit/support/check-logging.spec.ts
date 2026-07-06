import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collectLoggingViolations } from '../../../scripts/check-logging.mjs'

describe('logging quality gate', () => {
  it('flags direct console usage outside the logging sink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'presentation'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'presentation', 'bad.ts'),
        "console.error('not through logger')\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/presentation/bad.ts',
          rule: 'no-direct-console'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('flags bare Electron IPC handlers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'platform', 'electron-main'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'platform', 'electron-main', 'bad.ts'),
        "ipcMain.handle('cleancode:test', async () => null)\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/platform/electron-main/bad.ts',
          rule: 'no-bare-ipc-main-handle'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('flags renderer message parsing for application errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'presentation'), { recursive: true })
      await writeFile(
        join(directory, 'src', 'presentation', 'bad.ts'),
        "if (error.message.includes('Git branch already exists')) return 'duplicate'\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/presentation/bad.ts',
          rule: 'no-renderer-error-message-parsing'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('flags bare application and domain errors inside bounded contexts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'src', 'contexts', 'project', 'application'), {
        recursive: true
      })
      await writeFile(
        join(directory, 'src', 'contexts', 'project', 'application', 'bad.ts'),
        "throw new Error('Project was not found.')\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([
        expect.objectContaining({
          filePath: 'src/contexts/project/application/bad.ts',
          rule: 'no-bare-context-application-error'
        })
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('allows console output inside scripts and the platform logging sink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-logging-'))

    try {
      await mkdir(join(directory, 'scripts'), { recursive: true })
      await mkdir(join(directory, 'src', 'platform', 'logging'), { recursive: true })
      await writeFile(join(directory, 'scripts', 'task.mjs'), "console.log('ok')\n")
      await writeFile(
        join(directory, 'src', 'platform', 'logging', 'ConsoleLogSink.ts'),
        "console.error('ok')\n"
      )

      expect(await collectLoggingViolations({ cwd: directory })).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
