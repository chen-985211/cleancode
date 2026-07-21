import type { TerminalLaunchPlanPort } from '../../../src/contexts/run/application/ports/TerminalLaunchPlanPort'
import type {
  TerminalWorkflowEvent,
  TerminalWorkflowEventPublisherPort
} from '../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import type { TerminalWorkflowPlanPort } from '../../../src/contexts/run/application/ports/TerminalWorkflowPlanPort'
import type { RunLifecycleService } from '../../../src/contexts/run/application/use-cases/RunLifecycleService'
import type { ManagedServiceLauncher } from '../../../src/contexts/run/application/services/ManagedServiceLauncher'
import type { ManagedServiceOwnerResolver } from '../../../src/platform/electron-main/managedServiceOwnerResolver'
import { createRunRuntime } from '../../../src/platform/electron-main/runRuntimeComposition'

const electronMocks = vi.hoisted(() => ({
  getAllWindows: vi.fn(),
  openExternal: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: electronMocks.getAllWindows },
  shell: { openExternal: electronMocks.openExternal }
}))

describe('Run runtime composition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('injects the same lifecycle and managed launcher into terminal workflows', () => {
    const runtime = createRuntime()
    const dependencies = readWorkflowDependencies(runtime.workflow)

    expect(dependencies.lifecycle).toBe(runtime.lifecycle)
    expect(dependencies.managedServices).toBe(runtime.managedServices)
  })

  it('projects a workflow managed-port conflict to the terminal run event channel', async () => {
    const send = vi.fn()
    electronMocks.getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send } }
    ])
    const managedOwner = {
      identity: {
        projectId: 'project-owner',
        workspaceName: 'feature/api',
        blockId: 'api',
        sessionId: 'owner-session',
        runId: 'owner-run',
        generation: 3
      },
      projectName: 'Storefront',
      workspaceName: 'feature/api',
      terminalName: 'API'
    }
    const resolveManagedServiceOwner: ManagedServiceOwnerResolver = vi.fn(async () => managedOwner)
    const runtime = createRuntime(resolveManagedServiceOwner)

    readWorkflowDependencies(runtime.workflow).eventPublisher.publish(managedConflictEvent)

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(resolveManagedServiceOwner).toHaveBeenCalledWith({
      projectId: managedOwner.identity.projectId,
      projectDirectory: '/repo/storefront',
      workspaceName: managedOwner.identity.workspaceName,
      blockId: managedOwner.identity.blockId,
      sessionId: managedOwner.identity.sessionId,
      runId: managedOwner.identity.runId,
      generation: managedOwner.identity.generation
    })
    expect(send).toHaveBeenCalledWith('cleancode:terminal-run-event', {
      type: 'service-port-conflict',
      scope: attemptedIdentity,
      conflict: {
        code: 'SERVICE_PORT_FIXED_CONFLICT',
        port: 3_000,
        ownership: 'managed',
        managedOwner,
        managedLeaseState: 'bound'
      }
    })
    expect(send).not.toHaveBeenCalledWith('cleancode:terminal-workflow-event', expect.anything())
  })
})

function createRuntime(
  resolveManagedServiceOwner: ManagedServiceOwnerResolver = async () => null
): ReturnType<typeof createRunRuntime> {
  return createRunRuntime({
    appStateDirectory: '/tmp/cleancode-runtime-composition-test',
    launchPlans: unusedLaunchPlans,
    resolveManagedServiceOwner,
    scopeValidation: { validate: async () => undefined },
    workflowPlans: unusedWorkflowPlans
  })
}

function readWorkflowDependencies(workflow: unknown): {
  readonly lifecycle: RunLifecycleService | undefined
  readonly managedServices: ManagedServiceLauncher | undefined
  readonly eventPublisher: TerminalWorkflowEventPublisherPort
} {
  return workflow as {
    readonly lifecycle: RunLifecycleService | undefined
    readonly managedServices: ManagedServiceLauncher | undefined
    readonly eventPublisher: TerminalWorkflowEventPublisherPort
  }
}

const unusedLaunchPlans: TerminalLaunchPlanPort = {
  getPlan: async () => {
    throw new Error('The composition test must not request a terminal launch plan.')
  }
}

const unusedWorkflowPlans: TerminalWorkflowPlanPort = {
  buildPlan: async () => {
    throw new Error('The composition test must not request a workflow plan.')
  }
}

const attemptedIdentity = {
  projectId: 'project-attempt',
  workspaceName: 'main',
  blockId: 'web',
  sessionId: 'attempt-session',
  runId: 'attempt-run',
  generation: 2
}

const managedConflictEvent: TerminalWorkflowEvent = {
  type: 'service-port-conflict',
  failure: {
    code: 'SERVICE_PORT_FIXED_CONFLICT',
    message: 'Port 3000 is occupied.',
    details: {
      port: 3_000,
      attemptedProjectId: attemptedIdentity.projectId,
      attemptedProjectDirectory: '/repo/attempt',
      attemptedWorkspaceName: attemptedIdentity.workspaceName,
      attemptedWorkspaceDirectory: '/repo/attempt',
      attemptedGitBranch: 'main',
      attemptedBlockId: attemptedIdentity.blockId,
      attemptedSessionId: attemptedIdentity.sessionId,
      attemptedRunId: attemptedIdentity.runId,
      attemptedGeneration: attemptedIdentity.generation,
      managedProjectId: 'project-owner',
      managedProjectDirectory: '/repo/storefront',
      managedWorkspaceName: 'feature/api',
      managedWorkspaceDirectory: '/repo/storefront-api',
      managedGitBranch: 'feature/api',
      managedBlockId: 'api',
      managedSessionId: 'owner-session',
      managedRunId: 'owner-run',
      managedGeneration: 3,
      managedLeaseState: 'bound'
    }
  }
}
