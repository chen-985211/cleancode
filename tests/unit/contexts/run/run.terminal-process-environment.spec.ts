import { createTerminalProcessEnvironment } from '../../../../src/contexts/run/infrastructure/pty/TerminalProcessEnvironment'

describe('terminal process environment', () => {
  it.each([
    {
      inherited: { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin' },
      explicit: undefined,
      platform: 'darwin' as const,
      expectedRunAsNode: undefined
    },
    {
      inherited: { electron_run_as_node: '1', Path: 'C:\\Windows' },
      explicit: undefined,
      platform: 'win32' as const,
      expectedRunAsNode: undefined
    },
    {
      inherited: { ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin' },
      explicit: { ELECTRON_RUN_AS_NODE: '1' },
      platform: 'linux' as const,
      expectedRunAsNode: '1'
    }
  ])(
    'removes only inherited Electron Node mode on $platform',
    ({ inherited, explicit, platform, expectedRunAsNode }) => {
      const environment = createTerminalProcessEnvironment({
        explicit,
        inherited,
        platform,
        terminalSourceTheme: 'dark'
      })

      const runAsNodeValues = Object.entries(environment)
        .filter(([name]) => name.toLowerCase() === 'electron_run_as_node')
        .map(([, value]) => value)
      expect(runAsNodeValues).toEqual(expectedRunAsNode === undefined ? [] : [expectedRunAsNode])
      expect(environment.PATH ?? environment.Path).toBeDefined()
      expect(environment.TERM).toBe('xterm-256color')
      expect(environment.TERM_PROGRAM).toBe('cleancode')
    }
  )
})
