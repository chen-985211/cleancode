import { posix } from 'node:path'

import { configureElectronRuntimeDataDirectories } from '../../../src/platform/electron-main/runtimeDataDirectoryBootstrap'

describe('runtime data directory bootstrap', () => {
  it('canonicalizes the application directory and configures the automatic development profile', () => {
    const calls: string[] = []
    const app = createElectronAppStub({
      calls,
      hasExplicitUserDataDirectory: false,
      isPackaged: false
    })

    const runtimeDataDirectory = configureElectronRuntimeDataDirectories(app, {
      canonicalizeDirectory: (directory) => {
        calls.push(`realpath:${directory}`)
        return '/canonical/worktrees/feature-a'
      },
      ensureDirectory: (directory) => calls.push(`mkdir:${directory}`),
      platform: 'linux'
    })

    expect(posix.dirname(runtimeDataDirectory)).toBe(
      posix.join('/application-data', 'CleanCode-Dev-Profiles')
    )
    expect(posix.basename(runtimeDataDirectory)).toMatch(/^[a-f0-9]{24}$/)
    expect(calls).toEqual([
      'realpath:/aliases/feature-a',
      `mkdir:${runtimeDataDirectory}`,
      `set:userData:${runtimeDataDirectory}`,
      `set:sessionData:${runtimeDataDirectory}`
    ])
  })

  it.each([
    {
      hasExplicitUserDataDirectory: false,
      isPackaged: true
    },
    {
      hasExplicitUserDataDirectory: true,
      isPackaged: false
    }
  ])(
    'preserves Electron defaults when packaged=$isPackaged and explicit=$hasExplicitUserDataDirectory',
    ({ hasExplicitUserDataDirectory, isPackaged }) => {
      const calls: string[] = []
      const app = createElectronAppStub({
        calls,
        hasExplicitUserDataDirectory,
        isPackaged
      })

      expect(
        configureElectronRuntimeDataDirectories(app, {
          canonicalizeDirectory: (directory) => {
            calls.push(`realpath:${directory}`)
            return directory
          },
          ensureDirectory: (directory) => calls.push(`mkdir:${directory}`),
          platform: 'linux'
        })
      ).toBe('/application-data/cleancode')
      expect(calls).toEqual([])
    }
  )
})

function createElectronAppStub(input: {
  readonly calls: string[]
  readonly hasExplicitUserDataDirectory: boolean
  readonly isPackaged: boolean
}) {
  return {
    commandLine: {
      hasSwitch: (name: string) => name === 'user-data-dir' && input.hasExplicitUserDataDirectory
    },
    getAppPath: () => '/aliases/feature-a',
    getPath: (name: 'appData' | 'userData') =>
      name === 'appData' ? '/application-data' : '/application-data/cleancode',
    isPackaged: input.isPackaged,
    setPath: (name: 'sessionData' | 'userData', directory: string) =>
      input.calls.push(`set:${name}:${directory}`)
  }
}
