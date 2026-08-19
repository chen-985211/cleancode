import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import { TerminalAgentTelemetryAssetStore } from '../../../../src/contexts/agent/infrastructure/terminal-activity/TerminalAgentTelemetryAssetStore'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string

const windowsCommandCases = [
  { exitCode: 0, extension: '.cmd' },
  { exitCode: 7, extension: '.bat' }
] as const

describe('ordinary terminal Windows command Agent activity integration', () => {
  it.each(windowsCommandCases)(
    'launches an npm-style Provider through a real $extension command path',
    async ({ exitCode, extension }) => {
      const root = await mkdtemp(join(tmpdir(), 'cleancode-agent-windows-command-'))
      const providerDirectory = join(root, 'provider bin')
      const stateDirectory = join(root, 'state')
      const capturePath = join(root, 'provider-capture.json')
      const commandCapturePath = join(root, 'command-capture.json')
      const providerProgramPath = join(root, 'fake-provider.cjs')
      const platformPreloadPath = join(root, 'force-win32.cjs')
      const fakeCommandInterpreterPath = join(root, 'fake-cmd.exe')
      const providerArgs = ['--profile', 'test profile']
      await Promise.all([mkdir(providerDirectory), mkdir(stateDirectory)])

      try {
        await Promise.all([
          writeFile(join(providerDirectory, `opencode${extension}`), windowsProviderCommandScript),
          writeFile(providerProgramPath, providerProgramScript),
          writeFile(platformPreloadPath, forceWindowsPlatformScript)
        ])
        if (process.platform !== 'win32') {
          await writeFile(fakeCommandInterpreterPath, fakeCommandInterpreterScript)
          await chmod(fakeCommandInterpreterPath, 0o700)
        }

        const store = new TerminalAgentTelemetryAssetStore({
          platform: 'win32',
          runtimeExecutable: process.execPath,
          stateDirectory
        })
        const assets = await store.ensure()
        const launcherPath = join(dirname(assets.launchSpecsPath), 'shim-launcher.mjs')
        const environment = createLauncherEnvironment({
          assetsShimDirectory: assets.shimDirectory,
          capturePath,
          commandCapturePath,
          extension,
          exitCode,
          fakeCommandInterpreterPath,
          providerArgs,
          providerDirectory,
          providerProgramPath
        })
        const launcherArgs = [
          ...(process.platform === 'win32' ? [] : ['--require', platformPreloadPath]),
          launcherPath,
          'opencode',
          'opencode',
          ...providerArgs
        ]

        const result = await execute(process.execPath, launcherArgs, environment)

        expect(result.stderr).toBe('')
        expect(result).toMatchObject({ exitCode, signal: null })
        expect(JSON.parse(await readFile(capturePath, 'utf8'))).toEqual({
          args: process.platform === 'win32' ? providerArgs : [],
          electronRunAsNode: null,
          invocationId: expect.any(String)
        })
        if (process.platform !== 'win32') {
          const commandArgs = JSON.parse(await readFile(commandCapturePath, 'utf8')) as string[]
          expect(commandArgs.slice(0, 3)).toEqual(['/d', '/s', '/c'])
          expect(commandArgs.at(-1)).toContain(`opencode${extension}`)
        }
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
    it('preserves the terminal while launching an npm-style Provider through Electron', async () => {
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
        shell.write('codex --profile "test profile"\r')
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_TTY:'), 20_000)
        expect(output).toContain('CLEANCODE_PROVIDER_TTY:true|true|true')
        expect(output).toContain('CLEANCODE_PROVIDER_ARGS:["--profile","test profile"')

        shell.write('interactive input\r')
        await waitUntil(() => output.includes('CLEANCODE_PROVIDER_INPUT:interactive input'), 10_000)
        shell.write(
          'Write-Output ("CLEANCODE_SHELL_STILL_WRITABLE:" + $env:ELECTRON_NO_ATTACH_CONSOLE)\r'
        )
        await waitUntil(() => output.includes('CLEANCODE_SHELL_STILL_WRITABLE:1'), 10_000)
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

const windowsProviderCommandScript = [
  '@echo off',
  '"%CLEANCODE_TEST_NODE%" "%CLEANCODE_TEST_PROVIDER_PROGRAM%" %*',
  'exit /b %ERRORLEVEL%',
  ''
].join('\r\n')

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
if (!tty.every(Boolean)) process.exit(86)
process.stdin.setEncoding('utf8')
process.stdin.once('data', (input) => {
  process.stdout.write('CLEANCODE_PROVIDER_INPUT:' + input.trim() + '\\r\\n')
  process.exit(0)
})
setTimeout(() => process.exit(87), 15_000)
`.trimStart()

const providerProgramScript = `
const { writeFileSync } = require('node:fs')
writeFileSync(process.env.CLEANCODE_TEST_CAPTURE_PATH, JSON.stringify({
  args: process.argv.slice(2),
  electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
  invocationId: process.env.CLEANCODE_AGENT_ACTIVITY_INVOCATION_ID ?? null
}))
process.exit(Number(process.env.CLEANCODE_TEST_PROVIDER_EXIT_CODE || 0))
`.trimStart()

const forceWindowsPlatformScript = `
const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
if (!descriptor?.configurable) throw new Error('Expected process.platform to be configurable')
Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' })
`.trimStart()

const fakeCommandInterpreterScript = `#!${process.execPath}
const { spawnSync } = require('node:child_process')
const { writeFileSync } = require('node:fs')
writeFileSync(process.env.CLEANCODE_TEST_COMMAND_CAPTURE_PATH, JSON.stringify(process.argv.slice(2)))
const result = spawnSync(
  process.env.CLEANCODE_TEST_NODE,
  [process.env.CLEANCODE_TEST_PROVIDER_PROGRAM],
  { env: process.env, stdio: 'inherit' }
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
`

function createLauncherEnvironment(input: {
  readonly assetsShimDirectory: string
  readonly capturePath: string
  readonly commandCapturePath: string
  readonly extension: '.bat' | '.cmd'
  readonly exitCode: number
  readonly fakeCommandInterpreterPath: string
  readonly providerArgs: readonly string[]
  readonly providerDirectory: string
  readonly providerProgramPath: string
}): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  const replacedKeys = new Set([
    'comspec',
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
    CLEANCODE_TEST_CAPTURE_PATH: input.capturePath,
    CLEANCODE_TEST_COMMAND_CAPTURE_PATH: input.commandCapturePath,
    CLEANCODE_TEST_NODE: process.execPath,
    CLEANCODE_TEST_PROVIDER_EXIT_CODE: String(input.exitCode),
    CLEANCODE_TEST_PROVIDER_PROGRAM: input.providerProgramPath,
    ComSpec:
      process.platform === 'win32'
        ? process.env.ComSpec || 'cmd.exe'
        : input.fakeCommandInterpreterPath,
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
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env: environment,
      killSignal: 'SIGTERM',
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 10_000
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.once('error', reject)
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, stderr }))
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
