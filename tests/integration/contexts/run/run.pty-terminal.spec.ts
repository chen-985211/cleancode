import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'

describe('pty terminal process adapter', () => {
  let workingDirectory: string
  let adapter: NodePtyTerminalProcessAdapter

  beforeEach(async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-pty-'))
    adapter = new NodePtyTerminalProcessAdapter()
  })

  afterEach(async () => {
    adapter.disposeAll()
    await rm(workingDirectory, { recursive: true, force: true })
  })

  it('starts a local shell, accepts input, emits output, and stops', async () => {
    let output = ''

    const processHandle = await adapter.start({
      sessionId: 'session-1',
      workingDirectory,
      shell: '/bin/sh',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => undefined
    })

    adapter.write('session-1', 'printf "cleancode-pty-ok\\n"\r')

    await waitUntil(() => output.includes('cleancode-pty-ok'))
    adapter.stop('session-1')

    expect(processHandle.processId).toBeGreaterThan(0)
    expect(output).toContain('printf "cleancode-pty-ok\\n"')
    expect(output).toContain('cleancode-pty-ok')
  }, 10_000)
})

async function waitUntil(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()

  while (!assertion()) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error('Timed out waiting for terminal output.')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
