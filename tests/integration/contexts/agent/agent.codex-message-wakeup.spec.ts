import { spawn } from 'node:child_process'
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import {
  agentInboxWakeupPrompt,
  type AgentMessageWakeupPort
} from '../../../../src/contexts/agent/application/ports/AgentMessageDeliveryPort'
import { prepareCodexNativeMessageLaunch } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexNativeMessageLaunch'

// Native Unix socket transport is deliberately unsupported on Windows; fallback is covered in unit.
describe.skipIf(process.platform === 'win32')('Codex owned native session', () => {
  it('queues in the same native environment and cleans up its TUI and server', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'cc-native-test-')))
    const report = join(directory, 'report')
    const executable = join(directory, 'codex')
    const fixture = fileURLToPath(
      new URL('../../../fixtures/contexts/agent/codexNativeMessageCli.mjs', import.meta.url)
    )
    const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`
    await writeFile(
      executable,
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`
    )
    await chmod(executable, 0o700)
    const artifacts = new AgentLaunchArtifactScope()
    let identify!: (id: string) => void
    let wakeup: AgentMessageWakeupPort | null | undefined
    const plan = await prepareCodexNativeMessageLaunch({
      command: {
        artifacts,
        workspaceDirectory: directory,
        providerVersion: 'codex-cli 0.153.4',
        onProviderSessionIdentified: () => undefined,
        messageDelivery: (value) => {
          wakeup = value
        }
      },
      nativePlan: { executable, args: ['--sandbox', 'read-only', '-a', 'on-request'], env: {} },
      serverArgs: ['-c', 'model_provider="custom"'],
      runtimeExecutable: process.execPath,
      runtimePlatform: process.platform,
      bindIdentity: (listener) => {
        identify = listener
      }
    })
    artifacts.seal()
    const child = spawn(plan.executable, [...plan.args], {
      cwd: directory,
      env: {
        ...process.env,
        NATIVE_MESSAGE_REPORT: report,
        NATIVE_MESSAGE_SHELL_VALUE: 'from-shell'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Native fixture did not start')), 5_000)
        child.stdout.on('data', (data) => {
          if (String(data).includes('NATIVE_TUI_READY')) {
            clearTimeout(timeout)
            resolve()
          }
        })
        child.once('error', reject)
      })
      const threadId = '550e8400-e29b-41d4-a716-446655440000'
      identify(threadId)
      const signal = new AbortController().signal
      await wakeup!.notify({ notificationId: 'one', signal })
      await wakeup!.notify({ notificationId: 'two', signal })
      const records = (await readFile(report, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(records.map((record) => record.kind)).toEqual(['server', 'tui', 'queue', 'queue'])
      expect(
        records.every((record) => record.inherited === 'from-shell' && record.cwd === directory)
      ).toBe(true)
      expect(records[1].args).toEqual(
        expect.arrayContaining(['--sandbox', 'read-only', '-a', 'on-request', '--remote'])
      )
      expect(records[2].args).toEqual(
        expect.arrayContaining(['--thread', threadId, '--message', agentInboxWakeupPrompt])
      )
      expect(records[0].args[2]).toBe(records[2].args[2])
      await artifacts.dispose()
      await exited
      for (const record of records) expect(() => process.kill(record.pid, 0)).toThrow()
    } finally {
      try {
        await artifacts.dispose()
      } finally {
        child.kill('SIGKILL')
        await exited
        await rm(directory, { recursive: true, force: true })
      }
    }
  })
})
