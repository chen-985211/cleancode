import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

import type { LogEvent, LogLevel, Logger } from './Logger'

const maxLogBytes = 5 * 1024 * 1024

class ConsoleLogger implements Logger {
  private filePath: string | null = null

  configureFile(path: string): void {
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      rotateLog(path)
      this.filePath = path
    } catch {
      this.filePath = null
    }
  }

  debug(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.write('debug', event)
  }

  info(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.write('info', event)
  }

  warn(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.write('warn', event)
  }

  error(event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    this.write('error', event)
  }

  private write(level: LogLevel, event: Omit<LogEvent, 'level' | 'timestamp'>): void {
    const record: LogEvent = {
      ...event,
      level,
      timestamp: new Date().toISOString()
    }
    const line = JSON.stringify(record)
    if (this.filePath) {
      try {
        if (existsSync(this.filePath) && statSync(this.filePath).size >= maxLogBytes) {
          rotateLog(this.filePath)
        }
        appendFileSync(this.filePath, `${line}\n`, { encoding: 'utf8', mode: 0o600 })
      } catch {
        // Console diagnostics remain available when the local file cannot be written.
      }
    }

    if (level === 'error') {
      console.error(line)
      return
    }

    if (level === 'warn') {
      console.warn(line)
      return
    }

    console.log(line)
  }
}

export const consoleLogger = new ConsoleLogger()

function rotateLog(path: string): void {
  for (let index = 3; index >= 1; index -= 1) {
    const source = index === 1 ? path : `${path}.${index - 1}`
    const target = `${path}.${index}`
    if (!existsSync(source)) continue
    rmSync(target, { force: true })
    renameSync(source, target)
  }
}
