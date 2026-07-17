import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FakeCodexCliFixture {
  readonly binDirectory: string
  readonly reportPath: string
}

export interface FakeCodexCliReport {
  readonly args: readonly string[]
  readonly cwd: string
  readonly kind: 'draw' | 'exit' | 'inspection' | 'session'
  readonly pid: number
  readonly sourceTheme?: 'dark' | 'light'
}

export async function installFakeCodexCli(appStateDirectory: string): Promise<FakeCodexCliFixture> {
  const fixtureDirectory = join(appStateDirectory, 'fake-codex-cli')
  const binDirectory = join(fixtureDirectory, 'bin')
  const reportPath = join(fixtureDirectory, 'reports.jsonl')
  const executablePath = join(binDirectory, 'codex')

  await mkdir(binDirectory, { recursive: true })
  await writeFile(executablePath, createFakeCodexProgram(), 'utf8')
  await chmod(executablePath, 0o755)

  return { binDirectory, reportPath }
}

export async function readFakeCodexCliReports(
  reportPath: string
): Promise<readonly FakeCodexCliReport[]> {
  try {
    const contents = await readFile(reportPath, 'utf8')

    return contents
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FakeCodexCliReport)
  } catch (error) {
    if (isMissingFileError(error)) {
      return []
    }

    throw error
  }
}

function createFakeCodexProgram(): string {
  return `#!${process.execPath}
import { appendFileSync } from 'node:fs'

const CSI = '\\x1b['
const OSC = '\\x1b]'
const ST = '\\x1b\\\\'
const args = process.argv.slice(2)
const cwd = process.cwd()
const reportPath = process.env.CLEANCODE_FAKE_CODEX_REPORT_PATH
let inputBuffer = ''
let sourceTheme = null

function report(kind) {
  if (!reportPath) return
  const entry = { args, cwd, kind, pid: process.pid }
  if (sourceTheme) entry.sourceTheme = sourceTheme
  appendFileSync(
    reportPath,
    JSON.stringify(entry) + '\\n'
  )
}

if (args.includes('--version')) {
  report('inspection')
  process.stdout.write('codex-cli fake-e2e\\n')
  process.exit(0)
}

function draw() {
  if (!sourceTheme) return
  const columns = Math.max(2, process.stdout.columns || 80)
  const rows = Math.max(2, process.stdout.rows || 24)
  const background = sourceTheme === 'light' ? '255;255;255' : '0;0;0'
  const foreground = sourceTheme === 'light' ? '0;0;0' : '255;255;255'
  const blankRow = ' '.repeat(columns - 1)
  let output = CSI + '?25l'

  for (let row = 1; row <= rows; row += 1) {
    output += CSI + row + ';1H' + CSI + '48;2;' + background + 'm' + blankRow
  }

  output +=
    CSI +
    '1;1H' +
    CSI +
    '38;2;' +
    foreground +
    'm' +
    'CC_E2E_CODEX_READY:' +
    sourceTheme +
    ':' +
    process.pid +
    CSI +
    '0m'
  process.stdout.write(output)
  report('draw')
}

function adoptReportedBackground() {
  if (sourceTheme) return
  const responsePrefix = OSC + '11;rgb:'
  const responseStart = inputBuffer.indexOf(responsePrefix)
  if (responseStart < 0) return
  const payloadStart = responseStart + responsePrefix.length
  const belIndex = inputBuffer.indexOf('\\x07', payloadStart)
  const stIndex = inputBuffer.indexOf(ST, payloadStart)
  const responseEnd = [belIndex, stIndex]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  if (responseEnd === undefined) return

  const channels = inputBuffer.slice(payloadStart, responseEnd).split('/')
  if (channels.length !== 3 || channels.some((channel) => !/^[0-9a-f]{1,4}$/i.test(channel))) {
    return
  }

  const normalizedChannels = channels.map(
    (channel) => Number.parseInt(channel, 16) / (16 ** channel.length - 1)
  )
  const luminance =
    0.2126 * normalizedChannels[0] +
    0.7152 * normalizedChannels[1] +
    0.0722 * normalizedChannels[2]
  sourceTheme = luminance >= 0.5 ? 'light' : 'dark'
  report('session')
  draw()
}

let exiting = false
function exitCleanly() {
  if (exiting) return
  exiting = true
  report('exit')
  process.stdout.write(CSI + '0m' + CSI + '?25h')
  process.exit(0)
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdout.on('resize', draw)
process.stdin.on('data', (data) => {
  if (data.includes(3)) exitCleanly()
  inputBuffer = (inputBuffer + data.toString('latin1')).slice(-4096)
  adoptReportedBackground()
})
process.on('SIGHUP', exitCleanly)
process.on('SIGINT', exitCleanly)
process.on('SIGTERM', exitCleanly)
process.stdout.write(OSC + '11;?' + '\\x07')
`
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
