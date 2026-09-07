import electron from 'electron'
import { spawn } from 'node-pty'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { prepareCodexNativeMessageLaunch } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexNativeMessageLaunch'
import { pollUntilState } from '../../../support/e2ePolling'

describe('Codex native console input', () => {
  it('keeps raw input and native Ctrl+C when the relay runs through Electron in a PTY', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'cc-console-')))
    const artifacts = new AgentLaunchArtifactScope()
    const fixture = fileURLToPath(
      new URL('../../../fixtures/contexts/agent/codexNativeMessageCli.mjs', import.meta.url)
    )
    const plan = await prepareCodexNativeMessageLaunch({
      command: {
        artifacts,
        workspaceDirectory: directory,
        messageDelivery: () => undefined,
        onProviderSessionIdentified: () => undefined
      },
      // Node lacks Codex queue, exercising the ordinary interactive fallback.
      nativePlan: { executable: process.execPath, args: [fixture], env: {} },
      serverArgs: [],
      runtimeExecutable: electron as unknown as string,
      runtimePlatform: process.platform,
      bindIdentity: () => undefined
    })
    artifacts.seal()
    const terminal = spawn(plan.executable, [...plan.args], {
      cwd: directory,
      cols: 80,
      rows: 24,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NATIVE_MESSAGE_REPORT: join(directory, 'report')
      }
    })
    let output = ''
    let exitCode: number | undefined
    const data = terminal.onData((chunk) => {
      output += chunk
    })
    const exit = terminal.onExit((event) => {
      exitCode = event.exitCode
    })
    const waitForOutput = (marker: string) =>
      pollUntilState({
        observe: () => ({ output, exitCode }),
        accept: (state) => state.output.includes(marker),
        timeoutMs: 10_000,
        description: marker
      })
    try {
      await waitForOutput('NATIVE_TUI_READY')
      terminal.write('raw-input')
      await waitForOutput('NATIVE_TUI_INPUT:raw-input')
      terminal.write('\x03')
      await waitForOutput('NATIVE_TUI_INTERRUPTED')
      await pollUntilState({
        observe: () => exitCode,
        accept: (code) => code !== undefined,
        timeoutMs: 5_000,
        description: 'native relay exits after the TUI'
      })
      expect(exitCode).toBe(0)
    } finally {
      try {
        await artifacts.dispose()
      } finally {
        try {
          if (exitCode === undefined) terminal.kill()
        } finally {
          await pollUntilState({
            observe: () => exitCode,
            accept: (code) => code !== undefined,
            timeoutMs: 5_000,
            description: 'PTY cleanup'
          })
          data.dispose()
          exit.dispose()
          await rm(directory, { recursive: true, force: true })
        }
      }
    }
  }, 30_000)
})
