import { WorkflowRun } from '../../../../src/contexts/run/domain/aggregates/WorkflowRun'
import type { WorkflowRunPlanSnapshot } from '../../../../src/contexts/run/domain/aggregates/WorkflowRunTypes'

describe('terminal workflow run', () => {
  it('runs roots in parallel and releases fan-in nodes only after every dependency succeeds', () => {
    const run = WorkflowRun.create(createPlan(), workflowScope())

    expect(run.takeRunnableNodes().map((node) => node.blockId)).toEqual([
      'install-api',
      'install-web',
      'lint'
    ])
    expect(run.takeRunnableNodes()).toEqual([])

    run.recordProcessExit('install-api', 0)
    expect(run.takeRunnableNodes()).toEqual([])

    run.recordProcessExit('install-web', 0)
    expect(run.takeRunnableNodes().map((node) => node.blockId)).toEqual(['build'])

    run.recordProcessExit('build', 0)
    expect(run.takeRunnableNodes().map((node) => node.blockId)).toEqual(['test'])
  })

  it('accepts configured exit codes and blocks only descendants of a failed node', () => {
    const run = WorkflowRun.create(createPlan(), workflowScope())
    run.takeRunnableNodes()

    run.recordProcessExit('install-api', 2)

    expect(nodeStatuses(run)).toMatchObject({
      'install-api': 'succeeded',
      build: 'waiting',
      test: 'waiting',
      lint: 'running'
    })

    run.recordProcessExit('install-web', 1)

    expect(nodeStatuses(run)).toMatchObject({
      'install-web': 'failed',
      build: 'blocked',
      test: 'blocked',
      lint: 'running'
    })
    run.recordProcessExit('lint', 0)
    expect(run.toSnapshot().status).toBe('failed')
  })

  it('releases service dependents on readiness and stays ready until stopped', () => {
    const run = WorkflowRun.create(createServicePlan(), workflowScope())

    expect(run.takeRunnableNodes().map((node) => node.blockId)).toEqual(['api'])
    run.markServiceReady('api')
    expect(run.takeRunnableNodes().map((node) => node.blockId)).toEqual(['browser'])
    run.recordProcessExit('browser', 0)

    const snapshot = run.toSnapshot()
    expect(snapshot).toMatchObject({
      status: 'ready',
      nodes: [
        { blockId: 'api', status: 'ready' },
        { blockId: 'browser', status: 'succeeded' }
      ]
    })
    expect(run.getStoppableBlockIds()).toEqual(['api'])

    run.markStopped('api')
    expect(run.toSnapshot().status).toBe('stopped')
  })

  it('stops active nodes in reverse topological order', () => {
    const run = WorkflowRun.create(createServiceChainPlan(), workflowScope())
    run.takeRunnableNodes()
    run.markServiceReady('database')
    run.takeRunnableNodes()
    run.markServiceReady('api')
    run.takeRunnableNodes()

    expect(run.getStoppableBlockIds()).toEqual(['web', 'api', 'database'])
  })

  it('treats an unexpected service exit as failure and ignores duplicate exit callbacks', () => {
    const run = WorkflowRun.create(createServicePlan(), workflowScope())
    run.takeRunnableNodes()
    run.markServiceReady('api')

    run.recordProcessExit('api', 0)
    run.recordProcessExit('api', 0)

    expect(nodeStatuses(run)).toMatchObject({ api: 'failed', browser: 'blocked' })
    expect(run.toSnapshot().status).toBe('failed')
  })

  it('keeps a natural-exit cleanup failure observable on the service node', () => {
    const run = WorkflowRun.create(createServicePlan(), workflowScope())
    run.takeRunnableNodes()
    run.markServiceReady('api')
    run.recordProcessExit('api', 1)

    run.recordCleanupFailure('api', {
      code: 'SERVICE_PORT_CLEANUP_FAILED',
      message: 'Listener remained reachable after process exit.',
      details: { port: 41_001 }
    })

    expect(run.toSnapshot().nodes[0]).toMatchObject({
      status: 'failed',
      error: {
        code: 'SERVICE_PORT_CLEANUP_FAILED',
        details: { port: 41_001 }
      }
    })
  })

  it('projects exact workflow scope, actual endpoint, and structured node failures', () => {
    const run = WorkflowRun.create(createServicePlan(), workflowScope(), 'run-1')
    run.takeRunnableNodes()
    run.recordActualEndpoint('api', {
      protocol: 'http',
      host: '127.0.0.1',
      port: 41_001,
      requestedPort: 3_000,
      fallback: true,
      displayAddress: 'http://127.0.0.1:41001',
      openable: true
    })
    run.markFailed('api', {
      code: 'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED',
      message: 'Listener ownership could not be verified.'
    })

    const snapshot = run.toSnapshot()
    expect(snapshot).toMatchObject({
      id: 'run-1',
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceId: 'main',
      workspaceDirectory: '/project',
      gitBranch: 'main'
    })
    expect(snapshot.nodes.find((node) => node.blockId === 'api')).toMatchObject({
      endpoint: { port: 41_001 },
      error: { code: 'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED' }
    })
  })
})

function createPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    workspaceId: 'main',
    nodes: [
      task('install-api', [], [0, 2]),
      task('install-web'),
      task('lint'),
      task('build', ['install-api', 'install-web']),
      task('test', ['build'])
    ]
  }
}

function createServicePlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    workspaceId: 'main',
    nodes: [service('api'), task('browser', ['api'])]
  }
}

function createServiceChainPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    workspaceId: 'main',
    nodes: [service('database'), service('api', ['database']), service('web', ['api'])]
  }
}

function task(
  blockId: string,
  dependencyBlockIds: readonly string[] = [],
  successExitCodes: readonly number[] = [0]
): WorkflowRunPlanSnapshot['nodes'][number] {
  return {
    blockId,
    name: blockId,
    launchCommand: `run ${blockId}`,
    dependencyBlockIds,
    executionConfig: { mode: 'task', successExitCodes, timeoutMs: null }
  }
}

function service(
  blockId: string,
  dependencyBlockIds: readonly string[] = []
): WorkflowRunPlanSnapshot['nodes'][number] {
  return {
    blockId,
    name: blockId,
    launchCommand: `run ${blockId}`,
    dependencyBlockIds,
    executionConfig: {
      mode: 'service',
      readiness: { type: 'output', text: 'ready' },
      readinessTimeoutMs: 30_000
    }
  }
}

function nodeStatuses(run: WorkflowRun): Record<string, string> {
  return Object.fromEntries(run.toSnapshot().nodes.map((node) => [node.blockId, node.status]))
}

function workflowScope() {
  return {
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main'
  }
}
