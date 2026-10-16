import { TerminalWorkflowService } from '../../../../src/contexts/run/application/use-cases/TerminalWorkflowService'
import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalWorkflowEvent } from '../../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import type { StartWorkflowRuntimeCommand } from '../../../../src/contexts/run/application/ports/TerminalWorkflowRuntimePort'

describe('workflow output readiness contract', () => {
  it.each([
    '\x1b]0;Local:\x07',
    '\x1b]8;;https://example.test/Local:\x1b\\link\x1b]8;;\x1b\\',
    '\x1bP1$rLocal:\x1b\\',
    '\x1b_Local:\x1b\\',
    '\x1b^Local:\x1b\\',
    '\x1bXLocal:\x1b\\',
    '\x9d0;Local:\x9c',
    'Loc\nal:',
    'Loc\ral:',
    'local:'
  ])('does not use hidden payloads or different literal text as readiness: %j', async (data) => {
    vi.useFakeTimers()
    const fixture = createFixture()
    try {
      await fixture.service.start(fixture.command)
      for (const character of data.split('')) fixture.output(character)
      expect(fixture.snapshot()?.status).toBe('running')
      await vi.advanceTimersByTimeAsync(1_001)
      expect(fixture.snapshot()?.nodes[0]).toMatchObject({
        status: 'failed',
        error: { code: 'COMMAND_TIMED_OUT' }
      })
      expect(fixture.stopPreservingHistory).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.service.stopAll()
      vi.useRealTimers()
    }
  })

  it('preserves raw output and identity while matching text across control sequences', async () => {
    const fixture = createFixture()
    try {
      await fixture.service.start(fixture.command)
      const chunks = ['\x1b]0;Local:', '\x07\x1b[1mLo', 'cal\x1b[2', '2m:']
      for (const chunk of chunks) fixture.output(chunk)
      expect(fixture.snapshot()?.status).toBe('ready')
      expect(fixture.events.filter((event) => event.type === 'terminal-output')).toEqual(
        chunks.map((data, index) => ({
          type: 'terminal-output',
          blockId: 'server',
          output: {
            data,
            sequence: index + 1,
            scope: fixture.session(),
            sessionId: fixture.session().id
          }
        }))
      )
    } finally {
      await fixture.service.stopAll()
    }
  })

  it('does not carry partial text or control sequences into a restarted workflow', async () => {
    const fixture = createFixture()
    try {
      const run = await fixture.service.start(fixture.command)
      fixture.output('Loc\x1b]0;')
      await fixture.service.stop({ ...fixture.command, runId: run.id })
      await fixture.service.start(fixture.command)
      fixture.output('al:')
      expect(fixture.snapshot()?.status).toBe('running')
      fixture.output('\x1b[1mLocal\x1b[0m:')
      expect(fixture.snapshot()?.status).toBe('ready')
    } finally {
      await fixture.service.stopAll()
    }
  })

  it('discards a long unfinished control payload and resumes on its terminator', async () => {
    const fixture = createFixture()
    try {
      await fixture.service.start(fixture.command)
      fixture.output('Loc\x1b]0;')
      fixture.output('Local:'.repeat(200_000))
      expect(fixture.snapshot()?.status).toBe('running')
      fixture.output('\x1b')
      fixture.output('\\al:')
      expect(fixture.snapshot()?.status).toBe('ready')
    } finally {
      await fixture.service.stopAll()
    }
  })
})

function createFixture() {
  const events: TerminalWorkflowEvent[] = []
  let started: StartWorkflowRuntimeCommand
  let generation = 0
  let sequence = 0
  const command = {
    projectId: 'project',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    workingDirectory: '/project',
    gitBranch: 'main',
    scope: { type: 'full' as const }
  }
  const session = (): TerminalSessionSnapshot => ({
    ...command,
    blockId: 'server',
    terminalBlockId: 'server',
    id: 'session-' + generation,
    sessionId: 'session-' + generation,
    runId: started.runId,
    generation,
    processId: 1,
    status: 'running',
    kind: 'workflow',
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    terminalSourceTheme: 'dark',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  })
  const stopPreservingHistory = vi.fn(async () => null)
  const service = new TerminalWorkflowService(
    {
      buildPlan: async () => ({
        graphId: 'graph',
        workspaceId: 'main',
        nodes: [
          {
            blockId: 'server',
            name: 'server',
            launchCommand: 'pnpm dev',
            dependencyBlockIds: [],
            executionConfig: {
              mode: 'service',
              readiness: { type: 'output', text: 'Local:' },
              readinessTimeoutMs: 1_000
            }
          }
        ]
      })
    },
    {
      startCommand: async (input) => {
        started = input
        generation += 1
        sequence = 0
        return session()
      },
      stop: async () => undefined,
      stopPreservingHistory
    },
    { waitUntilReady: async () => undefined, waitUntilClosed: async () => undefined },
    { publish: (event) => events.push(event) }
  )
  return {
    service,
    command,
    events,
    session,
    stopPreservingHistory,
    snapshot: () => service.getRuns(command)[0],
    output: (data: string) =>
      started.onOutput({ data, sequence: ++sequence, scope: session(), sessionId: session().id })
  }
}
