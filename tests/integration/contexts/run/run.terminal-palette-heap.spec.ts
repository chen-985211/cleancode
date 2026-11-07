import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const fixture = join(process.cwd(), 'tests/fixtures/contexts/run/terminalPaletteHeap.mjs')

it.each([
  ['indexed', 32],
  ['default', 3]
] as const)(
  'releases oversized OSC input while retaining %s palette assignments',
  async (kind, colors) => {
    const { stdout } = await execute(process.execPath, ['--expose-gc', fixture, kind])
    const { saved, growth } = JSON.parse(stdout)
    expect(saved).toBe(colors)
    // The inputs total 12–16 MiB. Only the short color operands belong to the checkpoint.
    expect(growth).toBeLessThan(5 * 1024 * 1024)
  },
  15000
)
