import { retireWindowsInstallDirectory } from '../../support/e2eWindowsInstallReplacement'

describe('retireWindowsInstallDirectory', () => {
  it('waits for transient Windows process handles to release the install directory', async () => {
    const directoryBusyError = Object.assign(new Error('directory is still in use'), {
      code: 'EPERM'
    })
    const renameDirectory = vi
      .fn()
      .mockRejectedValueOnce(directoryBusyError)
      .mockResolvedValue(undefined)

    await retireWindowsInstallDirectory('C:\\app', 'C:\\app.retired', {
      intervalMs: 1,
      renameDirectory,
      timeoutMs: 100
    })

    expect(renameDirectory).toHaveBeenCalledTimes(2)
  })

  it('does not retry a permanent rename failure', async () => {
    const missingDirectoryError = Object.assign(new Error('directory does not exist'), {
      code: 'ENOENT'
    })
    const renameDirectory = vi.fn().mockRejectedValue(missingDirectoryError)

    await expect(
      retireWindowsInstallDirectory('C:\\app', 'C:\\app.retired', {
        intervalMs: 1,
        renameDirectory,
        timeoutMs: 100
      })
    ).rejects.toMatchObject({ cause: missingDirectoryError })
    expect(renameDirectory).toHaveBeenCalledOnce()
  })
})
