import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { LaunchForegroundJobProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  acceptForegroundJobOutput,
  createForegroundJobProbe,
  createForegroundJobShellControl,
  disposeForegroundJobShellControl
} from '../../../../src/contexts/run/infrastructure/pty/ForegroundJobShellControl'

describe('foreground job shell control', () => {
  let temporaryRoot: string

  beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), "cleancode-foreground-'"))
  })

  afterEach(() => {
    rmSync(temporaryRoot, { force: true, recursive: true })
  })

  it('creates a PowerShell launch script that preserves argv boundaries and reports Ctrl+C exit', () => {
    const command = createCommand({
      args: ['--prompt', "quote ' ; Write-Output injected", '中文 argument'],
      environment: { CLEANCODE_SECRET: "secret ' value" },
      executable: String.raw`C:\Program Files\Agent CLI\agent.cmd`
    })

    const control = createForegroundJobShellControl(command, {
      platform: 'win32',
      shellExecutable: String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`,
      temporaryRoot,
      token: 'fixedtoken'
    })
    const script = readFileSync(control.scriptPath, 'utf8')
    const probe = createForegroundJobProbe(control)

    expect(control.scriptPath).toMatch(/launch\.ps1$/)
    expect(probe).toContain('-ExecutionPolicy Bypass')
    expect(probe).toContain("cleancode-foreground-''")
    expect(probe.endsWith('\r')).toBe(true)
    expect(script).toContain('$cleancodeJobExitCode = 130')
    expect(script).toContain('finally {')
    expect(script).toContain('CLEANCODE_JOB:fixedtoken:started')
    expect(script).toContain('CLEANCODE_JOB:fixedtoken:exit:')
    expect(script).toContain('& $cleancodeJobExecutable @cleancodeJobArguments')
    expect(script).toContain("[Environment]::SetEnvironmentVariable('CLEANCODE_SECRET'")
    expect(script).not.toContain(command.executable)
    expect(script).not.toContain(command.args[1])
    expect(script).not.toContain(command.environment.CLEANCODE_SECRET)

    disposeForegroundJobShellControl(control)
    expect(existsSync(control.scriptDirectory)).toBe(false)
  })

  it('rejects Windows foreground jobs for shells that cannot run PowerShell scripts', () => {
    expect(() =>
      createForegroundJobShellControl(createCommand(), {
        platform: 'win32',
        shellExecutable: 'cmd.exe',
        temporaryRoot,
        token: 'fixedtoken'
      })
    ).toThrow('PowerShell')
  })

  it('does not leave a temporary directory when command validation fails', () => {
    expect(() =>
      createForegroundJobShellControl(createCommand({ environment: { 'INVALID-NAME': 'value' } }), {
        platform: 'win32',
        shellExecutable: 'powershell.exe',
        temporaryRoot,
        token: 'fixedtoken'
      })
    ).toThrow('Invalid environment name')

    expect(readdirSync(temporaryRoot)).toEqual([])
  })

  it('hides shell transport output until the Agent process reports started', () => {
    const onExit = vi.fn()
    const onStarted = vi.fn()
    const control = createForegroundJobShellControl(createCommand(), {
      platform: 'darwin',
      shellExecutable: '/bin/zsh',
      temporaryRoot,
      token: 'fixedtoken'
    })
    const handlers = { onExit, onStarted }

    expect(
      acceptForegroundJobOutput(
        control,
        "prompt % '/tmp/cleancode-agent-job/launch.sh'; cleancode_job_status=$?\r\n",
        handlers
      )
    ).toBe('')
    expect(acceptForegroundJobOutput(control, '\x1eCLEANCODE_JOB:fixedtoken:star', handlers)).toBe(
      ''
    )
    expect(acceptForegroundJobOutput(control, 'ted\x1fCodex ready\r\n', handlers)).toBe(
      'Codex ready\r\n'
    )
    expect(
      acceptForegroundJobOutput(
        control,
        'Agent output\r\n\x1eCLEANCODE_JOB:fixedtoken:exit:7\x1fprompt % ',
        handlers
      )
    ).toBe('Agent output\r\nprompt % ')
    expect(onStarted).toHaveBeenCalledWith(control.command)
    expect(onExit).toHaveBeenCalledWith({ ...control.command, exitCode: 7 })

    disposeForegroundJobShellControl(control)
  })
})

function createCommand(
  overrides: Partial<LaunchForegroundJobProcessCommand> = {}
): LaunchForegroundJobProcessCommand {
  return {
    args: [],
    environment: {},
    executable: 'agent-cli',
    generation: 1,
    launchId: 'launch-1',
    onExit: () => undefined,
    onStarted: () => undefined,
    sessionId: 'session-1',
    ...overrides
  }
}
