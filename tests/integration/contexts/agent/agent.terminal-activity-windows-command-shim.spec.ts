import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import { TerminalAgentTelemetryAssetStore } from '../../../../src/contexts/agent/infrastructure/terminal-activity/TerminalAgentTelemetryAssetStore'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string

const windowsCommandCases = [{ extension: '.cmd' }, { extension: '.bat' }] as const

describe('ordinary terminal Windows command Agent activity integration', () => {
  it.each(windowsCommandCases)(
    'prepares an npm-style Provider at a real $extension command path',
    async ({ extension }) => {
      const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-windows-command-'))
      const providerDirectory = join(root, 'provider bin')
      const stateDirectory = join(root, 'state')
      const planPath = join(root, 'launch-plan.json')
      const platformPreloadPath = join(root, 'force-win32.cjs')
      const providerArgs = ['--profile', 'test profile']
      await Promise.all([mkdir(providerDirectory), mkdir(stateDirectory)])

      try {
        await Promise.all([
          writeFile(join(providerDirectory, `opencode${extension}`), '@echo off\r\n'),
          writeFile(platformPreloadPath, forceWindowsPlatformScript),
          writeFile(
            planPath,
            JSON.stringify({
              arguments: providerArgs,
              commandName: 'opencode',
              providerId: 'opencode'
            })
          )
        ])

        const store = new TerminalAgentTelemetryAssetStore({
          platform: 'win32',
          runtimeExecutable: process.execPath,
          stateDirectory
        })
        const assets = await store.ensure()
        const launcherPath = join(dirname(assets.launchSpecsPath), 'shim-launcher.mjs')
        const environment = createLauncherEnvironment({
          assetsShimDirectory: assets.shimDirectory,
          extension,
          providerDirectory
        })
        const launcherArgs = [
          ...(process.platform === 'win32' ? [] : ['--require', platformPreloadPath]),
          launcherPath,
          '--prepare-windows',
          planPath
        ]

        const result = await execute(process.execPath, launcherArgs, environment)

        expect(result.stderr).toBe('')
        expect(result).toMatchObject({ exitCode: 0, signal: null })
        expect(JSON.parse(await readFile(planPath, 'utf8'))).toMatchObject({
          arguments: providerArgs,
          environment: {
            CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID: expect.any(String),
            CLEANCODE_AGENT_ACTIVITY_PROVIDER_ID: 'opencode',
            OPENCODE_CONFIG_CONTENT: expect.stringContaining('opencode-plugin.mjs')
          },
          executable: join(providerDirectory, `opencode${extension}`),
          invocationId: expect.any(String),
          providerId: 'opencode',
          temporaryDirectory: null
        })
      } finally {
        await rm(root, { force: true, recursive: true })
      }
    },
    15_000
  )
})

