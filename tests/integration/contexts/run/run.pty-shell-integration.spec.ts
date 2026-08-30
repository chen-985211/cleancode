import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { installTerminalShellIntegration } from '../../../../src/contexts/run/infrastructure/pty/TerminalShellIntegration'
import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'

describe.runIf(process.platform === 'darwin')('zsh terminal shell integration', () => {
  it('reports cwd changes through process-scoped OSC 7 integration', async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-zsh-integration-'))
    const integrationFiles = await installTerminalShellIntegration(
      join(workingDirectory, 'shell-integration')
    )
    const processes = new NodePtyTerminalProcessAdapter({ shellIntegration: integrationFiles })
    const models = new HeadlessTerminalModelAdapter()
    const scope = runScope('zsh-osc-session')
    const changes: string[] = []
    let output = ''
    const targetDirectory = join(workingDirectory, '目录 #1')
    await mkdir(targetDirectory)
    models.create({
      identity: scope,
      columns: 88,
      rows: 24,
      workingDirectory,
      onFlowControlChange: () => undefined,
      onQueryResponse: () => undefined,
      onWorkingDirectoryChanged: (directory) => changes.push(directory)
    })

    try {
      await processes.start({
        scope,
        workingDirectory,
        shell: '/bin/zsh',
        columns: 88,
        rows: 24,
        onOutput: (event) => {
          output += event.data
          models.acceptOutput(scope, event.data)
        },
        onExit: () => undefined
      })
      processes.write(scope.sessionId, `cd -- '${targetDirectory}'\r`)

      try {
        await waitUntil(() => changes.includes(targetDirectory))
      } catch (error) {
        throw new Error(`Missing OSC 7 directory event in output: ${JSON.stringify(output)}`, {
          cause: error
        })
      }
      expect(models.readWorkingDirectory(scope)).toBe(targetDirectory)
    } finally {
      await processes.disposeAll()
      models.disposeAll()
      await rm(workingDirectory, { recursive: true, force: true })
    }
  }, 10_000)
})

function runScope(sessionId: string) {
  return {
    projectId: 'project-test',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    blockId: 'block-test',
    sessionId,
    runId: `run-${sessionId}`,
    generation: 1
  }
}

async function waitUntil(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!assertion()) {
    if (Date.now() - startedAt > 5_000) throw new Error('Timed out waiting for terminal output.')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
