import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import { TerminalWorkflowService } from '../../../../src/contexts/run/application/use-cases/TerminalWorkflowService'
import type { WorkflowRunPlanSnapshot } from '../../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowPlanPort } from '../../../../src/contexts/run/application/ports/TerminalWorkflowPlanPort'
import type {
  TerminalWorkflowEvent,
  TerminalWorkflowEventPublisherPort
} from '../../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { TerminalSessionWorkflowRuntimeAdapter } from '../../../../src/contexts/run/infrastructure/pty/TerminalSessionWorkflowRuntimeAdapter'
import { NodeTcpReadinessAdapter } from '../../../../src/contexts/run/infrastructure/readiness/NodeTcpReadinessAdapter'
import { createE2ePrintCommand, createE2eStreamingCommand } from '../../../support/e2eTerminal'

describe('terminal workflow with real PTYs', () => {
  it('starts a dependent command only after a successful real process exit', async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-workflow-'))
    const sessions = new TerminalSessionService(new NodePtyTerminalProcessAdapter())
    const events = new RecordingEvents()
    const workflow = new TerminalWorkflowService(
      new StaticPlanPort(createPlan()),
      new TerminalSessionWorkflowRuntimeAdapter(sessions),
      new NodeTcpReadinessAdapter(),
      events
    )

    try {
      await workflow.start({
        projectId: 'project-integration',
        projectDirectory: workingDirectory,
        workspaceId: 'main',
        workspaceDirectory: workingDirectory,
        gitBranch: 'main',
        workingDirectory,
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        scope: { type: 'full' }
      })

      await waitUntil(
        () =>
          workflow.getRuns({ projectDirectory: workingDirectory, workspaceId: 'main' })[0]
            ?.status === 'succeeded'
      )

      expect(readOutput(events.events)).toContain('install-complete')
      expect(readOutput(events.events)).toContain('build-complete')
      const startedSessions = events.events.flatMap((event) =>
        event.type === 'terminal-session-started'
          ? [
              {
                blockId: event.blockId,
                sessionId: event.session.id,
                clearOutput: event.clearOutput
              }
            ]
          : []
      )
      const endedSessions = events.events.flatMap((event) =>
        event.type === 'terminal-session-ended'
          ? [{ blockId: event.blockId, sessionId: event.exit.sessionId }]
          : []
      )

      expect(startedSessions).toEqual([
        expect.objectContaining({ blockId: 'install', clearOutput: true }),
        expect.objectContaining({ blockId: 'build', clearOutput: true })
      ])
      expect(endedSessions).toEqual(
        startedSessions.map(({ blockId, sessionId }) => ({ blockId, sessionId }))
      )
    } finally {
      await sessions.stopAll()
      await rm(workingDirectory, { recursive: true, force: true })
    }
  }, 20_000)

  it('keeps disjoint long-running workflows alive and stops them by run identity', async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-concurrent-workflows-'))
    const sessions = new TerminalSessionService(new NodePtyTerminalProcessAdapter())
    const events = new RecordingEvents()
    const workflow = new TerminalWorkflowService(
      new StreamingBlockSetPlanPort(),
      new TerminalSessionWorkflowRuntimeAdapter(sessions),
      new NodeTcpReadinessAdapter(),
      events
    )
    const scope = { projectDirectory: workingDirectory, workspaceId: 'main' }
    const start = (blockId: string) =>
      workflow.start({
        projectId: 'project-integration',
        projectDirectory: workingDirectory,
        workspaceId: 'main',
        workspaceDirectory: workingDirectory,
        gitBranch: 'main',
        workingDirectory,
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        scope: { type: 'block-set', blockIds: [blockId] }
      })

    try {
      const frontend = await start('frontend')
      const backend = await start('backend')

      await waitUntil(() => workflow.getRuns(scope).every((run) => run.status === 'ready'))
      expect(workflow.getRuns(scope).map((run) => run.id)).toEqual([frontend.id, backend.id])

      await workflow.stop({ ...scope, runId: backend.id })

      expect(workflow.getRuns(scope)).toEqual([
        expect.objectContaining({ id: frontend.id, status: 'ready' }),
        expect.objectContaining({ id: backend.id, status: 'stopped' })
      ])
      const startedSessions = events.events.flatMap((event) =>
        event.type === 'terminal-session-started'
          ? [{ blockId: event.blockId, sessionId: event.session.id }]
          : []
      )
      const endedSessionIds = events.events.flatMap((event) =>
        event.type === 'terminal-session-ended' ? [event.exit.sessionId] : []
      )
      expect(endedSessionIds).toContain(
        startedSessions.find((session) => session.blockId === 'backend')?.sessionId
      )
      expect(endedSessionIds).not.toContain(
        startedSessions.find((session) => session.blockId === 'frontend')?.sessionId
      )
    } finally {
      await workflow.stopAll()
      await sessions.stopAll()
      await rm(workingDirectory, { recursive: true, force: true })
    }
  }, 20_000)
})

class StaticPlanPort implements TerminalWorkflowPlanPort {
  constructor(private readonly plan: WorkflowRunPlanSnapshot) {}

  async buildPlan(): Promise<WorkflowRunPlanSnapshot> {
    return this.plan
  }
}

class StreamingBlockSetPlanPort implements TerminalWorkflowPlanPort {
  async buildPlan(
    query: Parameters<TerminalWorkflowPlanPort['buildPlan']>[0]
  ): Promise<WorkflowRunPlanSnapshot> {
    if (query.scope.type !== 'block-set' || query.scope.blockIds.length !== 1) {
      throw new Error('Expected one exact workflow block.')
    }
    const blockId = query.scope.blockIds[0]
    return {
      graphId: 'graph-1',
      workspaceId: query.workspaceId,
      nodes: [service(blockId, createE2eStreamingCommand(`${blockId}-ready`, 25))]
    }
  }
}

class RecordingEvents implements TerminalWorkflowEventPublisherPort {
  readonly events: TerminalWorkflowEvent[] = []

  publish(event: TerminalWorkflowEvent): void {
    this.events.push(event)
  }
}

function createPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    workspaceId: 'main',
    nodes: [
      task('install', createE2ePrintCommand('install-complete')),
      task('build', createE2ePrintCommand('build-complete'), ['install'])
    ]
  }
}

function task(
  blockId: string,
  launchCommand: string,
  dependencyBlockIds: readonly string[] = []
): WorkflowRunPlanSnapshot['nodes'][number] {
  return {
    blockId,
    name: blockId,
    launchCommand,
    dependencyBlockIds,
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: 10_000 }
  }
}

function service(blockId: string, launchCommand: string): WorkflowRunPlanSnapshot['nodes'][number] {
  return {
    blockId,
    name: blockId,
    launchCommand,
    dependencyBlockIds: [],
    executionConfig: {
      mode: 'service',
      readiness: { type: 'output', text: `${blockId}-ready` },
      readinessTimeoutMs: 10_000
    }
  }
}

function readOutput(events: readonly TerminalWorkflowEvent[]): string {
  return events
    .filter((event) => event.type === 'terminal-output')
    .map((event) => event.output.data)
    .join('')
}

async function waitUntil(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()

  while (!assertion()) {
    if (Date.now() - startedAt > 15_000) {
      throw new Error('Timed out waiting for the terminal workflow.')
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
