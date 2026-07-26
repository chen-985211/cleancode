import { join } from 'node:path'

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

  it('isolates different development worktrees without exposing their paths', () => {
    const firstDirectory = resolveDevelopmentDirectory('/worktrees/feature-a', 'linux')
    const secondDirectory = resolveDevelopmentDirectory('/worktrees/feature-b', 'linux')
    const developmentProfilesDirectory = join('/application-data', 'CleanCode-Dev-Profiles')

    expect(firstDirectory).not.toBe(secondDirectory)
    expect(firstDirectory.startsWith(`${developmentProfilesDirectory}/`)).toBe(true)
    expect(secondDirectory.startsWith(`${developmentProfilesDirectory}/`)).toBe(true)
    expect(firstDirectory).not.toContain('feature-a')
    expect(secondDirectory).not.toContain('feature-b')
    expect(firstDirectory.slice(developmentProfilesDirectory.length + 1)).toMatch(/^[a-f0-9]{24}$/)
    expect(secondDirectory.slice(developmentProfilesDirectory.length + 1)).toMatch(/^[a-f0-9]{24}$/)
  })

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
  platform: 'linux' | 'win32'
): string {
  return resolveRuntimeDataDirectory(
    createDevelopmentPolicyInput(developmentApplicationDirectory, platform)
  )
}

function createDevelopmentPolicyInput(
  developmentApplicationDirectory: string,
  platform: 'linux' | 'win32'
) {
  return {
    appDataDirectory: '/application-data',
    currentUserDataDirectory: '/application-data/cleancode',
    developmentApplicationDirectory,
    hasExplicitUserDataDirectory: false,
    isPackaged: false,
    platform
  }
}
