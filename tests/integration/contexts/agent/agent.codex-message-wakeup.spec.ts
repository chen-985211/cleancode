import { execFile, spawn } from 'node:child_process'
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
    'probes %s, retries failures without duplicate acceptance and cleans up its TUI and server',
    async (version, supported) => {
      const directory = await realpath(await mkdtemp(join(tmpdir(), 'cc native 中文 $&-')))
      const report = join(directory, 'report')
      const rejectPath = join(directory, 'reject-queue')
      const gatePath = join(directory, 'queue-gate')
      const executable = join(directory, process.platform === 'win32' ? 'codex-验证.cmd' : 'codex')
      const nativeArgs = [
        '--sandbox',
        'read-only',
        '-a',
        'on-request',
        '--add-dir',
        join(directory, '协作目录'),
        '-c',
        `developer_instructions='${'协作 instruction '.repeat(700)}'`
      ]
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
      if (process.platform === 'win32') {
        const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`
        // The same companion contract used by the existing foreground launcher.
        // Long configuration must not pass through cmd's 8191-character boundary.
        await writeFile(
          executable.replace(/\.cmd$/, '.ps1'),
          `& ${psQuote(process.execPath)} ${psQuote(fixture)} @args\nexit $LASTEXITCODE\n`
        )
      }
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
        nativePlan: { executable, args: nativeArgs, env: {} },
        serverArgs: ['-c', 'model_provider="custom"'],
        runtimeExecutable: process.execPath,
        runtimePlatform: process.platform,
        bindIdentity: (listener) => {
          identify = listener
        }
      })
      artifacts.seal()
      expect(plan.args[1]).toBe(await realpath(plan.args[1]!))
      const child = spawn(plan.executable, [...plan.args], {
        cwd: directory,
        env: {
          ...process.env,
          NATIVE_MESSAGE_REPORT: report,
          NATIVE_MESSAGE_REJECT_PATH: rejectPath,
          NATIVE_MESSAGE_QUEUE_GATE: gatePath,
          NATIVE_MESSAGE_UNSUPPORTED: supported ? '0' : '1',
          NATIVE_MESSAGE_SHELL_VALUE: 'from-shell'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let relayErrors = ''
      let relayOutput = ''
      child.stdout.on('data', (data) => {
        relayOutput += String(data)
      })
      child.stderr.on('data', (data) => {
        relayErrors += String(data)
      })
      let serverPid: number | undefined
      let descendantPid: number | undefined
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      const notify = (notificationId: string, signal: AbortSignal) =>
        Promise.race([
          wakeup!.notify({ notificationId, signal }),
          exited.then(() => {
            throw new Error(`Native relay exited before acceptance: ${relayErrors}`)
          })
        ])
      let scenarioFailure: unknown
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
        child.stdin.write('native-input\n')
        await pollUntilState({
          observe: () => relayOutput,
          accept: (output) => output.includes('NATIVE_TUI_INPUT:native-input'),
          timeoutMs: 5_000,
          description: 'native TUI receives input through the launcher'
        })
        const server = (await readFile(report, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
          .find((record) => record.kind === 'server')
        serverPid = server?.pid
        descendantPid = server?.descendantPid
        if (!supported) {
          await vi.waitFor(() => expect(wakeup).toBeNull())
          const records = (await readFile(report, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
          expect(records).toMatchObject([{ kind: 'tui', args: nativeArgs }])
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
        await writeFile(rejectPath, '')
        await expect(notify('one', signal)).rejects.toThrow(
          'Codex did not accept the inbox notification.'
        )
        await rm(rejectPath)
        await writeFile(gatePath, '')
        let retryResult = 'pending'
        const retry = notify('one', signal).then(
          () => {
            retryResult = 'accepted'
          },
          () => {
            retryResult = 'rejected'
          }
        )
        await pollUntilState({
          observe: async () =>
            (await readFile(report, 'utf8'))
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
              .filter((record) => record.kind === 'queue').length,
          accept: (count) => count === 2,
          timeoutMs: 5_000,
          description: 'retry entered the native queue but has not completed'
        })
        expect(retryResult).toBe('pending')
        await rm(gatePath)
        await retry
        expect(retryResult).toBe('accepted')
        await notify('one', signal)
        await notify('two', signal)
        const otherThreadId = '550e8400-e29b-41d4-a716-446655440001'
        identify(otherThreadId)
        await notify('one', signal)
        const records = (await readFile(report, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
        expect(records.map((record) => record.kind)).toEqual([
          'server',
          'tui',
          'queue',
          'queue',
          'queue',
          'queue'
        ])
        expect(records.at(-1).args).toEqual(expect.arrayContaining(['--thread', otherThreadId]))
        expect(
          records.every((record) => record.inherited === 'from-shell' && record.cwd === directory)
        ).toBe(true)
        expect(records[1].args).toEqual(expect.arrayContaining([...nativeArgs, '--remote']))
        expect(records[2].args).toEqual(
          expect.arrayContaining(['--thread', threadId, '--message', agentInboxWakeupPrompt])
        )
        expect(records[0].args[2]).toBe(records[2].args[2])
        await artifacts.dispose()
        await exited
        for (const record of records) expect(() => process.kill(record.pid, 0)).toThrow()
        expect(descendantPid).toBeTypeOf('number')
        await vi.waitFor(() => expect(() => process.kill(descendantPid!, 0)).toThrow())
      } catch (error) {
        scenarioFailure = new Error(
          `Codex relay scenario failed: ${String(error)}; stderr: ${relayErrors}; stdout: ${relayOutput}`,
          { cause: error }
        )
        throw scenarioFailure
      } finally {
        try {
          await artifacts.dispose().catch((error) => {
            throw new AggregateError(
              scenarioFailure ? [scenarioFailure, error] : [error],
              `Codex relay cleanup failed. stderr: ${relayErrors}; stdout: ${relayOutput}`
            )
          })
        } finally {
          if (serverPid) {
            try {
              if (process.platform === 'win32') {
                await new Promise<void>((resolve) =>
                  execFile('taskkill.exe', ['/PID', String(serverPid), '/T', '/F'], () => resolve())
                )
              } else process.kill(-serverPid, 'SIGKILL')
            } catch {
              /* Already reaped by the relay. */
            }
          }
          child.kill('SIGKILL')
          await exited
          await rm(directory, { recursive: true, force: true })
        }
      }
    },
    // This scenario starts several native processes and performs four queue calls.
    // Keep per-operation state deadlines; the whole scenario exceeds Vitest's 5s on Windows.
    30_000
  )
})
