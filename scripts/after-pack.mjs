import { constants } from 'node:fs'
import { access, copyFile, mkdir, readdir, rm } from 'node:fs/promises'
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

  const sourceDirectory = await findBundledConptyRuntimeDirectory(
    join(context.packager.projectDir, 'node_modules', 'node-pty', 'third_party', 'conpty'),
    architecture
  )
  const packagedNodePtyDirectory = join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty'
  )
  const nativeModuleDirectory = join(packagedNodePtyDirectory, 'build', 'Release')

  try {
    await access(join(nativeModuleDirectory, 'conpty.node'), constants.R_OK)
  } catch {
    throw new Error(
      `Packaged rebuilt node-pty conpty.node was not found for Windows ${architecture}: ${nativeModuleDirectory}`
    )
  }

  const destinationDirectory = join(nativeModuleDirectory, 'conpty')

  await mkdir(destinationDirectory, { recursive: true })
  await Promise.all(
    conptyRuntimeFiles.map((fileName) =>
      copyFile(join(sourceDirectory, fileName), join(destinationDirectory, fileName))
    )
  )
  await rm(join(packagedNodePtyDirectory, 'prebuilds', `win32-${architecture}`), {
    force: true,
    recursive: true
  })
}

async function findBundledConptyRuntimeDirectory(conptyRootDirectory, architecture) {
  const versions = (await readdir(conptyRootDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  if (versions.length !== 1) {
    throw new Error(
      `Expected exactly one bundled node-pty ConPTY runtime version, found ${versions.length}: ${conptyRootDirectory}`
    )
  }

  return join(conptyRootDirectory, versions[0], `win10-${architecture}`)
}
