import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createForegroundJobShellControl,
  disposeForegroundJobShellControl
} from '../../../../src/contexts/run/infrastructure/pty/ForegroundJobShellControl'

describe.skipIf(process.platform === 'win32')('POSIX foreground job execution directory', () => {
  it('runs in the exact requested directory and reports a failed cd without starting the CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'cc-job-directory-'))
    const directory = join(root, "work tree 中文'feature")
    mkdirSync(directory)
    try {
      for (const workingDirectory of [directory, join(root, 'missing')]) {
        const control = createForegroundJobShellControl(
          {
            executable: process.execPath,
            args: ['-e', 'process.stdout.write(process.cwd())'],
            environment: {},
            generation: 1,
            launchId: 'launch-1',
            sessionId: 'session-1',
            workingDirectory,
            onExit: () => undefined,
            onStarted: () => undefined
          },
          {
            platform: process.platform,
            shellExecutable: '/bin/sh',
            temporaryRoot: root,
            token: 'directorytoken'
          }
        )
        try {
          const output = execFileSync('/bin/sh', [control.scriptPath], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
          })
          if (workingDirectory === directory) {
            expect(output).toContain(realpathSync(directory))
            expect(readFileSync(control.statusPath!, 'utf8').trim()).toBe('0')
          } else {
            expect(output).not.toContain('CLEANCODE_JOB:directorytoken:started')
            expect(readFileSync(control.statusPath!, 'utf8').trim()).toBe('1')
          }
        } finally {
          disposeForegroundJobShellControl(control)
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
