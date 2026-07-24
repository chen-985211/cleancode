import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { LaunchForegroundJobProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  acceptForegroundJobOutput,
  createForegroundJobProbe,
  createForegroundJobShellControl,
  createWindowsProcessArguments,
  disposeForegroundJobShellControl
} from '../../../../src/contexts/run/infrastructure/pty/ForegroundJobShellControl'
import { createWindowsForegroundJobInterruptInvocation } from '../../../../src/contexts/run/infrastructure/pty/WindowsForegroundJobInterrupt'

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
    expect(script).toContain('$cleancodeJobArguments = @(')
    expect(script).toContain('System.Diagnostics.ProcessStartInfo')
    expect(script).toContain("@('.cmd', '.bat') -notcontains $cleancodeJobExtension")
    expect(script).toContain("ChangeExtension($cleancodeJobCommand.Path, '.ps1')")
    expect(script).toContain('finally {')
    expect(script).toContain('CLEANCODE_JOB:fixedtoken:started')
    expect(script).toContain('CLEANCODE_JOB:fixedtoken:exit:')
    expect(script).toContain('& $cleancodeJobInvocation @cleancodeJobArguments')
    expect(script).toContain("[Environment]::SetEnvironmentVariable('CLEANCODE_SECRET'")
    expect(script).not.toContain(command.executable)
    expect(script).not.toContain(command.args[1])
    expect(script).not.toContain(command.environment.CLEANCODE_SECRET)

    disposeForegroundJobShellControl(control)
    expect(existsSync(control.scriptDirectory)).toBe(false)
  })

  it('creates one exact Windows native command line for nested quotes and trailing slashes', () => {
    const argument = String.raw`notify=["node","console.log(\"ok\")"]`

    expect(
      createWindowsProcessArguments(['plain', 'space value', '', argument, 'C:\\work\\'])
    ).toBe(
      [
        'plain',
        '"space value"',
        '""',
        String.raw`"notify=[\"node\",\"console.log(\\\"ok\\\")\"]"`,
        'C:\\work\\'
      ].join(' ')
    )
  })

  it('creates an injection-safe Windows child-tree interrupt command', () => {
    const scriptPath = String.raw`C:\Temp\launch'; Write-Output injected.ps1`
    const invocation = createWindowsForegroundJobInterruptInvocation(4321, scriptPath)
    const script = Buffer.from(invocation.args.at(-1)!, 'base64').toString('utf16le')

    expect(invocation.executable).toBe('powershell.exe')
    expect(invocation.args).toEqual(
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-EncodedCommand'])
    )
    expect(script).toContain('ParentProcessId = $cleancodeTerminalProcessId')
    expect(script).toContain('taskkill.exe /PID $cleancodeForegroundProcess.ProcessId /T /F')
    expect(script).not.toContain(scriptPath)
  })

  it('creates a POSIX supervisor that lets the interactive shell report the child exit', () => {
    const control = createForegroundJobShellControl(
      createCommand({
        args: ['--prompt', "quote ' argument"],
        environment: { CLEANCODE_TEST_VALUE: '中文 value' },
        executable: '/opt/Agent CLI/agent'
      }),
      {
        platform: 'linux',
        shellExecutable: '/bin/sh',
        temporaryRoot,
        token: 'fixedtoken'
      }
    )
    const script = readFileSync(control.scriptPath, 'utf8')
    const probe = createForegroundJobProbe(control)

    expect(probe).toContain(`'${control.scriptPath.replaceAll("'", "'\"'\"'")}'`)
    expect(probe).toContain('IFS= read -r cleancode_job_status')
    expect(probe).toContain('CLEANCODE_JOB:fixedtoken:exit:%s')
    expect(script).toContain("trap ':' INT")
    expect(script).toContain('CLEANCODE_JOB:fixedtoken:started')
    expect(script).toContain(`> '${control.statusPath?.replaceAll("'", "'\"'\"'")}'`)
    expect(script).toContain('exit 0')

    disposeForegroundJobShellControl(control)
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

  it('parses ConPTY-safe PowerShell OSC control frames across output chunks', () => {
    const onExit = vi.fn()
    const onStarted = vi.fn()
    const control = createForegroundJobShellControl(createCommand(), {
      platform: 'win32',
      shellExecutable: 'powershell.exe',
      temporaryRoot,
      token: 'fixedtoken'
    })
    const handlers = { onExit, onStarted }

    expect(
      acceptForegroundJobOutput(
        control,
        "PS> & 'powershell.exe' -File 'launch.ps1'\r\n\u001b]633;CLEANCODE_JOB:fixed",
        handlers
      )
    ).toBe('')
    expect(
      acceptForegroundJobOutput(
        control,
        'token:started\u0007Agent ready\r\n\u001b]633;CLEANCODE_JOB:fixedtoken:exit:7',
        handlers
      )
    ).toBe('Agent ready\r\n')
    expect(acceptForegroundJobOutput(control, '\u0007PS> ', handlers)).toBe('PS> ')
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
