import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

const nodeRequire = createRequire(import.meta.url)
const agentPath = nodeRequire.resolve('node-pty/lib/windowsPtyAgent')
const agentRequire = createRequire(agentPath)

describe('patched node-pty Windows input failure isolation', () => {
  it('closes only the affected PTY when an input write fails before native exit', () => {
    const harness = createInputFailureHarness()
    const affected = harness.spawn()
    const unrelated = harness.spawn()

    expect(() => affected.input.emit('error', writeError())).not.toThrow()
    expect(harness.nativeKill).toHaveBeenCalledExactlyOnceWith(affected.id, true)
    expect(affected.input.destroy).toHaveBeenCalledOnce()
    expect(affected.worker.dispose).toHaveBeenCalledOnce()
    expect(unrelated.input.destroy).not.toHaveBeenCalled()
    expect(unrelated.worker.dispose).not.toHaveBeenCalled()

    affected.exit(7)
    expect(affected.onExit).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('consumes delayed write errors after natural exit without killing again', () => {
    const harness = createInputFailureHarness()
    const terminal = harness.spawn()
    terminal.exit(0)

    expect(() => terminal.input.emit('error', writeError())).not.toThrow()
    expect(harness.nativeKill).not.toHaveBeenCalled()
    expect(terminal.onExit).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('does not repeat explicit shutdown for late input errors', () => {
    const harness = createInputFailureHarness()
    const terminal = harness.spawn()
    terminal.agent.kill()

    expect(() => terminal.input.emit('error', writeError())).not.toThrow()
    expect(harness.nativeKill).toHaveBeenCalledExactlyOnceWith(terminal.id, true)
    expect(terminal.worker.dispose).toHaveBeenCalledOnce()
  })
})

function writeError() {
  return Object.assign(new Error('write EAGAIN'), { code: 'EAGAIN' })
}

function createInputFailureHarness() {
  const inputs: FakeSocket[] = []
  const workers: FakeConoutConnection[] = []
  const exits = new Map<number, (code: number) => void>()
  const nativeKill = vi.fn()
  let nextId = 0
  class FakeSocket extends EventEmitter {
    readonly destroy = vi.fn()
    readonly setEncoding = vi.fn()
    constructor(options?: { writable?: boolean }) {
      super()
      if (options?.writable) inputs.push(this)
    }
  }
  class FakeConoutConnection {
    readonly dispose = vi.fn()
    readonly onReady = vi.fn()
    constructor() {
      workers.push(this)
    }
  }
  const native = {
    kill: nativeKill,
    startProcess: () => ({ pty: ++nextId, fd: 1, conin: 'input', conout: 'output' }),
    connect: (
      id: number,
      _command: string,
      _cwd: string,
      _env: string[],
      _dll: boolean,
      exit: (code: number) => void
    ) => {
      exits.set(id, exit)
      return { pid: id }
    }
  }
  const exports = {} as {
    WindowsPtyAgent: new (...args: unknown[]) => {
      kill(): void
      onProcessExit(listener: (code: number) => void): void
      readonly pty: number
    }
  }
  runInNewContext(readFileSync(agentPath, 'utf8'), {
    exports,
    require: (id: string) => {
      switch (id) {
        case 'net':
          return { Socket: FakeSocket }
        case 'fs':
          return { openSync: () => 1 }
        case 'os':
          return { release: () => '10.0.22621' }
        case './utils':
          return { loadNativeModule: () => ({ module: native }) }
        case './windowsConoutConnection':
          return { ConoutConnection: FakeConoutConnection }
        default:
          return agentRequire(id)
      }
    }
  })
  return {
    nativeKill,
    spawn: () => {
      const agent = new exports.WindowsPtyAgent('shell', [], [], '.', 80, 24, false, true, true)
      const onExit = vi.fn()
      agent.onProcessExit(onExit)
      return {
        agent,
        id: agent.pty,
        input: inputs.at(-1)!,
        worker: workers.at(-1)!,
        onExit,
        exit: exits.get(agent.pty)!
      }
    }
  }
}
