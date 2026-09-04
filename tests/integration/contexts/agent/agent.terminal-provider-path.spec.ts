import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { spawn } from 'node-pty'

import { NodeAgentProviderCliDetector } from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderCliDetector'
import { NodeAgentProviderShellPathHydrator } from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderShellPathHydrator'
import { RunAgentTerminalRuntimeAdapter } from '../../../../src/contexts/agent/infrastructure/run/RunAgentTerminalRuntimeAdapter'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import { PersistentTerminalProviderClient } from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClient'
import {
  atomicWriteProviderMetadata,
  createProviderEndpoint
} from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'
import { terminalProviderProtocolVersion } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { TerminalProviderServer } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderServer'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import {
  pathFixtureExecutable,
  quotePathFixtureWord,
  writeAgentProviderLoginProfile,
  writeAgentProviderPathFixture
} from '../../../fixtures/contexts/agent/agentProviderPathFixture'

const execFileAsync = promisify(execFile)
const shells = [
  { name: 'bash' as const, available: process.platform !== 'win32' },
  { name: 'zsh' as const, available: process.platform === 'darwin' }
]

describe.each(shells)(
  'Agent PATH through the Terminal Provider with $name',
  ({ name, available }) => {
    let directory = ''
    let server: TerminalProviderServer | undefined
    let client: PersistentTerminalProviderClient | undefined
    let runtime: RunAgentTerminalRuntimeAdapter | undefined

    afterEach(async () => {
      try {
        await runtime?.disposeAll()
      } finally {
        try {
          await client?.detachApplication()
        } finally {
          try {
            await server?.close()
          } finally {
            if (directory) await rm(directory, { force: true, recursive: true })
          }
        }
      }
    })

    it.runIf(available)(
      'uses the detected CLI after the backend starts, refreshes and explicit overrides',
      async () => {
        directory = await mkdtemp(join(tmpdir(), 'cc-agent-path-'))
        const home = join(directory, 'home')
        const shell = join('/bin', name)
        const firstBin = join(directory, 'first bin')
        const secondBin = join(directory, "second 'bin")
        const overrideBin = join(directory, 'override bin')
        const systemPath = ['/usr/bin', '/bin'].join(delimiter)
        await Promise.all([
          writeAgentProviderPathFixture(firstBin, 'first'),
          writeAgentProviderPathFixture(secondBin, 'second'),
          writeAgentProviderPathFixture(overrideBin, 'override')
        ])
        await writeAgentProviderLoginProfile(home, name, [firstBin, systemPath].join(delimiter))

        // The detector has its own environment, just as Electron main does. The server
        // keeps the original environment and receives updates only through real RPC.
        const applicationEnvironment = { HOME: home, ZDOTDIR: home, SHELL: shell, PATH: systemPath }
        const endpoint = createProviderEndpoint(directory)
        server = new TerminalProviderServer({
          authToken: 'path-test-token',
          endpoint,
          instanceId: 'path-provider',
          recoveryDirectory: join(directory, 'recovery'),
          processes: new NodePtyTerminalProcessAdapter({
            resolveShellExecutable: async () => shell,
            spawnPty: (executable, args, options) =>
              spawn(executable, args, {
                ...options,
                env: { ...options.env, HOME: home, ZDOTDIR: home }
              })
          })
        })
        await server.start()
        await atomicWriteProviderMetadata(join(directory, 'provider.json'), {
          schemaVersion: 1,
          protocolVersion: terminalProviderProtocolVersion,
          instanceId: 'path-provider',
          authToken: 'path-test-token',
          endpoint,
          processId: process.pid,
          startedAt: new Date().toISOString()
        })
        client = new PersistentTerminalProviderClient({
          stateDirectory: directory,
          providerEntryPath: join(directory, 'unused-entry.js')
        })
        const sessions = new TerminalSessionService(client, undefined, undefined, client, client)
        await sessions.initializeRuntime({ onOutput: vi.fn(), onExit: vi.fn() })
        runtime = new RunAgentTerminalRuntimeAdapter(sessions, {
          environment: applicationEnvironment
        })
        const hydrator = new NodeAgentProviderShellPathHydrator({
          environment: applicationEnvironment,
          platform: process.platform
        })
        const detector = new NodeAgentProviderCliDetector({
          executable: pathFixtureExecutable,
          installCommand: 'unused',
          providerId: 'path-fixture',
          runCommand: (executable, args) =>
            execFileAsync(executable, [...args], { env: applicationEnvironment })
        })
        await hydrator.prepare()
        expect(await detector.inspect()).toMatchObject({ status: 'installed', version: 'first' })

        const terminal = await runtime.open({
          agentId: 'agent-path',
          columns: 100,
          gitBranch: null,
          onTerminalExit: vi.fn(),
          projectDirectory: directory,
          projectId: 'project-path',
          rows: 24,
          sessionId: 'agent-session-path',
          terminalSourceTheme: 'dark',
          workspaceDirectory: directory,
          workspaceId: 'main'
        })
        let output = ''
        await sessions.attachView({
          ...terminal.viewIdentity,
          viewId: 'path-view',
          onOutput: (event) => {
            output += event.output.data
          }
        })
        runtime.write('agent-session-path', "printf '%s%s\\n' 'path-shell-' 'ready'\n")
        await vi.waitFor(() => expect(output).toContain('path-shell-ready'), { timeout: 10_000 })

        const report = join(directory, 'report.json')
        const launch = async (expectedVersion: string, env: Record<string, string> = {}) => {
          let resolveExit: (exitCode: number | null) => void = () => undefined
          const exit = new Promise<number | null>((resolve) => {
            resolveExit = resolve
          })
          runtime!.launch({
            sessionId: 'agent-session-path',
            plan: {
              executable: pathFixtureExecutable,
              args: [report, 'argument with spaces'],
              env
            },
            onExit: (event) => resolveExit(event.exitCode)
          })
          await expect(exit).resolves.toBe(7)
          expect(JSON.parse(await readFile(report, 'utf8'))).toEqual({
            version: expectedVersion,
            args: ['argument with spaces']
          })
          expect(sessions.getSession(terminal.terminalId)?.status).toBe('running')
        }
        await launch('first')

        const manualReport = join(directory, 'manual.json')
        runtime.write(
          'agent-session-path',
          `${pathFixtureExecutable} ${quotePathFixtureWord(manualReport)}\n`
        )
        await vi.waitFor(
          async () => {
            expect(JSON.parse(await readFile(manualReport, 'utf8'))).toMatchObject({
              version: 'first'
            })
          },
          { timeout: 5_000 }
        )

        await writeAgentProviderLoginProfile(home, name, [secondBin, systemPath].join(delimiter))
        await hydrator.prepare({ refresh: true })
        expect(await detector.inspect()).toMatchObject({ status: 'installed', version: 'second' })
        await launch('second')
        await launch('override', { PATH: [overrideBin, systemPath].join(delimiter) })
        await sessions.detachView({ ...terminal.viewIdentity, viewId: 'path-view' })
      },
      20_000
    )
  }
)
