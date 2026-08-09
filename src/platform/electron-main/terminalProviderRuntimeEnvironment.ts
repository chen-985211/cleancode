import { createHash } from 'node:crypto'
import type { Stats } from 'node:fs'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, win32 } from 'node:path'

export interface TerminalProviderArchiveFileSystem {
  access(path: string): Promise<void>
  readFile(path: string): Promise<Buffer>
  copyFile(sourcePath: string, destinationPath: string): Promise<void>
  stat(path: string): Promise<Stats>
}

export function createElectronArchiveFileSystem(): TerminalProviderArchiveFileSystem {
  const originalFileSystem = createRequire(import.meta.url)('original-fs') as {
    readonly promises: TerminalProviderArchiveFileSystem
  }
  return originalFileSystem.promises
}

export function resolveTerminalProviderRuntimeRootDirectory(input: {
  readonly allowTestDirectory?: boolean
  readonly localAppDataDirectory?: string
  readonly platform: NodeJS.Platform
  readonly providerStateDirectory: string
  readonly testDirectory?: string
  readonly testStateDirectory?: string
  readonly temporaryDirectory?: string
  readonly userDataDirectory: string
}): string {
  if (input.testDirectory) {
    const temporaryDirectory = canonicalizeExistingDirectory(
      input.temporaryDirectory,
      input.platform
    )
    const testStateDirectory = canonicalizeExistingDirectory(
      input.testStateDirectory,
      input.platform
    )
    if (
      !input.allowTestDirectory ||
      !input.testStateDirectory ||
      !input.temporaryDirectory ||
      !temporaryDirectory ||
      !testStateDirectory ||
      !isStrictDescendant(temporaryDirectory, testStateDirectory, input.platform) ||
      !isStrictDescendant(input.testStateDirectory, input.testDirectory, input.platform)
    ) {
      throw new Error(
        'Terminal Provider runtime image test directory must be inside an isolated E2E state directory.'
      )
    }
    return input.testDirectory
  }
  if (input.platform !== 'win32' || !input.localAppDataDirectory) {
    return join(input.userDataDirectory, 'terminal-provider-host')
  }
  const profileId = createHash('sha256')
    .update(win32.normalize(input.providerStateDirectory).toLowerCase())
    .digest('hex')
    .slice(0, 24)
  return win32.join(input.localAppDataDirectory, 'CleanCode', 'terminal-provider-host', profileId)
}

function canonicalizeExistingDirectory(
  path: string | undefined,
  platform: NodeJS.Platform
): string | undefined {
  if (!path || platform !== process.platform) return path
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

function isStrictDescendant(parent: string, candidate: string, platform: NodeJS.Platform): boolean {
  const pathApi = platform === 'win32' ? win32 : { isAbsolute, relative }
  const relativePath = pathApi.relative(parent, candidate)
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${platform === 'win32' ? '\\' : '/'}`) &&
    !pathApi.isAbsolute(relativePath)
  )
}