describe.runIf(process.platform === 'win32')(
  'ordinary terminal Windows Agent activity ConPTY integration',
  () => {
    it('keeps the shell as terminal owner while launching an npm-style Provider', async () => {
      const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-windows-conpty-'))
      const providerDirectory = join(root, 'provider bin')
      const stateDirectory = join(root, 'state')
      const providerProgramPath = join(root, 'interactive-provider.cjs')
      await Promise.all([mkdir(providerDirectory), mkdir(stateDirectory)])
      await Promise.all([
        writeFile(join(providerDirectory, 'codex.cmd'), windowsInteractiveProviderCommandScript),
        writeFile(join(providerDirectory, 'codex.ps1'), windowsInteractiveProviderPowerShellScript),
        writeFile(providerProgramPath, interactiveProviderProgramScript)
      ])

      const store = new TerminalAgentTelemetryAssetStore({
        platform: 'win32',
        runtimeExecutable: electronExecutable,
        stateDirectory
      })
      const assets = await store.ensure()
      const environment = createConptyEnvironment({
        assetsShimDirectory: assets.shimDirectory,
        providerDirectory,
        providerProgramPath
      })
      const completionToken = 'shell-owner'
      const promptMarker = `CLEANCODE_TEST_PROMPT:${completionToken}`
      environment.CLEANCODE_TEST_COMPLETION_TOKEN = completionToken
      let output = ''
      let exited = false
      const shell = spawnPtyProcess('powershell.exe', ['-NoLogo', '-NoProfile'], {
        cols: 100,
        cwd: root,
        env: environment,
        name: 'xterm-256color',
        rows: 30,
        useConpty: true,
        useConptyDll: true
      })
      shell.onData((data) => {
        output += data
      })
      shell.onExit(() => {
        exited = true
      })

      try {
        shell.write(windowsPowerShellReadinessCommand)
        await waitUntil(
          () => includesInOrder(output, `CLEANCODE_SHELL_READY:${completionToken}`, promptMarker),
          windowsPowerShellStartupTimeoutMs,
          () => ({ output: outputTail(output) })
        )
        shell.write(
          '$resolved = Get-Command codex; Write-Output ("CLEANCODE_RESOLVED:" + $resolved.CommandType + "|" + $resolved.Source); codex --profile "test profile"; $cleancodeProviderExit = $LASTEXITCODE; Write-Output ("CLEANCODE_WRAPPER_EXIT:" + $cleancodeProviderExit); Write-Output ("CLEANCODE_WRAPPER_DONE:" + $env:CLEANCODE_TEST_COMPLETION_TOKEN)\r'
        )
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_ENV:'), 20_000).catch(() => {
          throw new Error(
            `Provider did not start. ConPTY output: ${JSON.stringify(outputTail(output))}`
          )
        })
        expect(output).toContain('CLEANCODE_PROVIDER_TTY:true|true|true')
        expect(output).toContain('CLEANCODE_PROVIDER_ARGS:["--profile","test profile"')
        expect(output).toContain('CLEANCODE_PROVIDER_ENV:false|true')
        expect(output).toContain('provider bin\\codex.ps1|True')

        const wrapperCompletionStart = output.length
        const wrapperCompletionOutput = () => output.slice(wrapperCompletionStart)
        shell.write('interactive input\r')
        await waitUntil(
          () => output.includes('CLEANCODE_PROVIDER_INPUT:interactive input'),
          10_000,
          () => ({ output: outputTail(output) })
        )
        await waitUntil(
          () =>
            includesInOrder(
              wrapperCompletionOutput(),
              `CLEANCODE_WRAPPER_DONE:${completionToken}`,
              promptMarker
            ),
          10_000,
          () => ({ output: outputTail(wrapperCompletionOutput()) })
        )
        expect(wrapperCompletionOutput()).toContain('CLEANCODE_WRAPPER_EXIT:0')

        const followUpStart = output.length
        const followUpOutput = () => output.slice(followUpStart)
        shell.write(
          'Write-Output ("CLEANCODE_PROVIDER_EXIT:" + $LASTEXITCODE); Write-Output ("CLEANCODE_SHELL_STILL_WRITABLE:" + $env:ELECTRON_NO_ATTACH_CONSOLE); Write-Output ("CLEANCODE_FOLLOW_UP_DONE:" + $env:CLEANCODE_TEST_COMPLETION_TOKEN)\r'
        )
        await waitUntil(
          () =>
            includesInOrder(
              followUpOutput(),
              `CLEANCODE_FOLLOW_UP_DONE:${completionToken}`,
              promptMarker
            ),
          10_000,
          () => ({ output: outputTail(followUpOutput()) })
        )
        expect(followUpOutput()).toContain('CLEANCODE_PROVIDER_EXIT:0')
        expect(followUpOutput()).toContain('CLEANCODE_SHELL_STILL_WRITABLE:1')

        const signalOutputStart = output.length
        const signalOutput = () => output.slice(signalOutputStart)
        shell.write("$env:CLEANCODE_TEST_PROVIDER_MODE = 'signal'; codex\r")
        await waitUntil(
          () => signalOutput().includes('CLEANCODE_PROVIDER_SIGNAL_READY'),
          10_000,
          () => ({ output: outputTail(signalOutput()) })
        )
        shell.write('\x03')
        await waitUntil(
          () => signalOutput().includes('CLEANCODE_PROVIDER_SIGNAL:SIGINT'),
          10_000,
          () => ({ output: outputTail(signalOutput()) })
        )
        await waitUntil(
          () => includesInOrder(signalOutput(), 'CLEANCODE_PROVIDER_SIGNAL:SIGINT', promptMarker),
          10_000,
          () => ({ output: outputTail(signalOutput()) })
        )

        const signalInspectionStart = output.length
        const signalInspectionOutput = () => output.slice(signalInspectionStart)
        shell.write(
          '$cleancodeProviderExit = $LASTEXITCODE; Write-Output ("CLEANCODE_PROVIDER_SIGNAL_EXIT:" + $cleancodeProviderExit); Write-Output ("CLEANCODE_SHELL_WRITABLE_AFTER_SIGINT:" + $cleancodeProviderExit); Write-Output ("CLEANCODE_SIGNAL_INSPECTION_DONE:" + $env:CLEANCODE_TEST_COMPLETION_TOKEN)\r'
        )
        await waitUntil(
          () =>
            includesInOrder(
              signalInspectionOutput(),
              `CLEANCODE_SIGNAL_INSPECTION_DONE:${completionToken}`,
              promptMarker
            ),
          10_000,
          () => ({ output: outputTail(signalInspectionOutput()) })
        )
        expect(signalInspectionOutput()).toContain('CLEANCODE_PROVIDER_SIGNAL_EXIT:130')
        expect(signalInspectionOutput()).toContain('CLEANCODE_SHELL_WRITABLE_AFTER_SIGINT:130')
        expect(signalOutput()).not.toContain('Terminate batch job')
      } finally {
        if (!exited) {
          shell.kill()
          await waitUntil(() => exited, 5_000).catch(() => undefined)
        }
        await rm(root, { force: true, recursive: true })
      }
    }, 60_000)

    it.each([
      {
        expectedBackground: 'White',
        expectedForeground: 'Black',
        terminalSourceTheme: 'light' as const
      },
      {
        expectedBackground: 'Black',
        expectedForeground: 'Gray',
        terminalSourceTheme: 'dark' as const
      }
    ])(
      'bridges $terminalSourceTheme console colors only around each Codex invocation',
      async ({ expectedBackground, expectedForeground, terminalSourceTheme }) => {
        const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-windows-console-theme-'))
        const providerDirectory = join(root, 'provider bin')
        const stateDirectory = join(root, 'state')
        const providerProgramPath = join(root, 'interactive-provider.cjs')
        const sessionId = `windows-console-theme-${terminalSourceTheme}`
        const token = `0123456789abcdef0123456789abcdef0123456789abcde${terminalSourceTheme === 'light' ? 'f' : '0'}`
        await Promise.all([mkdir(providerDirectory), mkdir(stateDirectory)])
        await Promise.all([
          writeFile(join(providerDirectory, 'codex.cmd'), windowsInteractiveProviderCommandScript),
          writeFile(
            join(providerDirectory, 'codex.ps1'),
            windowsInteractiveProviderPowerShellScript
          ),
          writeFile(providerProgramPath, interactiveProviderProgramScript)
        ])

        const store = new TerminalAgentTelemetryAssetStore({
          platform: 'win32',
          runtimeExecutable: electronExecutable,
          stateDirectory
        })
        const assets = await store.ensure()
        const environment = createConptyEnvironment({
          assetsShimDirectory: assets.shimDirectory,
          providerDirectory,
          providerProgramPath
        })
        const completionToken = `console-theme-${terminalSourceTheme}`
        const promptMarker = `CLEANCODE_TEST_PROMPT:${completionToken}`
        environment.CLEANCODE_TEST_COMPLETION_TOKEN = completionToken
        let output = ''
        let rawOutput = ''
        const adapter = new NodePtyTerminalProcessAdapter({
          runtimePlatform: 'win32',
          spawnPty: (executable, args, options) => {
            const process = spawnPtyProcess(executable, args, options)
            process.onData((data) => {
              rawOutput += data
            })
            return process
          }
        })

        try {
          await adapter.start({
            columns: 100,
            environment,
            onExit: () => undefined,
            onOutput: (event) => {
              output += event.data
            },
            privateOutputControl: {
              environment: {
                CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN: token,
                CLEANCODE_TERMINAL_SOURCE_THEME: terminalSourceTheme
              },
              protocol: 'osc-633-span-v1',
              token
            },
            rows: 30,
            scope: windowsBlockRunScope(sessionId, root),
            shell: 'powershell.exe',
            terminalSourceTheme,
            workingDirectory: root
          })

          adapter.write(sessionId, windowsPowerShellReadinessCommand)
          await waitUntil(
            () => includesInOrder(output, `CLEANCODE_SHELL_READY:${completionToken}`, promptMarker),
            windowsPowerShellStartupTimeoutMs,
            () => ({ output: outputTail(output), rawOutput: outputTail(rawOutput) })
          )

          const setupOutputStart = output.length
          const setupOutput = () => output.slice(setupOutputStart)
          adapter.write(
            sessionId,
            [
              "$env:CLEANCODE_TEST_PROVIDER_MODE = 'nonzero'",
              "Write-Output ('CLEANCODE_OUTER_COLORS_BEFORE:{0}|{1}' -f [Console]::ForegroundColor, [Console]::BackgroundColor)",
              "Write-Output ('CLEANCODE_NONZERO_SETUP_DONE:' + $env:CLEANCODE_TEST_COMPLETION_TOKEN)"
            ].join('; ') + '\r'
          )
          await waitUntil(
            () =>
              includesInOrder(
                setupOutput(),
                `CLEANCODE_NONZERO_SETUP_DONE:${completionToken}`,
                promptMarker
              ),
            10_000,
            () => ({ output: outputTail(setupOutput()), rawOutput: outputTail(rawOutput) })
          )

          const nonzeroInvocationStart = output.length
          const nonzeroInvocationOutput = () => output.slice(nonzeroInvocationStart)
          adapter.write(
            sessionId,
            [
              'codex',
              '$cleancodeProviderExit = $LASTEXITCODE',
              "Write-Output ('CLEANCODE_PROVIDER_NONZERO_EXIT:' + $cleancodeProviderExit)",
              "Write-Output ('CLEANCODE_NONZERO_INVOCATION_DONE:' + $env:CLEANCODE_TEST_COMPLETION_TOKEN)"
            ].join('; ') + '\r'
          )
          await waitUntil(
            () =>
              includesInOrder(
                nonzeroInvocationOutput(),
                `CLEANCODE_NONZERO_INVOCATION_DONE:${completionToken}`,
                promptMarker
              ),
            20_000,
            () => ({
              output: outputTail(nonzeroInvocationOutput()),
              rawOutput: outputTail(rawOutput)
            })
          )

          const nonzeroInspectionStart = output.length
          const nonzeroInspectionOutput = () => output.slice(nonzeroInspectionStart)
          adapter.write(
            sessionId,
            [
              "Write-Output ('CLEANCODE_OUTER_COLORS_AFTER:{0}|{1}' -f [Console]::ForegroundColor, [Console]::BackgroundColor)",
              "Write-Output ('CLEANCODE_NONZERO_INSPECTION_DONE:' + $env:CLEANCODE_TEST_COMPLETION_TOKEN)"
            ].join('; ') + '\r'
          )
          await waitUntil(
            () =>
              includesInOrder(
                nonzeroInspectionOutput(),
                `CLEANCODE_NONZERO_INSPECTION_DONE:${completionToken}`,
                promptMarker
              ),
            10_000,
            () => ({
              output: outputTail(nonzeroInspectionOutput()),
              rawOutput: outputTail(rawOutput)
            })
          )

          expect(nonzeroInvocationOutput()).toContain(
            `CLEANCODE_PROVIDER_CONSOLE_COLORS:${expectedForeground}|${expectedBackground}`
          )
          expect(nonzeroInvocationOutput()).toContain(
            'CLEANCODE_PROVIDER_PRIVATE_CONTROL_ENV:False|False'
          )
          expect(nonzeroInvocationOutput()).toContain('CLEANCODE_PROVIDER_NONZERO_EXIT:23')
          expect(nonzeroInvocationOutput()).toContain(
            '\x1b[38;2;12;34;56mCLEANCODE_PROVIDER_TRUECOLOR\r\n\x1b[0m'
          )
          expect(readColorPair(output, 'CLEANCODE_OUTER_COLORS_AFTER')).toEqual(
            readColorPair(output, 'CLEANCODE_OUTER_COLORS_BEFORE')
          )

          const signalSetupStart = output.length
          const signalSetupOutput = () => output.slice(signalSetupStart)
          adapter.write(
            sessionId,
            "$env:CLEANCODE_TEST_PROVIDER_MODE = 'signal'; Write-Output ('CLEANCODE_SIGNAL_SETUP_DONE:' + $env:CLEANCODE_TEST_COMPLETION_TOKEN)\r"
          )
          await waitUntil(
            () =>
              includesInOrder(
                signalSetupOutput(),
                `CLEANCODE_SIGNAL_SETUP_DONE:${completionToken}`,
                promptMarker
              ),
            10_000,
            () => ({ output: outputTail(signalSetupOutput()), rawOutput: outputTail(rawOutput) })
          )

          const signalOutputStart = output.length
          const signalOutput = () => output.slice(signalOutputStart)
          adapter.write(sessionId, 'codex\r')
          await waitUntil(
            () => signalOutput().includes('CLEANCODE_PROVIDER_SIGNAL_READY'),
            10_000,
            () => ({ output: outputTail(signalOutput()), rawOutput: outputTail(rawOutput) })
          )
          adapter.write(sessionId, '\x03')
          await waitUntil(
            () => signalOutput().includes('CLEANCODE_PROVIDER_SIGNAL:SIGINT'),
            10_000,
            () => ({ output: outputTail(signalOutput()), rawOutput: outputTail(rawOutput) })
          )
          await waitUntil(
            () => includesInOrder(signalOutput(), 'CLEANCODE_PROVIDER_SIGNAL:SIGINT', promptMarker),
            10_000,
            () => ({ output: outputTail(signalOutput()), rawOutput: outputTail(rawOutput) })
          )

          const signalInspectionStart = output.length
          const signalInspectionOutput = () => output.slice(signalInspectionStart)
          adapter.write(
            sessionId,
            [
              '$cleancodeProviderExit = $LASTEXITCODE',
              "Write-Output ('CLEANCODE_PROVIDER_SIGNAL_EXIT:' + $cleancodeProviderExit)",
              "Write-Output ('CLEANCODE_OUTER_COLORS_AFTER_SIGNAL:{0}|{1}' -f [Console]::ForegroundColor, [Console]::BackgroundColor)",
              "Write-Output ('CLEANCODE_OUTER_PRIVATE_CONTROL_ENV:{0}|{1}' -f [bool]$env:CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN, [bool]$env:CLEANCODE_TERMINAL_SOURCE_THEME)",
              "Write-Output ('CLEANCODE_SIGNAL_INSPECTION_DONE:' + $env:CLEANCODE_TEST_COMPLETION_TOKEN)"
            ].join('; ') + '\r'
          )
          await waitUntil(
            () =>
              includesInOrder(
                signalInspectionOutput(),
                `CLEANCODE_SIGNAL_INSPECTION_DONE:${completionToken}`,
                promptMarker
              ),
            10_000,
            () => ({
              output: outputTail(signalInspectionOutput()),
              rawOutput: outputTail(rawOutput)
            })
          )

          expect(signalOutput()).toContain(
            `CLEANCODE_PROVIDER_CONSOLE_COLORS:${expectedForeground}|${expectedBackground}`
          )
          expect(signalInspectionOutput()).toContain('CLEANCODE_PROVIDER_SIGNAL_EXIT:130')
          expect(signalInspectionOutput()).toContain(
            'CLEANCODE_OUTER_PRIVATE_CONTROL_ENV:True|True'
          )
          expect(readColorPair(output, 'CLEANCODE_OUTER_COLORS_AFTER_SIGNAL')).toEqual(
            readColorPair(output, 'CLEANCODE_OUTER_COLORS_BEFORE')
          )
          expect(readOutputControlPhases(rawOutput, token)).toEqual([
            'begin',
            'end',
            'begin',
            'end',
            'begin',
            'end',
            'begin',
            'end'
          ])
          expect(output).not.toContain('CLEANCODE_OUTPUT_CONTROL:')
        } finally {
          await adapter.disposeAll()
          await rm(root, { force: true, recursive: true })
        }
      },
      90_000
    )
  }
)

