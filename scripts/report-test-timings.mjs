import { appendFile, readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const milliseconds = (value) => (Number.isFinite(value) && value >= 0 ? value : 0)
const cell = (value) =>
  String(value)
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/g, ' ')

export function summarizeTestTimingReports(reports, rootDirectory = process.cwd()) {
  const files = []
  let passed = 0
  let failed = 0
  let skipped = 0
  const phases = new Map()
  for (const report of reports) {
    if (Array.isArray(report)) {
      for (const record of report) {
        for (const name of [
          'moduleLoadMs',
          'prepareMs',
          'renderWaitMs',
          'nextFrameWaitMs',
          'readPixelsMs'
        ]) {
          phases.set(name, (phases.get(name) ?? 0) + milliseconds(record?.[name]))
        }
      }
      continue
    }
    if (!report || !Array.isArray(report.testResults)) continue
    passed += milliseconds(report.numPassedTests)
    failed += milliseconds(report.numFailedTests)
    skipped += milliseconds(report.numPendingTests)
    for (const result of report.testResults) {
      files.push({
        name: relative(rootDirectory, result.name).replaceAll('\\', '/'),
        duration: milliseconds(result.endTime - result.startTime),
        status: result.status
      })
    }
  }
  const lines = [
    '## Test timings',
    '',
    `${passed} passed; ${failed} failed; ${skipped} skipped.`,
    '',
    'File durations include test hooks and are not additive wall-clock time for parallel suites.',
    '',
    '| Slowest file | Seconds | Result |',
    '| --- | ---: | --- |'
  ]
  files.sort((left, right) => right.duration - left.duration)
  for (const file of files.slice(0, 20)) {
    lines.push(
      `| ${cell(file.name)} | ${(file.duration / 1000).toFixed(2)} | ${cell(file.status)} |`
    )
  }
  if (phases.size) {
    lines.push(
      '',
      'Raster phase totals across all recorded parameter cases:',
      '',
      '| Phase | Seconds |',
      '| --- | ---: |'
    )
    for (const [phase, duration] of phases)
      lines.push(`| ${phase} | ${(duration / 1000).toFixed(2)} |`)
  }
  return `${lines.join('\n')}\n`
}

async function main() {
  const directory = resolve(process.argv[2] ?? 'test-results/timings')
  const names = await readdir(directory).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const reports = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8')))
  )
  const summary = reports.length
    ? summarizeTestTimingReports(reports)
    : 'No test timing report was produced.\n'
  process.stdout.write(summary)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
