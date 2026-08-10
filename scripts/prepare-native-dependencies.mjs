import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const nodeRequire = createRequire(import.meta.url)

export function resolveNativeDependencyPreparationInvocation({
  nodeExecutable,
  packageManagerExecutable,
  platform
}) {
  if (platform !== 'win32') return null
  if (!packageManagerExecutable) {
    throw new Error(
      'Cannot rebuild Windows native dependencies because npm_execpath is unavailable.'
    )
  }

  return {
    args: [packageManagerExecutable, 'exec', 'electron-builder', 'install-app-deps'],
    command: nodeExecutable
  }
}

export function resolveNodePtyNativeFallbackDirectories({ architecture, projectDirectory }) {
  if (architecture !== 'x64' && architecture !== 'arm64') {
    throw new Error(`Unsupported Windows node-pty architecture: ${architecture}`)
  }

  const nodePtyDirectory = join(projectDirectory, 'node_modules', 'node-pty')
  return [
    join(nodePtyDirectory, 'build', 'Debug'),
    join(nodePtyDirectory, 'prebuilds', `win32-${architecture}`)
  ]
}

export function resolveNodePtyNativeProbeInvocation({ electronExecutable, probePath }) {
  return {
    args: [probePath],
    command: electronExecutable
  }
}

export async function prepareNativeDependencies({
  nodeExecutable = process.execPath,
  packageManagerExecutable = process.env.npm_execpath,
  platform = process.platform
} = {}) {
  const invocation = resolveNativeDependencyPreparationInvocation({
    nodeExecutable,
    packageManagerExecutable,
    platform
  })
  if (!invocation) return

  await runInvocation(invocation, 'Windows native dependency rebuild')
  await verifyPreparedNativeDependencies({ platform })
}

export async function verifyPreparedNativeDependencies({
  architecture = process.arch,
  platform = process.platform,
  projectDirectory = process.cwd()
} = {}) {
  if (platform !== 'win32') return

  await import('./prepare-packaging.mjs')

  await Promise.all(
    resolveNodePtyNativeFallbackDirectories({
      architecture,
      projectDirectory
    }).map((directory) => rm(directory, { force: true, recursive: true }))
  )

  const electronExecutable = nodeRequire('electron')
  if (typeof electronExecutable !== 'string') {
    throw new Error('Electron executable path is unavailable for the node-pty native probe.')
  }
  const probeInvocation = resolveNodePtyNativeProbeInvocation({
    electronExecutable,
    probePath: fileURLToPath(new URL('./verify-node-pty-native.mjs', import.meta.url))
  })
  await runInvocation(probeInvocation, 'Windows node-pty native probe', {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  })
}

async function runInvocation(invocation, description, env = process.env) {
  await new Promise((resolveInvocation, rejectInvocation) => {
    const child = spawn(invocation.command, invocation.args, {
      env,
      stdio: 'inherit',
      windowsHide: true
    })

    child.once('error', rejectInvocation)
    child.once('close', (exitCode, signal) => {
      if (exitCode === 0) {
        resolveInvocation()
        return
      }

      rejectInvocation(
        new Error(
          `${description} failed with ${signal ? `signal ${signal}` : `exit code ${exitCode}`}.`
        )
      )
    })
  })
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : undefined
if (entryPath === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verify-only')) {
    await verifyPreparedNativeDependencies()
  } else {
    await prepareNativeDependencies()
  }
}
