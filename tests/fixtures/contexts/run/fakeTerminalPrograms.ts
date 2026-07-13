import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface MouseReport {
  readonly button: number
  readonly column: number
  readonly kind: 'down' | 'move' | 'up'
  readonly row: number
}

export async function writeFakeAgentScript(projectDirectory: string): Promise<string> {
  const scriptPath = join(projectDirectory, 'fake-agent-tui.mjs')

  await writeFile(
    scriptPath,
    `
const CSI = '\\x1b['
let resizeCount = 0

function draw(label) {
  process.stdout.write(
    \`\${CSI}H\${CSI}2JFAKE_AGENT_READY\\n\${label}\\nSIZE:\${process.stdout.columns}x\${process.stdout.rows}\\n\`
  )
}

function cleanup() {
  process.stdout.write(\`\${CSI}?1006l\${CSI}?1002l\${CSI}?1000l\${CSI}?1049l\`)
  process.exit(0)
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdout.write(\`\${CSI}?1049h\${CSI}?1000h\${CSI}?1002h\${CSI}?1006h\`)
draw('START')

process.stdout.on('resize', () => {
  resizeCount += 1
  draw(\`SIGWINCH:\${resizeCount}\`)
})

process.stdin.on('data', (data) => {
  if (data.includes(3)) cleanup()
})
`,
    'utf8'
  )

  return scriptPath
}

export async function writeMouseReporterScript(projectDirectory: string): Promise<{
  readonly reportPath: string
  readonly scriptPath: string
}> {
  const reportPath = join(projectDirectory, 'mouse-reports.jsonl')
  const scriptPath = join(projectDirectory, 'mouse-reporter.mjs')

  await writeFile(
    scriptPath,
    `
import { appendFileSync } from 'node:fs'

const CSI = '\\x1b['
const reportPath = process.argv[2]
let inputBuffer = ''
const rows = Array.from({ length: 9 }, (_, index) =>
  index === 0
    ? 'MOUSE_REPORTER_READY-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    : \`ROW_\${index + 1}-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\`
)

function cleanup() {
  process.stdout.write(\`\${CSI}?1006l\${CSI}?1002l\${CSI}?1000l\${CSI}?1049l\`)
  process.exit(0)
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdout.write(\`\${CSI}?1049h\${CSI}H\${CSI}2J\${rows.join('\\r\\n')}\`)
process.stdout.write(\`\${CSI}?1000h\${CSI}?1002h\${CSI}?1006h\`)

process.stdin.on('data', (data) => {
  if (data.includes(3)) cleanup()
  inputBuffer += data.toString('utf8')
  const pattern = /\\x1b\\[<(\\d+);(\\d+);(\\d+)([Mm])/g
  let consumed = 0

  for (const match of inputBuffer.matchAll(pattern)) {
    const button = Number(match[1])
    const suffix = match[4]
    appendFileSync(
      reportPath,
      JSON.stringify({
        button,
        column: Number(match[2]),
        kind: suffix === 'm' ? 'up' : button & 32 ? 'move' : 'down',
        row: Number(match[3])
      }) + '\\n'
    )
    consumed = (match.index ?? 0) + match[0].length
  }

  inputBuffer = inputBuffer.slice(consumed)
})
`,
    'utf8'
  )

  return { reportPath, scriptPath }
}

export async function waitForMouseReports(
  reportPath: string,
  requiredKinds: readonly MouseReport['kind'][]
): Promise<MouseReport[]> {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    const reports = await readMouseReports(reportPath)

    if (requiredKinds.every((kind) => reports.some((report) => report.kind === kind))) {
      return reports
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return readMouseReports(reportPath)
}

async function readMouseReports(reportPath: string): Promise<MouseReport[]> {
  try {
    const contents = await readFile(reportPath, 'utf8')

    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as MouseReport)
  } catch {
    return []
  }
}
