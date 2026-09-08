import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { installTerminalShellIntegration } from '../../../../src/contexts/run/infrastructure/pty/TerminalShellIntegration'
import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'

describe.runIf(process.platform === 'darwin')('zsh terminal shell integration', () => {
  it.each([
    { keymap: 'emacs', custom: false },
    { keymap: 'viins', custom: false },
    { keymap: 'emacs', custom: true },
    { keymap: 'viins', custom: true }
  ])(
    'supports Option arrows in $keymap and preserves custom bindings ($custom)',
    async ({ keymap, custom }) => {
      const directory = await mkdtemp(join(tmpdir(), 'cleancode-zsh-words-'))
      const files = await installTerminalShellIntegration(join(directory, 'integration'))
      const processes = new NodePtyTerminalProcessAdapter({ shellIntegration: files })
      const rcPath = join(directory, '.zshrc')
      const rc = `
bindkey -${keymap === 'emacs' ? 'e' : 'v'}
PROMPT='CC_READY> '
__cc_test_buffer() { print -r -- "CC_RESULT:$BUFFER:$CURSOR"; zle .send-break }
zle -N __cc_test_buffer
bindkey '^X' __cc_test_buffer
${custom ? "bindkey '^[[1;3D' beginning-of-line" : ''}
`
      await writeFile(rcPath, rc)
      let output = ''
      try {
        await processes.start({
          scope: runScope('zsh-word-session'),
          workingDirectory: directory,
          shell: '/bin/zsh',
          environment: { HOME: directory, ZDOTDIR: directory },
          columns: 88,
          rows: 24,
          onOutput: (event) => {
            output += event.data
          },
          onExit: () => undefined
        })
        await waitUntil(() => output.includes('CC_READY>'))
        processes.write('zsh-word-session', 'alpha beta\x1b[1;3DX\x1b[1;3CY\x18')
        await waitUntil(() => output.includes('CC_RESULT:'))
        expect(output).toContain(custom ? 'CC_RESULT:Xalpha Ybeta:8' : 'CC_RESULT:alpha XbetaY:12')
        expect(await readFile(rcPath, 'utf8')).toBe(rc)
      } finally {
        await processes.disposeAll()
        await rm(directory, { recursive: true, force: true })
      }
    },
    10_000
  )
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
