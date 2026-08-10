import { constants } from 'node:fs'
import { access, chmod, copyFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const conptyRuntimeFiles = ['conpty.dll', 'OpenConsole.exe']

async function copyIfChanged(sourcePath, destinationPath) {
  try {
    const [source, destination] = await Promise.all([
      readFile(sourcePath),
      readFile(destinationPath)
    ])
    if (source.equals(destination)) {
      return
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  await copyFile(sourcePath, destinationPath)
}

if (process.platform === 'win32') {
  const architecture = process.arch
  if (architecture !== 'x64' && architecture !== 'arm64') {
    throw new Error(`Unsupported Windows node-pty architecture: ${architecture}`)
  }

  const nodePtyDirectory = join(process.cwd(), 'node_modules', 'node-pty')
  const conptyRootDirectory = join(nodePtyDirectory, 'third_party', 'conpty')
  const conptyVersions = (await readdir(conptyRootDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  if (conptyVersions.length !== 1) {
    throw new Error(
      `Expected exactly one bundled node-pty ConPTY runtime version, found ${conptyVersions.length}: ${conptyRootDirectory}`
    )
  }

  const sourceDirectory = join(conptyRootDirectory, conptyVersions[0], `win10-${architecture}`)
  const destinationDirectory = join(nodePtyDirectory, 'build', 'Release', 'conpty')

  await mkdir(destinationDirectory, { recursive: true })
  await Promise.all(
    conptyRuntimeFiles.map((fileName) =>
      copyIfChanged(join(sourceDirectory, fileName), join(destinationDirectory, fileName))
    )
  )
}

if (process.platform === 'darwin') {
  const nodePtyPrebuildsDirectory = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds')

  for (const architecture of ['arm64', 'x64']) {
    const helperPath = join(nodePtyPrebuildsDirectory, `darwin-${architecture}`, 'spawn-helper')

    await chmod(helperPath, 0o755)
    await access(helperPath, constants.X_OK)
  }
}
