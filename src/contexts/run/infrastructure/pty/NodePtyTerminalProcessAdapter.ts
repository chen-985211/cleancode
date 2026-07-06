import { accessSync, chmodSync, constants, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { platform } from 'node:os'
import { dirname, join } from 'node:path'

import type { IPty } from 'node-pty'
import { spawn as spawnPtyProcess } from 'node-pty'

import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  StartTerminalProcessCommand,
  TerminalProcessHandle,
  TerminalProcessPort
} from '../../application/ports/TerminalProcessPort'

const nodeRequire = createRequire(import.meta.url)

export class NodePtyTerminalProcessAdapter implements TerminalProcessPort {
  private readonly processes = new Map<string, ManagedTerminalProcess>()

  async start(command: StartTerminalProcessCommand): Promise<TerminalProcessHandle> {
    ensureNodePtySpawnHelperIsExecutable()

    const ptyProcess = spawnPtyProcess(command.shell || getDefaultShell(), [], {
      name: 'xterm-256color',
      cols: command.columns,
      rows: command.rows,
      cwd: command.workingDirectory,
      env: createProcessEnvironment()
    })

    this.processes.set(command.sessionId, { process: ptyProcess })
    ptyProcess.onData((data) => command.onOutput({ sessionId: command.sessionId, data }))
    ptyProcess.onExit((event) => {
      this.processes.delete(command.sessionId)
      command.onExit({ sessionId: command.sessionId, exitCode: event.exitCode })
    })

    return {
      processId: ptyProcess.pid
    }
  }

  write(sessionId: string, input: string): void {
    const terminalProcess = this.requireProcess(sessionId)

    terminalProcess.process.write(input)
  }

  resize(sessionId: string, columns: number, rows: number): void {
    const terminalProcess = this.requireProcess(sessionId)

    terminalProcess.process.resize(columns, rows)
  }

  stop(sessionId: string): void {
    const ptyProcess = this.processes.get(sessionId)

    if (!ptyProcess) {
      return
    }

    ptyProcess.process.kill()
    this.processes.delete(sessionId)
  }

  disposeAll(): void {
    for (const sessionId of this.processes.keys()) {
      this.stop(sessionId)
    }
  }

  private requireProcess(sessionId: string): ManagedTerminalProcess {
    const ptyProcess = this.processes.get(sessionId)

    if (!ptyProcess) {
      throw createExpectedAppError('TERMINAL_PROCESS_NOT_FOUND', 'Terminal process was not found.')
    }

    return ptyProcess
  }
}

interface ManagedTerminalProcess {
  readonly process: IPty
}

function getDefaultShell(): string {
  return platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/sh'
}

function createProcessEnvironment(): Record<string, string> {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === 'string'
    })
  )

  return {
    ...inheritedEnvironment,
    PROMPT_EOL_MARK: ''
  }
}

function ensureNodePtySpawnHelperIsExecutable(): void {
  const helperPath = resolveNodePtySpawnHelperPath()

  if (!helperPath || !existsSync(helperPath)) {
    return
  }

  try {
    accessSync(helperPath, constants.X_OK)
    return
  } catch {
    // pnpm can preserve node-pty's macOS helper without the executable bit.
  }

  try {
    chmodSync(helperPath, 0o755)
    accessSync(helperPath, constants.X_OK)
  } catch (error) {
    throw new Error(
      `Unable to prepare node-pty spawn helper at ${helperPath}: ${getErrorMessage(error)}`
    )
  }
}

function resolveNodePtySpawnHelperPath(): string | null {
  try {
    const nodePtyEntryPath = nodeRequire.resolve('node-pty')
    const nodePtyPackageDirectory = dirname(dirname(nodePtyEntryPath))

    return join(
      nodePtyPackageDirectory,
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper'
    )
      .replace('app.asar', 'app.asar.unpacked')
      .replace('node_modules.asar', 'node_modules.asar.unpacked')
  } catch {
    return null
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
