import { resolve } from 'node:path'

import { summarizeTestTimingReports } from '../../../scripts/report-test-timings.mjs'

describe('test timing report', () => {
  it('preserves failed and skipped results while ordering slow files first', () => {
    const root = resolve('timing-fixture')
    const summary = summarizeTestTimingReports(
      [
        {
          numPassedTests: 2,
          numFailedTests: 1,
          numPendingTests: 3,
          testResults: [
            { name: resolve(root, 'fast.spec.ts'), startTime: 10, endTime: 20, status: 'passed' },
            { name: resolve(root, 'slow.spec.ts'), startTime: 10, endTime: 2010, status: 'failed' }
          ]
        }
      ],
      root
    )
    expect(summary).toContain('2 passed; 1 failed; 3 skipped')
    expect(summary).toContain('| slow.spec.ts | 2.00 | failed |')
    expect(summary.indexOf('slow.spec.ts')).toBeLessThan(summary.indexOf('fast.spec.ts'))
    expect(summary).not.toContain(root)
  })

  it('keeps raster phase totals separate from test results', () => {
    const summary = summarizeTestTimingReports([[{ renderWaitMs: 1000 }, { renderWaitMs: 2000 }]])
    expect(summary).toContain('0 passed; 0 failed; 0 skipped')
    expect(summary).toContain('| renderWaitMs | 3.00 |')
    expect(summary).not.toContain('NaN')
  })
})
