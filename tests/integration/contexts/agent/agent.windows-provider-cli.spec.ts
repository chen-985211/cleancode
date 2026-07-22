import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NodeAgentProviderCliDetector } from '../../../../src/contexts/agent/infrastructure/providers/shared/NodeAgentProviderCliDetector'

describe.runIf(process.platform === 'win32')('Windows Agent Provider CLI detection', () => {
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cleancode-windows-provider-cli-'))
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true })
  })

  it('detects an npm-style command shim and classifies a missing shim', async () => {
    const executable = join(temporaryDirectory, 'fake-agent.cmd')
    await writeFile(
      executable,
      ['@echo off', 'if "%~1"=="--version" echo fake-agent 1.0.0', 'exit /b 0'].join('\r\n'),
      'utf8'
    )
    const installed = new NodeAgentProviderCliDetector({
      executable,
      installCommand: 'install fake-agent',
      providerId: 'fake-agent'
    })
    const missing = new NodeAgentProviderCliDetector({
      executable: join(temporaryDirectory, 'missing-agent.cmd'),
      installCommand: 'install missing-agent',
      providerId: 'missing-agent'
    })

    await expect(installed.inspect()).resolves.toEqual({
      providerId: 'fake-agent',
      status: 'installed',
      version: 'fake-agent 1.0.0'
    })
    await expect(missing.inspect()).resolves.toEqual({
      installCommand: 'install missing-agent',
      providerId: 'missing-agent',
      reason: 'not_found',
      status: 'missing',
      version: null
    })
  }, 10_000)
})
