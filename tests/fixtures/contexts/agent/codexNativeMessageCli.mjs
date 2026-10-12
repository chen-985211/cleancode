import { appendFileSync, existsSync, mkdirSync, watch, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname } from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'
import { clearTimeout, setInterval, setTimeout } from 'node:timers'
import { URL } from 'node:url'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
let descendantPid
let socketParentAlreadyExists
const report = (kind) =>
  appendFileSync(
    process.env.NATIVE_MESSAGE_REPORT,
    JSON.stringify({
      kind,
      args,
      cwd: process.cwd(),
      inherited: process.env.NATIVE_MESSAGE_SHELL_VALUE,
      pid: process.pid,
      descendantPid,
      socketParentAlreadyExists
    }) + '\n'
  )
if (args.includes('--help') && process.env.NATIVE_MESSAGE_HOLD_PROBES === '1') {
  // Keep actual probe processes alive until the launch owner explicitly shuts them down.
  report('probe')
  watch(dirname(process.env.NATIVE_MESSAGE_REPORT), () => {})
} else if (args.includes('--help') && process.env.NATIVE_MESSAGE_UNSUPPORTED === '1') {
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
  if (process.env.NATIVE_MESSAGE_REJECT_PROXY === '1') process.exit(1)
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
  const endpoint = args[args.indexOf('--listen') + 1]
  const socketPath = endpoint.slice('unix://'.length)
  socketParentAlreadyExists = existsSync(dirname(socketPath))
  if (
    process.env.NATIVE_MESSAGE_SERVER_FAILURE === '1' ||
    (process.env.NATIVE_MESSAGE_PRIVATE_DIRECTORY === '1' && socketParentAlreadyExists)
  ) {
    report('server-failed')
    const errors =
      [
        'socket directory is not private to the current user',
        process.env.CLEANCODE_MCP_TOKEN,
        process.env.CLEANCODE_CODEX_NOTIFY_TOKEN,
        process.env.NATIVE_MESSAGE_ERROR_OVERFLOW === '1' ? 'x'.repeat(100_000) : ''
      ]
        .filter(Boolean)
        .join('\n') + '\n'
    await new Promise((resolve) => process.stderr.write(errors, resolve))
    process.exit(23)
  }
  const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore'
  })
  descendantPid = descendant.pid
  if (process.env.NATIVE_MESSAGE_HOLD_SERVER === '1') {
    report('server')
    process.stdin.resume()
    setInterval(() => {}, 1000)
  } else {
    // The official CLI creates its socket parent; Windows ACL validation is simulated here.
    mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 })
    const server = createServer((socket) => socket.end())
    if (endpoint.startsWith('ws://'))
      server.listen(Number(new URL(endpoint).port), '127.0.0.1', () => report('server'))
    else if (process.platform === 'win32') {
      writeFileSync(endpoint.slice('unix://'.length), 'fixture socket')
      report('server')
      process.stdin.resume()
      setInterval(() => {}, 1000)
    } else server.listen(endpoint.slice('unix://'.length), () => report('server'))
  }
} else if (args[0] === 'queue') {
  const rejectPath = process.env.NATIVE_MESSAGE_REJECT_PATH
  const rejected =
    process.env.NATIVE_MESSAGE_REJECT === '1' || (rejectPath && existsSync(rejectPath))
  report('queue')
  // The test controls completion so a stale response cannot win a timing race.
  const gatePath = process.env.NATIVE_MESSAGE_QUEUE_GATE
  if (gatePath && existsSync(gatePath)) {
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(deadline)
        watcher.close()
        if (error) reject(error)
        else resolve()
      }
      const observe = () => {
        if (!existsSync(gatePath)) finish()
      }
      const watcher = watch(dirname(gatePath), observe)
      watcher.on('error', finish)
      const deadline = setTimeout(
        () => finish(new Error('Native queue gate was not released')),
        5_000
      )
      observe()
    })
  }
  process.exitCode = rejected ? 1 : 0
} else {
  report('tui')
  process.stdin.setRawMode?.(true)
  process.stdout.write('NATIVE_TUI_READY\n')
  process.stdin.resume()
  let input = ''
  process.stdin.on('data', (data) => {
    if (String(data).includes('\x03')) {
      process.stdout.write('NATIVE_TUI_INTERRUPTED\n')
      process.exit(0)
    }
    input += data
    process.stdout.write('NATIVE_TUI_INPUT:' + input)
  })
}
