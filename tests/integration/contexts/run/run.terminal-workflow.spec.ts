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
import { createE2ePrintCommand } from '../../../support/e2eTerminal'

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
        workspaceName: 'main',
        workspaceDirectory: workingDirectory,
        gitBranch: 'main',
        workingDirectory,
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        scope: { type: 'full' }
      })

      await waitUntil(
        () =>
          workflow.getActiveRun({ projectDirectory: workingDirectory, workspaceName: 'main' })
            ?.status === 'succeeded'
      )

      expect(readOutput(events.events)).toContain('install-complete')
      expect(readOutput(events.events)).toContain('build-complete')
      expect(
        events.events.flatMap((event) =>
          event.type === 'terminal-session-started' && !event.clearOutput ? [event.blockId] : []
        )
      ).toEqual(['install', 'build'])
    } finally {
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

class RecordingEvents implements TerminalWorkflowEventPublisherPort {
  readonly events: TerminalWorkflowEvent[] = []

  publish(event: TerminalWorkflowEvent): void {
    this.events.push(event)
  }
}

function createPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    workspaceName: 'main',
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
