import { writeFile } from 'node:fs/promises'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { createProviderSessionFileReporter } from '../../../../src/contexts/agent/infrastructure/providers/terminal-cli/ProviderSessionFileReporter'
import { createReportedTerminalCliSession } from '../../../../src/contexts/agent/infrastructure/providers/terminal-cli/ReportedTerminalCliSession'

describe('Provider session identity report transport', () => {
  it.each([
    '{',
    JSON.stringify({ version: 2, sequence: 1, value: null }),
    JSON.stringify({ version: 1, sequence: -1, value: null }),
    JSON.stringify({ version: 1, sequence: 1, value: 'latest' }),
    JSON.stringify({ version: 1, sequence: 1, value: 123 }),
    JSON.stringify({ version: 1, sequence: 1, value: 'x'.repeat(9000) })
  ])('ignores invalid reports without changing the current binding (%#)', async (contents) => {
    const artifacts = new AgentLaunchArtifactScope()
    const identified = vi.fn()
    const cleared = vi.fn()
    const path = await createProviderSessionFileReporter(
      {
        artifacts,
        onProviderSessionIdentified: identified,
        onProviderSessionCleared: cleared,
        workspaceDirectory: '/repo'
      },
      createReportedTerminalCliSession('hermes').sessionRefCodec,
      'hermes-session'
    )
    try {
      await writeFile(path, contents)
      await artifacts.dispose()
      expect(identified).not.toHaveBeenCalled()
      expect(cleared).not.toHaveBeenCalled()
    } finally {
      await artifacts.dispose()
    }
  })

  it('ignores old reports and removes its private transport on disposal', async () => {
    const artifacts = new AgentLaunchArtifactScope()
    const identified = vi.fn()
    const cleared = vi.fn()
    const path = await createProviderSessionFileReporter(
      {
        artifacts,
        onProviderSessionIdentified: identified,
        onProviderSessionCleared: cleared,
        workspaceDirectory: '/repo'
      },
      createReportedTerminalCliSession('hermes').sessionRefCodec,
      'hermes-session'
    )
    try {
      await writeFile(
        path,
        JSON.stringify({ version: 1, sequence: 2, value: '20260908_123456_a1b2c3' })
      )
      await vi.waitFor(() => expect(identified).toHaveBeenCalledTimes(1))
      await writeFile(path, JSON.stringify({ version: 1, sequence: 1, value: null }))
      await artifacts.dispose()
      expect(cleared).not.toHaveBeenCalled()
      await expect(writeFile(path, '')).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await artifacts.dispose()
    }
  })
})
