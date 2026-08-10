import { constants } from 'node:fs'
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const artifactSchemaVersion = 1
const supportedArchitectures = new Set(['x64', 'arm64'])
const requiredReleasePaths = [
  'conpty.node',
  join('conpty', 'conpty.dll'),
  join('conpty', 'OpenConsole.exe')
]

export async function exportWindowsNodePtyNativeArtifact({
  architecture = process.arch,
  artifactDirectory,
  platform = process.platform,
  projectDirectory = process.cwd()
}) {
  validateTarget({ architecture, platform })
  const runtime = await readRuntimeIdentity(projectDirectory)
  const sourceReleaseDirectory = nodePtyReleaseDirectory(projectDirectory)

  await assertCompleteReleaseDirectory(sourceReleaseDirectory)
  await rm(artifactDirectory, { force: true, recursive: true })
  await mkdir(artifactDirectory, { recursive: true })
  await cp(sourceReleaseDirectory, join(artifactDirectory, 'Release'), { recursive: true })
  await writeFile(
    join(artifactDirectory, 'manifest.json'),
    `${JSON.stringify(
      {
        architecture,
        electronVersion: runtime.electronVersion,
        nodePtyVersion: runtime.nodePtyVersion,
        platform,
        schemaVersion: artifactSchemaVersion
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

export async function restoreWindowsNodePtyNativeArtifact({
  architecture = process.arch,
  artifactDirectory,
  platform = process.platform,
  projectDirectory = process.cwd()
}) {
  validateTarget({ architecture, platform })
  const [manifest, runtime] = await Promise.all([
    readArtifactManifest(artifactDirectory),
    readRuntimeIdentity(projectDirectory)
  ])

  validateManifest(manifest, {
    architecture,
    electronVersion: runtime.electronVersion,
    nodePtyVersion: runtime.nodePtyVersion,
    platform
  })

  const artifactReleaseDirectory = join(artifactDirectory, 'Release')
  await assertCompleteReleaseDirectory(artifactReleaseDirectory)

  const destinationReleaseDirectory = nodePtyReleaseDirectory(projectDirectory)
  await rm(destinationReleaseDirectory, { force: true, recursive: true })
  await mkdir(dirname(destinationReleaseDirectory), { recursive: true })
  await cp(artifactReleaseDirectory, destinationReleaseDirectory, { recursive: true })
  await assertCompleteReleaseDirectory(destinationReleaseDirectory)
}

function validateTarget({ architecture, platform }) {
  if (platform !== 'win32' || !supportedArchitectures.has(architecture)) {
    throw new Error(
      `Windows node-pty native artifact does not support ${platform}/${architecture}.`
    )
  }
}

async function readRuntimeIdentity(projectDirectory) {
  const [electronVersion, nodePtyVersion] = await Promise.all([
    readPackageVersion(join(projectDirectory, 'node_modules', 'electron', 'package.json')),
    readPackageVersion(join(projectDirectory, 'node_modules', 'node-pty', 'package.json'))
  ])
  return { electronVersion, nodePtyVersion }
}

async function readPackageVersion(packagePath) {
  const packageContents = JSON.parse(await readFile(packagePath, 'utf8'))
  if (typeof packageContents.version !== 'string' || packageContents.version.length === 0) {
    throw new Error(`Package version is unavailable: ${packagePath}`)
  }
  return packageContents.version
}

async function readArtifactManifest(artifactDirectory) {
  const manifestPath = join(artifactDirectory, 'manifest.json')
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`Windows node-pty native artifact manifest is invalid: ${manifestPath}`, {
      cause: error
    })
  }
}

function validateManifest(manifest, expected) {
  if (manifest.schemaVersion !== artifactSchemaVersion) {
    throw new Error(
      `Windows node-pty native artifact schema ${String(manifest.schemaVersion)} is unsupported.`
    )
  }
  if (manifest.platform !== expected.platform || manifest.architecture !== expected.architecture) {
    throw new Error(
      `Windows node-pty native artifact targets ${String(manifest.platform)}/${String(manifest.architecture)}, but the current runner is ${expected.platform}/${expected.architecture}.`
    )
  }
  if (manifest.electronVersion !== expected.electronVersion) {
    throw new Error(
      `Windows node-pty native artifact targets Electron ${String(manifest.electronVersion)}, but the current project uses Electron ${expected.electronVersion}.`
    )
  }
  if (manifest.nodePtyVersion !== expected.nodePtyVersion) {
    throw new Error(
      `Windows node-pty native artifact targets node-pty ${String(manifest.nodePtyVersion)}, but the current project uses node-pty ${expected.nodePtyVersion}.`
    )
  }
}

async function assertCompleteReleaseDirectory(releaseDirectory) {
  await Promise.all(
    requiredReleasePaths.map(async (relativePath) => {
      const filePath = join(releaseDirectory, relativePath)
      try {
        await access(filePath, constants.R_OK)
      } catch (error) {
        throw new Error(
          `Windows node-pty native artifact is missing ${relativePath}: ${filePath}`,
          {
            cause: error
          }
        )
      }
    })
  )
}

function nodePtyReleaseDirectory(projectDirectory) {
  return join(projectDirectory, 'node_modules', 'node-pty', 'build', 'Release')
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined
if (entryPath === fileURLToPath(import.meta.url)) {
  const [action, artifactPath] = process.argv.slice(2)
  if (!artifactPath || (action !== 'export' && action !== 'restore')) {
    throw new Error(
      'Usage: node scripts/windows-node-pty-native-artifact.mjs <export|restore> <artifact-directory>'
    )
  }

  const artifactDirectory = resolve(artifactPath)
  if (action === 'export') {
    await exportWindowsNodePtyNativeArtifact({ artifactDirectory })
  } else {
    await restoreWindowsNodePtyNativeArtifact({ artifactDirectory })
  }
}
