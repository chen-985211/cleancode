import type { LogEvent, LogLevel, Logger } from './Logger'

class ConsoleLogger implements Logger {
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
