import { WorkflowRun } from '../../../../src/contexts/run/domain/aggregates/WorkflowRun'
import type { WorkflowRunPlanSnapshot } from '../../../../src/contexts/run/domain/aggregates/WorkflowRunTypes'

describe('terminal workflow run', () => {
  it('runs roots in parallel and releases fan-in nodes only after every dependency succeeds', () => {
    const run = WorkflowRun.create(createPlan())

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
    const run = WorkflowRun.create(createPlan())
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
    const run = WorkflowRun.create(createServicePlan())

    expect(run.takeRunnableNodes().map((node) => node.blockId)).toEqual(['api'])
    run.markServiceReady('api')
    expect(run.takeRunnableNodes().map((node) => node.blockId)).toEqual(['browser'])
    run.recordProcessExit('browser', 0)

    expect(run.toSnapshot()).toMatchObject({
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
    const run = WorkflowRun.create(createServiceChainPlan())
    run.takeRunnableNodes()
    run.markServiceReady('database')
    run.takeRunnableNodes()
    run.markServiceReady('api')
    run.takeRunnableNodes()

    expect(run.getStoppableBlockIds()).toEqual(['web', 'api', 'database'])
  })

  it('treats an unexpected service exit as failure and ignores duplicate exit callbacks', () => {
    const run = WorkflowRun.create(createServicePlan())
    run.takeRunnableNodes()
    run.markServiceReady('api')

    run.recordProcessExit('api', 0)
    run.recordProcessExit('api', 0)

    expect(nodeStatuses(run)).toMatchObject({ api: 'failed', browser: 'blocked' })
    expect(run.toSnapshot().status).toBe('failed')
  })
})

function createPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    workspaceName: 'main',
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
    workspaceName: 'main',
    nodes: [service('api'), task('browser', ['api'])]
  }
}

function createServiceChainPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    workspaceName: 'main',
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
