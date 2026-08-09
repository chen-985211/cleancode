import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveTerminalProviderRuntimeRootDirectory } from '../../../src/platform/electron-main/terminalProviderRuntimeImage'

describe('resolveTerminalProviderRuntimeRootDirectory', () => {
  let temporaryDirectory = ''

  afterEach(async () => {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { force: true, recursive: true })
      temporaryDirectory = ''
    }
  })

  it('isolates packaged Windows runtime images by stable Provider profile', () => {
    const first = resolveTerminalProviderRuntimeRootDirectory({
      localAppDataDirectory: 'C:\\Users\\dev\\AppData\\Local',
      platform: 'win32',
      providerStateDirectory: 'C:\\Users\\dev\\AppData\\Roaming\\CleanCode\\profile-a',
      userDataDirectory: 'C:\\Users\\dev\\AppData\\Roaming\\CleanCode'
    })
    const second = resolveTerminalProviderRuntimeRootDirectory({
      localAppDataDirectory: 'C:\\Users\\dev\\AppData\\Local',
      platform: 'win32',
      providerStateDirectory: 'C:\\Users\\dev\\AppData\\Roaming\\CleanCode\\profile-b',
      userDataDirectory: 'C:\\Users\\dev\\AppData\\Roaming\\CleanCode'
    })

    expect(first).toMatch(
      /^C:\\Users\\dev\\AppData\\Local\\CleanCode\\terminal-provider-host\\[a-f0-9]{24}$/
    )
    expect(second).not.toBe(first)
  })

  it('honors an isolated E2E override without adding a profile suffix', () => {
    expect(
      resolveTerminalProviderRuntimeRootDirectory({
        allowTestDirectory: true,
        localAppDataDirectory: 'C:\\Local',
        platform: 'win32',
        providerStateDirectory: 'C:\\Temp\\scenario-state\\terminal-runtime-provider',
        testDirectory: 'C:\\Temp\\scenario-state\\terminal-provider-host',
        testStateDirectory: 'C:\\Temp\\scenario-state',
        temporaryDirectory: 'C:\\Temp',
        userDataDirectory: 'C:\\user-data'
      })
    ).toBe('C:\\Temp\\scenario-state\\terminal-provider-host')
  })

  it('accepts an isolated E2E state reached through an operating-system path alias', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cc-runtime-root-alias-'))
    const physicalTemp = join(temporaryDirectory, 'physical-temp')
    const aliasedTemp = join(temporaryDirectory, 'aliased-temp')
    const physicalState = join(physicalTemp, 'scenario-state')
    await mkdir(physicalState, { recursive: true })
    await symlink(physicalTemp, aliasedTemp, 'dir')

    expect(
      resolveTerminalProviderRuntimeRootDirectory({
        allowTestDirectory: true,
        platform: 'darwin',
        providerStateDirectory: join(aliasedTemp, 'scenario-state', 'provider'),
        testDirectory: join(aliasedTemp, 'scenario-state', 'terminal-provider-host'),
        testStateDirectory: join(aliasedTemp, 'scenario-state'),
        temporaryDirectory: physicalTemp,
        userDataDirectory: join(aliasedTemp, 'scenario-state', 'user-data')
      })
    ).toBe(join(aliasedTemp, 'scenario-state', 'terminal-provider-host'))
  })

  it.each([
    {
      description: 'outside explicit E2E mode',
      override: { allowTestDirectory: false }
    },
    {
      description: 'outside the scenario state directory',
      override: { testDirectory: 'C:\\Users\\dev\\Documents' }
    },
    {
      description: 'under a state directory outside the system temp directory',
      override: {
        testDirectory: 'C:\\Users\\dev\\scenario-state\\terminal-provider-host',
        testStateDirectory: 'C:\\Users\\dev\\scenario-state'
      }
    }
  ])('rejects an E2E override $description', ({ override }) => {
    expect(() =>
      resolveTerminalProviderRuntimeRootDirectory({
        allowTestDirectory: true,
        localAppDataDirectory: 'C:\\Local',
        platform: 'win32',
        providerStateDirectory: 'C:\\Temp\\scenario-state\\terminal-runtime-provider',
        testDirectory: 'C:\\Temp\\scenario-state\\terminal-provider-host',
        testStateDirectory: 'C:\\Temp\\scenario-state',
        temporaryDirectory: 'C:\\Temp',
        userDataDirectory: 'C:\\user-data',
        ...override
      })
    ).toThrow('inside an isolated E2E state directory')
  })
})