const windowsPowerShellReadinessCommand =
  "function global:prompt { [Console]::WriteLine(('CLEANCODE_TEST_PROMPT:' + $env:CLEANCODE_TEST_COMPLETION_TOKEN)); return ('PS ' + $PWD.Path + '> ') }; Write-Output ('CLEANCODE_SHELL_READY:' + $env:CLEANCODE_TEST_COMPLETION_TOKEN)\r"
const windowsPowerShellStartupTimeoutMs = 30_000

const windowsInteractiveProviderCommandScript = [
  '@echo off',
  '"%CLEANCODE_TEST_NODE%" "%CLEANCODE_TEST_PROVIDER_PROGRAM%" %*',
  'exit /b %ERRORLEVEL%',
  ''
].join('\r\n')

const windowsInteractiveProviderPowerShellScript = [
  "[Console]::WriteLine(('CLEANCODE_PROVIDER_CONSOLE_COLORS:{0}|{1}' -f [Console]::ForegroundColor, [Console]::BackgroundColor))",
  "[Console]::WriteLine(('CLEANCODE_PROVIDER_PRIVATE_CONTROL_ENV:{0}|{1}' -f [bool]$env:CLEANCODE_TERMINAL_OUTPUT_CONTROL_TOKEN, [bool]$env:CLEANCODE_TERMINAL_SOURCE_THEME))",
  '[Console]::Write(([char]27) + \'[38;2;12;34;56mCLEANCODE_PROVIDER_TRUECOLOR\' + "`r`n")',
  "if ($env:CLEANCODE_TEST_PROVIDER_MODE -eq 'nonzero') { exit 23 }",
  '& $env:CLEANCODE_TEST_NODE $env:CLEANCODE_TEST_PROVIDER_PROGRAM @args',
  'exit $LASTEXITCODE',
  ''
].join('\r\n')

