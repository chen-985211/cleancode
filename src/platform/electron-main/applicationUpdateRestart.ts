import { constants, rmSync } from 'node:fs'
import { chmod, copyFile, link, mkdtemp, realpath, rename, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'

// AppImageUpdater unlinks APPIMAGE before moving its downloaded replacement. Keep the
// old inode on the same filesystem until installation succeeds or recovery completes.
export function createApplicationUpdateRestart(input: {
  readonly prepareRestart: () => Promise<void>
  readonly restartAfterFailedInstall: (executable?: string) => Promise<void>
  readonly appImagePath?: string
  readonly isInstallFailed: () => boolean
  readonly onCleanupFailure: () => void
}) {
  let backupDirectory: string | undefined
  let backupPath: string | undefined
  let preparation: Promise<void> | undefined
  let recovery: Promise<void> | undefined
  let preparing = false
  let recovering = false
  let recovered = false
  let preserveBackup = false

  const cleanup = () => {
    if (!backupDirectory || preserveBackup) return
    try {
      rmSync(backupDirectory, { recursive: true, force: true })
      backupDirectory = undefined
      backupPath = undefined
    } catch {
      input.onCleanupFailure()
    }
  }
  const prepare = async () => {
    preparing = true
    try {
      await input.prepareRestart()
      if (!input.appImagePath) return
      if (!isAbsolute(input.appImagePath) || input.appImagePath.includes('\0')) {
        throw new Error('AppImage path must be absolute.')
      }
      const source = await realpath(input.appImagePath)
      backupDirectory = await mkdtemp(join(dirname(input.appImagePath), '.cleancode-update-'))
      const destination = join(backupDirectory, basename(input.appImagePath))
      try {
        await link(source, destination)
      } catch {
        // Filesystems without hard links still support updates if a full backup fits.
        await copyFile(source, destination, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
        await chmod(destination, (await stat(source)).mode)
      }
      backupPath = destination
    } catch (error) {
      cleanup()
      throw error
    } finally {
      preparing = false
    }
  }
  const recover = async () => {
    recovering = true
    let executable = input.appImagePath
    try {
      // Errors may arrive while runtime cleanup or backup creation is still pending.
      await preparation?.catch(() => undefined)
      if (backupPath && input.appImagePath) {
        try {
          await rename(backupPath, input.appImagePath)
          cleanup()
        } catch {
          // If the directory became read-only, the private backup remains executable.
          executable = backupPath
          preserveBackup = true
        }
      }
      recovered = true
    } finally {
      recovering = false
    }
    await input.restartAfterFailedInstall(executable)
  }
  return {
    prepareRestart(): Promise<void> {
      preparation ??= prepare()
      return preparation
    },
    restartAfterFailedInstall(): Promise<void> {
      recovery ??= recover()
      return recovery
    },
    beforeQuit(event: { preventDefault(): void }): void {
      if (!input.appImagePath) return
      if (preparing || recovering || (backupPath && input.isInstallFailed() && !recovered)) {
        event.preventDefault()
        return
      }
      cleanup()
    }
  }
}
