import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  decorateTerminalShellIntegration,
  installTerminalShellIntegration
} from '../../../../src/contexts/run/infrastructure/pty/TerminalShellIntegration'

describe('terminal shell integration', () => {
  let rootDirectory = ''

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-shell-integration-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('installs process-scoped startup fragments without replacing user startup files', async () => {
    const files = await installTerminalShellIntegration(rootDirectory)

    expect(await readFile(join(files.zshDotDirectory, '.zshrc'), 'utf8')).toContain(
      '$CLEANCODE_USER_ZDOTDIR/.zshrc'
    )
    expect(await readFile(files.bashInitFile, 'utf8')).toContain('source "$HOME/.bashrc"')
    expect(await readFile(files.fishInitFile, 'utf8')).toContain(
      'function __cleancode_report_cwd --on-event fish_prompt'
    )
    await expectOsc7Reporter(join(files.zshDotDirectory, '.zshrc'))
    await expectOsc7Reporter(files.bashInitFile)
    await expectOsc7Reporter(files.fishInitFile)
  })

  it.each([
    {
      shell: '/bin/zsh',
      expectedArguments: [] as readonly string[],
      expectedEnvironment: { ZDOTDIR: '/state/zsh', CLEANCODE_USER_ZDOTDIR: '/users/me/zsh' }
    },
    {
      shell: '/bin/bash',
      expectedArguments: ['--init-file', '/state/bash.sh'],
      expectedEnvironment: {}
    },
    {
      shell: '/opt/homebrew/bin/fish',
      expectedArguments: ['--init-command', "source '/state/fish.fish'"],
      expectedEnvironment: {}
    }
  ])(
    'decorates only the launched $shell process',
    ({ shell, expectedArguments, expectedEnvironment }) => {
      const decoration = decorateTerminalShellIntegration({
        environment: { HOME: '/users/me', ZDOTDIR: '/users/me/zsh' },
        files: {
          bashInitFile: '/state/bash.sh',
          fishInitFile: '/state/fish.fish',
          zshDotDirectory: '/state/zsh'
        },
        hasLaunchCommand: false,
        launchMode: 'command',
        platform: 'darwin',
        shell
      })

      expect(decoration).toEqual({
        environment: expectedEnvironment,
        interactiveShellArguments: expectedArguments
      })
    }
  )

  it('leaves finite commands and unsupported shells unchanged', () => {
    const files = {
      bashInitFile: '/state/bash.sh',
      fishInitFile: '/state/fish.fish',
      zshDotDirectory: '/state/zsh'
    }

    expect(
      decorateTerminalShellIntegration({
        environment: { HOME: '/users/me' },
        files,
        hasLaunchCommand: true,
        launchMode: 'command',
        platform: 'linux',
        shell: '/bin/bash'
      })
    ).toEqual({ environment: {}, interactiveShellArguments: [] })
    expect(
      decorateTerminalShellIntegration({
        environment: { HOME: '/users/me' },
        files,
        hasLaunchCommand: false,
        launchMode: 'command',
        platform: 'linux',
        shell: '/bin/sh'
      })
    ).toEqual({ environment: {}, interactiveShellArguments: [] })
  })
})

async function expectOsc7Reporter(path: string): Promise<void> {
  expect(await readFile(path, 'utf8')).toContain(']7;file://localhost')
}
