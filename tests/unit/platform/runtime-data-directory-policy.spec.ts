import { posix, win32 } from 'node:path'

import {
  configureRuntimeDataDirectories,
  resolveRuntimeDataDirectory
} from '../../../src/platform/electron-main/runtimeDataDirectoryPolicy'

describe('runtime data directory policy', () => {
  it.each([
    {
      appDataDirectory: '/application-data',
      currentUserDataDirectory: '/application-data/CleanCode',
      developmentApplicationDirectory: '/worktrees/cleancode-main',
      hasExplicitUserDataDirectory: false,
      isPackaged: true,
      platform: 'linux' as const,
      expected: '/application-data/CleanCode'
    },
    {
      appDataDirectory: '/temporary-e2e',
      currentUserDataDirectory: '/temporary-e2e/electron-user-data',
      developmentApplicationDirectory: '/worktrees/cleancode-e2e',
      hasExplicitUserDataDirectory: true,
      isPackaged: false,
      platform: 'linux' as const,
      expected: '/temporary-e2e/electron-user-data'
    }
  ])(
    'resolves $expected when packaged=$isPackaged and explicit=$hasExplicitUserDataDirectory',
    (input) => {
      expect(resolveRuntimeDataDirectory(input)).toBe(input.expected)
    }
  )

  it.each([
    {
      firstDirectory: '/worktrees/cleancode-feature',
      secondDirectory: '/worktrees/cleancode-feature/',
      platform: 'linux' as const
    },
    {
      firstDirectory: String.raw`C:\Worktrees\CleanCode-Feature`,
      secondDirectory: 'c:/worktrees/cleancode-feature/',
      platform: 'win32' as const
    }
  ])(
    'reuses one development profile for equivalent $platform application directories',
    ({ firstDirectory, secondDirectory, platform }) => {
      expect(resolveDevelopmentDirectory(firstDirectory, platform)).toBe(
        resolveDevelopmentDirectory(secondDirectory, platform)
      )
    }
  )

  it.each([
    {
      appDataDirectory: '/application-data',
      firstApplicationDirectory: '/worktrees/feature-a',
      secondApplicationDirectory: '/worktrees/feature-b',
      pathApi: posix,
      platform: 'linux' as const
    },
    {
      appDataDirectory: String.raw`C:\ApplicationData`,
      firstApplicationDirectory: String.raw`C:\Worktrees\feature-a`,
      secondApplicationDirectory: String.raw`C:\Worktrees\feature-b`,
      pathApi: win32,
      platform: 'win32' as const
    }
  ])(
    'isolates different $platform development worktrees without exposing their paths',
    ({
      appDataDirectory,
      firstApplicationDirectory,
      pathApi,
      platform,
      secondApplicationDirectory
    }) => {
      const firstDirectory = resolveDevelopmentDirectory(
        firstApplicationDirectory,
        platform,
        appDataDirectory
      )
      const secondDirectory = resolveDevelopmentDirectory(
        secondApplicationDirectory,
        platform,
        appDataDirectory
      )
      const developmentProfilesDirectory = pathApi.join(appDataDirectory, 'CleanCode-Dev-Profiles')

      expect(firstDirectory).not.toBe(secondDirectory)
      expect(pathApi.dirname(firstDirectory)).toBe(developmentProfilesDirectory)
      expect(pathApi.dirname(secondDirectory)).toBe(developmentProfilesDirectory)
      expect(firstDirectory).not.toContain('feature-a')
      expect(secondDirectory).not.toContain('feature-b')
      expect(pathApi.basename(firstDirectory)).toMatch(/^[a-f0-9]{24}$/)
      expect(pathApi.basename(secondDirectory)).toMatch(/^[a-f0-9]{24}$/)
    }
  )

  it('creates and applies both Electron data paths for an automatic development profile', () => {
    const calls: string[] = []
    const runtimeDataDirectory = configureRuntimeDataDirectories(
      createDevelopmentPolicyInput('/worktrees/feature-a', 'linux'),
      {
        ensureDirectory: (directory) => calls.push(`mkdir:${directory}`),
        setElectronPath: (name, directory) => calls.push(`set:${name}:${directory}`)
      }
    )

    expect(calls).toEqual([
      `mkdir:${runtimeDataDirectory}`,
      `set:userData:${runtimeDataDirectory}`,
      `set:sessionData:${runtimeDataDirectory}`
    ])
  })

  it.each([
    {
      isPackaged: true,
      hasExplicitUserDataDirectory: false
    },
    {
      isPackaged: false,
      hasExplicitUserDataDirectory: true
    }
  ])(
    'does not rewrite Electron data paths when packaged=$isPackaged and explicit=$hasExplicitUserDataDirectory',
    ({ isPackaged, hasExplicitUserDataDirectory }) => {
      const calls: string[] = []
      const input = {
        ...createDevelopmentPolicyInput('/worktrees/feature-a', 'linux'),
        hasExplicitUserDataDirectory,
        isPackaged
      }

      expect(
        configureRuntimeDataDirectories(input, {
          ensureDirectory: (directory) => calls.push(`mkdir:${directory}`),
          setElectronPath: (name, directory) => calls.push(`set:${name}:${directory}`)
        })
      ).toBe(input.currentUserDataDirectory)
      expect(calls).toEqual([])
    }
  )
})

function resolveDevelopmentDirectory(
  developmentApplicationDirectory: string,
  platform: 'linux' | 'win32',
  appDataDirectory = '/application-data'
): string {
  return resolveRuntimeDataDirectory(
    createDevelopmentPolicyInput(developmentApplicationDirectory, platform, appDataDirectory)
  )
}

function createDevelopmentPolicyInput(
  developmentApplicationDirectory: string,
  platform: 'linux' | 'win32',
  appDataDirectory = '/application-data'
) {
  return {
    appDataDirectory,
    currentUserDataDirectory: '/application-data/cleancode',
    developmentApplicationDirectory,
    hasExplicitUserDataDirectory: false,
    isPackaged: false,
    platform
  }
}