const interactiveProviderProgramScript = `
const tty = [process.stdin, process.stdout, process.stderr].map((stream) => Boolean(stream.isTTY))
process.stdout.write('CLEANCODE_PROVIDER_TTY:' + tty.join('|') + '\\r\\n')
process.stdout.write('CLEANCODE_PROVIDER_ARGS:' + JSON.stringify(process.argv.slice(2)) + '\\r\\n')
process.stdout.write('CLEANCODE_PROVIDER_ENV:' + Boolean(process.env.ELECTRON_RUN_AS_NODE) + '|' + Boolean(process.env.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID) + '\\r\\n')
if (!tty.every(Boolean)) process.exit(86)
if (process.env.CLEANCODE_TEST_PROVIDER_MODE === 'signal') {
  process.on('SIGINT', () => {
    process.stdout.write('CLEANCODE_PROVIDER_SIGNAL:SIGINT\\r\\n')
    process.exit(130)
  })
  process.stdout.write('CLEANCODE_PROVIDER_SIGNAL_READY\\r\\n')
  setInterval(() => {}, 1_000)
} else {
  process.stdin.setEncoding('utf8')
  process.stdin.once('data', (input) => {
    process.stdout.write('CLEANCODE_PROVIDER_INPUT:' + input.trim() + '\\r\\n')
    process.exit(0)
  })
  setTimeout(() => process.exit(87), 15_000)
}
`.trimStart()

