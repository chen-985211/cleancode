import { ForegroundJob } from '../../../../src/contexts/run/domain/aggregates/ForegroundJob'

describe('terminal foreground job', () => {
  it('keeps launch exit separate from terminal exit and rejects stale events', () => {
    const job = ForegroundJob.start({
      generation: 2,
      launchId: 'launch-2',
      sessionId: 'session-1'
    })

    expect(job.markRunning({ generation: 1, launchId: 'launch-1' })).toBe(false)
    expect(job.status).toBe('launching')
    expect(job.markRunning({ generation: 2, launchId: 'launch-2' })).toBe(true)
    expect(job.recordExit({ exitCode: 130, generation: 2, launchId: 'launch-2' })).toBe(true)
    expect(job.toSnapshot()).toMatchObject({ exitCode: 130, status: 'exited' })
  })
})
