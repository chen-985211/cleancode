import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { setInterval } from 'node:timers'
import { URL } from 'node:url'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
let descendantPid
const report = (kind) =>
  appendFileSync(
    process.env.NATIVE_MESSAGE_REPORT,
    JSON.stringify({
      kind,
      args,
      cwd: process.cwd(),
      inherited: process.env.NATIVE_MESSAGE_SHELL_VALUE,
      pid: process.pid,
      descendantPid
    }) + '\n'
  )
if (args.includes('--help') && process.env.NATIVE_MESSAGE_UNSUPPORTED === '1') {
  process.stdout.write('Simulated CLI without the required capability')
} else if (args.includes('--help')) {
  process.stdout.write(
    args[1] === 'proxy'
      ? '--sock'
      : args[0] === 'queue'
        ? '--thread --message --remote --remote-auth-token-env'
        : args[0] === 'app-server'
          ? '--listen unix://PATH ws://IP:PORT --ws-auth --ws-token-sha256'
          : '--remote --remote-auth-token-env'
  )
} else if (args[1] === 'proxy') {
  if (!existsSync(args[args.indexOf('--sock') + 1])) process.exit(1)
  // Simulated proxy/control-socket protocol; Windows uses a marker, not a real AF_UNIX socket.
  process.stdin.once('data', (data) => {
    const key = /Sec-WebSocket-Key: (.+)\r/.exec(String(data))?.[1]
    if (!key) return
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')
    process.stdout.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n'
    )
  })
} else if (args[0] === 'app-server') {
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore'
  })
  descendantPid = descendant.pid
  const endpoint = args[args.indexOf('--listen') + 1]
  const server = createServer((socket) => socket.end())
  if (endpoint.startsWith('ws://'))
    server.listen(Number(new URL(endpoint).port), '127.0.0.1', () => report('server'))
  else if (process.platform === 'win32') {
    writeFileSync(endpoint.slice('unix://'.length), 'fixture socket')
    report('server')
    process.stdin.resume()
    setInterval(() => {}, 1000)
  } else server.listen(endpoint.slice('unix://'.length), () => report('server'))
} else if (args[0] === 'queue') {
  report('queue')
  process.exitCode = process.env.NATIVE_MESSAGE_REJECT === '1' ? 1 : 0
} else {
  report('tui')
  process.stdout.write('NATIVE_TUI_READY\n')
  process.stdin.resume()
  process.stdin.on('data', () => process.exit(0))
}