const forceWindowsPlatformScript = `
const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
if (!descriptor?.configurable) throw new Error('Expected process.platform to be configurable')
Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' })
`.trimStart()

function createLauncherEnvironment(input: {
  readonly assetsShimDirectory: string
  readonly extension: '.bat' | '.cmd'
  readonly providerDirectory: string
}): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  const replacedKeys = new Set([
    'electron_run_as_node',
    'opencode_config_content',
    'path',
    'pathext'
  ])
  for (const key of Object.keys(environment)) {
    if (replacedKeys.has(key.toLowerCase())) delete environment[key]
  }
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: '1',
    PATH: [input.assetsShimDirectory, input.providerDirectory, process.env.PATH]
      .filter(Boolean)
      .join(delimiter),
    PATHEXT: input.extension.toUpperCase()
  }
}

function createConptyEnvironment(input: {
  readonly assetsShimDirectory: string
  readonly providerDirectory: string
  readonly providerProgramPath: string
}): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string'
    })
  )
  const replacedKeys = new Set([
    'electron_no_attach_console',
    'electron_run_as_node',
    'path',
    'pathext'
  ])
  for (const key of Object.keys(environment)) {
    if (replacedKeys.has(key.toLowerCase())) delete environment[key]
  }
  return {
    ...environment,
    CLEANCODE_AGENT_ACTIVITY_TRACE: '1',
    CLEANCODE_TEST_NODE: process.execPath,
    CLEANCODE_TEST_PROVIDER_PROGRAM: input.providerProgramPath,
    ELECTRON_NO_ATTACH_CONSOLE: '1',
    PATH: [input.assetsShimDirectory, input.providerDirectory, process.env.PATH]
      .filter(Boolean)
      .join(delimiter),
    PATHEXT: '.COM;.EXE;.BAT;.CMD'
  }
}

