import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function createPackagedWindowsRuntimeFixture(installDirectory: string): Promise<void> {
  const resourcesDirectory = join(installDirectory, 'resources')
  const nodePtyDirectory = join(resourcesDirectory, 'app.asar.unpacked', 'node_modules', 'node-pty')
  const releaseDirectory = join(nodePtyDirectory, 'build', 'Release')
  await Promise.all([
    mkdir(resourcesDirectory, { recursive: true }),
    mkdir(join(releaseDirectory, 'conpty'), { recursive: true }),
    mkdir(join(nodePtyDirectory, 'lib'), { recursive: true })
  ])
  await Promise.all([
    writeFile(join(installDirectory, 'CleanCode.exe'), 'electron-host', 'utf8'),
    writeFile(join(installDirectory, 'icudtl.dat'), 'icu', 'utf8'),
    writeFile(join(installDirectory, 'snapshot_blob.bin'), 'snapshot', 'utf8'),
    writeFile(join(installDirectory, 'v8_context_snapshot.bin'), 'v8-snapshot', 'utf8'),
    writeFile(join(installDirectory, 'ffmpeg.dll'), 'not-needed', 'utf8'),
    writeFile(join(resourcesDirectory, 'app.asar'), 'application-archive-v1', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty.node'), 'native-binding', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty_console_list.node'), 'console-list-binding', 'utf8'),
    writeFile(join(releaseDirectory, 'pty.node'), 'winpty-binding', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty.pdb'), 'debug-symbols', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty', 'conpty.dll'), 'conpty', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty', 'OpenConsole.exe'), 'console', 'utf8'),
    writeFile(join(nodePtyDirectory, 'lib', 'windowsTerminal.js'), 'module.exports = {}', 'utf8')
  ])
}

export function packagedTerminalProviderEntryPath(installDirectory: string): string {
  return join(
    installDirectory,
    'resources',
    'app.asar',
    'out',
    'main',
    'terminal-runtime-provider.js'
  )
}
