import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ClaudeCodeAgentProviderContribution } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeAgentProviderContribution'

// Simulated version command, real OS process invocation; no claim of native Claude support.
describe('Claude exec-form hook compatibility boundary', () => {
  it.each([
    ['2.1.138', 'upgrade_required'],
    ['2.1.139', 'installed'],
    ['2.1.261', 'installed'],
    ['custom-build', 'installed']
  ])('classifies %s as %s using the implementation boundary', async (version, status) => {
    const directory = await mkdtemp(join(tmpdir(), 'claude boundary-'))
    const executable = join(directory, process.platform === 'win32' ? 'claude.cmd' : 'claude')
    try {
      await writeFile(
        executable,
        process.platform === 'win32'
          ? `@echo off\r\necho ${version} (Claude Code)\r\n`
          : `#!/bin/sh\nprintf '%s\\n' '${version} (Claude Code)'\n`
      )
      await chmod(executable, 0o700)
      const result = await new ClaudeCodeAgentProviderContribution({
        command: executable
      }).detector.inspect()
      expect(result.status).toBe(status)
      if (result.status === 'upgrade_required') expect(result.minimumVersion).toBe('2.1.139')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
