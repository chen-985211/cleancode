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
import { pollUntilState } from '../../../support/e2ePolling'
import { prepareCodexNativeMessageLaunch } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexNativeMessageLaunch'

describe('Codex owned native session', () => {
  it.each([
    ['codex-cli 0.149.0', true],
    [undefined, true],
    ['codex-cli 999.0.0', false]
  ] as const)(
    'probes capabilities for %s and cleans up its TUI and server',
    async (version, supported) => {
      const directory = await realpath(await mkdtemp(join(tmpdir(), 'cc native $&-')))
      const report = join(directory, 'report')
      const executable = join(directory, process.platform === 'win32' ? 'codex.cmd' : 'codex')
      const fixture = fileURLToPath(
        new URL('../../../fixtures/contexts/agent/codexNativeMessageCli.mjs', import.meta.url)
      )
      const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`
      await writeFile(
        executable,
        process.platform === 'win32'
          ? `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n`
          : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`
      )
      await chmod(executable, 0o700)
      const artifacts = new AgentLaunchArtifactScope()
      let identify!: (id: string) => void
      let wakeup: AgentMessageWakeupPort | null | undefined
      const plan = await prepareCodexNativeMessageLaunch({
        command: {
          artifacts,
          workspaceDirectory: directory,
          providerVersion: version,
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
          NATIVE_MESSAGE_UNSUPPORTED: supported ? '0' : '1',
          NATIVE_MESSAGE_SHELL_VALUE: 'from-shell'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let descendantPid: number | undefined
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
        if (!supported) {
          await vi.waitFor(() => expect(wakeup).toBeNull())
          const records = (await readFile(report, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
          expect(records).toMatchObject([
            { kind: 'tui', args: ['--sandbox', 'read-only', '-a', 'on-request'] }
          ])
          await artifacts.dispose()
          await exited
          return
        }
        const threadId = '550e8400-e29b-41d4-a716-446655440000'
        identify(threadId)
        await pollUntilState({
          observe: () => !!wakeup,
          accept: Boolean,
          timeoutMs: 5_000,
          description: 'Codex native readiness'
        })
        const signal = new AbortController().signal
        await wakeup!.notify({ notificationId: 'one', signal })
        await wakeup!.notify({ notificationId: 'one', signal })
        await wakeup!.notify({ notificationId: 'two', signal })
        const records = (await readFile(report, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        descendantPid = records[0].descendantPid
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
        expect(descendantPid).toBeTypeOf('number')
        await vi.waitFor(() => expect(() => process.kill(descendantPid!, 0)).toThrow())
      } finally {
        try {
          await artifacts.dispose()
        } finally {
          if (descendantPid) {
            try {
              process.kill(descendantPid, 'SIGKILL')
            } catch {
              /* Already reaped by the relay. */
            }
          }
          child.kill('SIGKILL')
          await exited
          await rm(directory, { recursive: true, force: true })
        }
      }
    }
  )
})
