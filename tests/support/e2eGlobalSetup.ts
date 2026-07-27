import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const E2E_BUILD_ARTIFACTS = [
  'out/main/main.js',
  'out/preload/preload.mjs',
  'out/renderer/index.html'
] as const

export function createE2eBuildInvocation(
  platform: NodeJS.Platform = process.platform,
  commandInterpreter: string | undefined = process.env.ComSpec
): { readonly executable: string; readonly args: string[] } {
  const buildArgs = ['exec', 'electron-vite', 'build']
  if (platform !== 'win32') return { executable: 'pnpm', args: buildArgs }

  return {
    executable: commandInterpreter || 'cmd.exe',
    args: ['/d', '/s', '/c', 'pnpm.cmd', ...buildArgs]
  }
}

export async function assertPrebuiltE2eApplication(rootDirectory: string): Promise<void> {
  const missingArtifacts: string[] = []

  await Promise.all(
    E2E_BUILD_ARTIFACTS.map(async (artifact) => {
      try {
        await access(join(rootDirectory, artifact))
      } catch {
        missingArtifacts.push(artifact)
      }
    })
  )

  if (missingArtifacts.length > 0) {
    missingArtifacts.sort()
    throw new Error(`Incomplete prebuilt E2E application; missing: ${missingArtifacts.join(', ')}`)
  }
}

export async function setup(): Promise<void> {
  if (process.env.CLEANCODE_E2E_PREBUILT === '1') {
    await assertPrebuiltE2eApplication(process.cwd())
    return
  }

  const invocation = createE2eBuildInvocation()
  await execFileAsync(invocation.executable, invocation.args, {
    cwd: process.cwd()
  })
}