function windowsBlockRunScope(sessionId: string, directory: string) {
  return {
    blockId: 'terminal-block-1',
    generation: 1,
    gitBranch: 'main',
    owner: { id: 'terminal-block-1', kind: 'block' as const },
    projectDirectory: directory,
    projectId: 'project-1',
    runId: `${sessionId}-run`,
    sessionId,
    workspaceDirectory: directory,
    workspaceId: 'main'
  }
}

function readColorPair(output: string, marker: string): readonly [string, string] {
  const match = output.match(new RegExp(`${marker}:([A-Za-z]+)\\|([A-Za-z]+)`))
  if (!match?.[1] || !match[2]) {
    throw new Error(`Missing ${marker} in ConPTY output: ${JSON.stringify(output)}`)
  }
  return [match[1], match[2]]
}

function readOutputControlPhases(output: string, token: string): string[] {
  const prefix = `\x1b]633;CLEANCODE_OUTPUT_CONTROL:${token}:`
  return output
    .split(prefix)
    .slice(1)
    .flatMap((suffix) => {
      if (suffix.startsWith('begin\x07')) return ['begin']
      if (suffix.startsWith('end\x07')) return ['end']
      return []
    })
}

function outputTail(output: string): string {
  return output.slice(-16_384)
}

function includesInOrder(output: string, first: string, second: string): boolean {
  const firstIndex = output.indexOf(first)
  return firstIndex >= 0 && output.indexOf(second, firstIndex + first.length) >= 0
}

function execute(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv
): Promise<{
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stderr: string
  readonly stdout: string
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env: environment,
      killSignal: 'SIGTERM',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000
    })
    let stderr = ''
    let stdout = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.once('error', reject)
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, stderr, stdout }))
  })
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  diagnostic?: () => unknown
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) {
      const details = diagnostic ? ` Details: ${JSON.stringify(diagnostic())}` : ''
      throw new Error(`Timed out waiting for Windows Agent ConPTY output.${details}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
