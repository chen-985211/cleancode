import { appendFileSync } from 'node:fs'
import { createServer } from 'node:net'
import process from 'node:process'

const args = process.argv.slice(2)
const report = (kind) => appendFileSync(process.env.NATIVE_MESSAGE_REPORT, JSON.stringify({ kind, args, cwd: process.cwd(), inherited: process.env.NATIVE_MESSAGE_SHELL_VALUE, pid: process.pid }) + '\n')
if (args[0] === 'app-server') {
  const endpoint = args[args.indexOf('--listen') + 1]
  const server = createServer(socket => socket.end())
  server.listen(endpoint.slice('unix://'.length), () => report('server'))
} else if (args[0] === 'queue') {
  report('queue')
  process.exitCode = process.env.NATIVE_MESSAGE_REJECT === '1' ? 1 : 0
} else {
  report('tui')
  process.stdout.write('NATIVE_TUI_READY\n')
  process.stdin.resume()
  process.stdin.on('data', () => process.exit(0))
}
