import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import { TerminalAgentTelemetryAssetStore } from '../../../../src/contexts/agent/infrastructure/terminal-activity/TerminalAgentTelemetryAssetStore'

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
      const platformPreloadPath = join(root, 'force-win32.cjs')
      const providerArgs = ['--profile', 'test profile']
      await Promise.all([mkdir(providerDirectory), mkdir(stateDirectory)])

      try {
        await Promise.all([
          writeFile(join(providerDirectory, `opencode${extension}`), '@echo off\r\n'),
          writeFile(platformPreloadPath, forceWindowsPlatformScript)
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
          'opencode',
          'opencode',
          ...providerArgs
        ]

        const result = await execute(process.execPath, launcherArgs, environment)

        expect(result.stderr).toBe('')
        expect(result).toMatchObject({ exitCode: 0, signal: null })
        expect(JSON.parse(result.stdout)).toMatchObject({
          arguments: providerArgs,
          environment: {
            CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID: expect.any(String),
            CLEANCODE_AGENT_ACTIVITY_PROVIDER_ID: 'opencode',
            OPENCODE_CONFIG_CONTENT: expect.stringContaining('opencode-plugin.mjs')
          },
          executable: join(providerDirectory, `opencode${extension}`),
          invocationId: expect.any(String),
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
        shell.write(
          '$resolved = Get-Command codex; Write-Output ("CLEANCODE_RESOLVED:" + $resolved.CommandType + "|" + $resolved.Source); codex --profile "test profile"; Write-Output ("CLEANCODE_WRAPPER_EXIT:" + $LASTEXITCODE)\r'
        )
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_TTY:'), 20_000).catch(() => {
          throw new Error(`Provider did not start. ConPTY output: ${JSON.stringify(output)}`)
        })
        expect(output).toContain('CLEANCODE_PROVIDER_TTY:true|true|true')
        expect(output).toContain('CLEANCODE_PROVIDER_ARGS:["--profile","test profile"')
        expect(output).toContain('CLEANCODE_PROVIDER_ENV:false|true')

        shell.write('interactive input\r')
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_INPUT:interactive input'), 10_000)
        shell.write(
          'Write-Output ("CLEANCODE_PROVIDER_EXIT:" + $LASTEXITCODE); Write-Output ("CLEANCODE_SHELL_STILL_WRITABLE:" + $env:ELECTRON_NO_ATTACH_CONSOLE)\r'
        )
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_EXIT:0'), 10_000)
        await waitUntil(() => output.includes('CLEANCODE_SHELL_STILL_WRITABLE:1'), 10_000)

        shell.write("$env:CLEANCODE_TEST_PROVIDER_MODE = 'signal'; codex\r")
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_SIGNAL_READY'), 10_000)
        shell.write('\x03')
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_SIGNAL:SIGINT'), 10_000)
        shell.write(
          'Write-Output ("CLEANCODE_PROVIDER_SIGNAL_EXIT:" + $LASTEXITCODE); Write-Output \'CLEANCODE_SHELL_WRITABLE_AFTER_SIGINT\'\r'
        )
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_SIGNAL_EXIT:130'), 10_000)
        await waitUntil(() => output.includes('CLEANCODE_SHELL_WRITABLE_AFTER_SIGINT'), 10_000)
      } finally {
        if (!exited) {
          shell.kill()
          await waitUntil(() => exited, 5_000).catch(() => undefined)
        }
        await rm(root, { force: true, recursive: true })
      }
    }, 40_000)
  }
)

const windowsInteractiveProviderCommandScript = [
  '@echo off',
  '"%CLEANCODE_TEST_NODE%" "%CLEANCODE_TEST_PROVIDER_PROGRAM%" %*',
  'exit /b %ERRORLEVEL%',
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
    CLEANCODE_TEST_NODE: process.execPath,
    CLEANCODE_TEST_PROVIDER_PROGRAM: input.providerProgramPath,
    ELECTRON_NO_ATTACH_CONSOLE: '1',
    PATH: [input.assetsShimDirectory, input.providerDirectory, process.env.PATH]
      .filter(Boolean)
      .join(delimiter),
    PATHEXT: '.COM;.EXE;.BAT;.CMD'
  }
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

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for Windows Agent ConPTY output.')
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
