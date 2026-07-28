import { constants } from 'node:fs'
import { access, copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const electronBuilderArchitectureNames = new Map([
  [1, 'x64'],
  [3, 'arm64']
])
const conptyRuntimeFiles = ['conpty.dll', 'OpenConsole.exe']

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const architecture = electronBuilderArchitectureNames.get(context.arch)
  if (!architecture) {
    throw new Error(`Unsupported Windows node-pty packaging architecture: ${context.arch}`)
  }

  const sourceDirectory = join(
    context.packager.projectDir,
    'node_modules',
    'node-pty',
    'prebuilds',
    `win32-${architecture}`,
    'conpty'
  )
  const packagedNodePtyDirectory = join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty'
  )
  const nativeModuleDirectory = await findPackagedConptyNativeModuleDirectory(
    packagedNodePtyDirectory,
    architecture
  )
  const destinationDirectory = join(nativeModuleDirectory, 'conpty')

  await mkdir(destinationDirectory, { recursive: true })
  await Promise.all(
    conptyRuntimeFiles.map((fileName) =>
      copyFile(join(sourceDirectory, fileName), join(destinationDirectory, fileName))
    )
  )
}

async function findPackagedConptyNativeModuleDirectory(nodePtyDirectory, architecture) {
  const candidates = [
    join(nodePtyDirectory, 'build', 'Release'),
    join(nodePtyDirectory, 'build', 'Debug'),
    join(nodePtyDirectory, 'prebuilds', `win32-${architecture}`)
  ]

  for (const candidate of candidates) {
    try {
      await access(join(candidate, 'conpty.node'), constants.R_OK)
      return candidate
    } catch {
      // Continue in node-pty's native module load order.
    }
  }

  throw new Error(
    `Packaged node-pty conpty.node was not found for Windows ${architecture}: ${candidates.join(', ')}`
  )
}
