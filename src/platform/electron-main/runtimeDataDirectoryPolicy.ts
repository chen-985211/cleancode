import { createHash } from 'node:crypto'
import { posix, win32 } from 'node:path'

const developmentProfileDirectoryName = 'CleanCode-Dev-Profiles'

interface RuntimeDataDirectoryPolicyInput {
  readonly appDataDirectory: string
  readonly currentUserDataDirectory: string
  readonly developmentApplicationDirectory: string
  readonly hasExplicitUserDataDirectory: boolean
  readonly isPackaged: boolean
  readonly platform: NodeJS.Platform
}

interface RuntimeDataDirectoryOperations {
  readonly ensureDirectory: (directory: string) => void
  readonly setElectronPath: (name: 'sessionData' | 'userData', directory: string) => void
}

export function resolveRuntimeDataDirectory(input: RuntimeDataDirectoryPolicyInput): string {
  if (!usesAutomaticDevelopmentProfile(input)) {
    return input.currentUserDataDirectory
  }

  const profileId = createDevelopmentProfileId(
    input.developmentApplicationDirectory,
    input.platform
  )
  return resolvePathApi(input.platform).join(
    input.appDataDirectory,
    developmentProfileDirectoryName,
    profileId
  )
}

export function configureRuntimeDataDirectories(
  input: RuntimeDataDirectoryPolicyInput,
  operations: RuntimeDataDirectoryOperations
): string {
  const runtimeDataDirectory = resolveRuntimeDataDirectory(input)
  if (!usesAutomaticDevelopmentProfile(input)) return runtimeDataDirectory

  operations.ensureDirectory(runtimeDataDirectory)
  operations.setElectronPath('userData', runtimeDataDirectory)
  operations.setElectronPath('sessionData', runtimeDataDirectory)
  return runtimeDataDirectory
}

function usesAutomaticDevelopmentProfile(input: RuntimeDataDirectoryPolicyInput): boolean {
  return !input.isPackaged && !input.hasExplicitUserDataDirectory
}

function createDevelopmentProfileId(
  applicationDirectory: string,
  platform: NodeJS.Platform
): string {
  const pathApi = resolvePathApi(platform)
  const normalizedDirectory = trimTrailingSeparators(
    pathApi.normalize(applicationDirectory),
    pathApi.parse(applicationDirectory).root,
    pathApi.sep
  )
  const canonicalIdentity =
    platform === 'win32' ? normalizedDirectory.toLowerCase() : normalizedDirectory

  return createHash('sha256').update(canonicalIdentity).digest('hex').slice(0, 24)
}

function resolvePathApi(platform: NodeJS.Platform): typeof posix | typeof win32 {
  return platform === 'win32' ? win32 : posix
}

function trimTrailingSeparators(path: string, root: string, separator: string): string {
  let result = path
  while (result.length > root.length && result.endsWith(separator)) {
    result = result.slice(0, -separator.length)
  }
  return result
}
