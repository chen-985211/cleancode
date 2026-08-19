import { spawn } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { TerminalAgentTelemetryAssetStore } from '../../../../src/contexts/agent/infrastructure/terminal-activity/TerminalAgentTelemetryAssetStore'

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

const windowsProviderCommandScript = [
  '@echo off',
  '"%CLEANCODE_TEST_NODE%" "%CLEANCODE_TEST_PROVIDER_PROGRAM%" %*',
  'exit /b %ERRORLEVEL%',
  ''
].join('\r\n')

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
