import { createRequire } from 'node:module'
import process from 'node:process'
import { TerminalPaletteCheckpoint } from '../../../../src/contexts/run/infrastructure/terminal-model/TerminalPaletteCheckpoint.ts'

const { Terminal } = createRequire(import.meta.url)('@xterm/headless')
const terminal = new Terminal({ allowProposedApi: true })
const checkpoint = new TerminalPaletteCheckpoint(terminal)
const write = (command) =>
  new Promise((resolve) => terminal.write('\x1b]' + command + '\x07', resolve))
const heap = () => {
  globalThis.gc()
  return process.memoryUsage().heapUsed
}
const color = 'rgb:1234/5678/9abc'
const indexed = process.argv[2] === 'indexed'
const colors = indexed ? 32 : 3
const tailSize = (indexed ? 0.5 : 4) * 1024 * 1024
try {
  // Warm the parser and finish each batch with a small operand so its last
  // write and the regexp engine's last match are outside the measurement.
  await write('4;255;#abc;' + 'x'.repeat(tailSize))
  await write('104;255')
  const before = heap()
  for (let i = 0; i < colors; i++) {
    const command = indexed ? '4;' + i : String(10 + i)
    await write(command + ';' + color + ';' + 'x'.repeat(tailSize))
  }
  await write('4;255;#abc')
  const after = heap()
  const saved = checkpoint.serialize().split(color).length - 1
  process.stdout.write(JSON.stringify({ saved, growth: after - before }))
} finally {
  terminal.dispose()
}
