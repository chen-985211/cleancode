import { basename, join } from 'node:path'
import type { SaveDialogOptions } from 'electron'

import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import {
  applicationDiagnosticsChannels,
  isApplicationDiagnosticsExportCommand,
  type ApplicationDiagnosticsExportResult,
  type ApplicationDiagnosticsFailureSummary,
  type ApplicationDiagnosticsSummary
} from '../ipc/applicationDiagnosticsChannels'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import type { ApplicationDiagnosticsSnapshot } from './applicationDiagnostics'

interface ApplicationDiagnosticsSaveDialogResult {
  readonly canceled: boolean
  readonly filePath?: string
}

export function registerApplicationDiagnosticsIpc(input: {
  readonly collect: (generatedAt: string) => Promise<ApplicationDiagnosticsSnapshot>
  readonly defaultDirectory: string
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly now?: () => Date
  readonly resolveTarget: (event: unknown) => unknown | null
  readonly showSaveDialog: (
    target: unknown,
    options: SaveDialogOptions
  ) => Promise<ApplicationDiagnosticsSaveDialogResult>
  readonly write: (path: string, snapshot: ApplicationDiagnosticsSnapshot) => Promise<void>
}): void {
  const now = input.now ?? (() => new Date())
  registerIpcHandler<undefined, ApplicationDiagnosticsSummary>({
    channel: applicationDiagnosticsChannels.getSummary,
    handler: async (command) => {
      if (command !== undefined) throw invalidDiagnosticsCommand()
      const generatedAt = now().toISOString()
      return createApplicationDiagnosticsSummary(await input.collect(generatedAt))
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'getApplicationDiagnosticsSummary',
    scope: 'platform.application-diagnostics'
  })
  registerIpcHandler<unknown, ApplicationDiagnosticsExportResult>({
    channel: applicationDiagnosticsChannels.export,
    handler: async (command, event) => {
      if (!isApplicationDiagnosticsExportCommand(command)) throw invalidDiagnosticsCommand()
      const target = input.resolveTarget(event)
      if (!target) throw invalidDiagnosticsCommand()
      const generatedAt = now().toISOString()
      const dialogResult = await input.showSaveDialog(target, {
        buttonLabel: command.buttonLabel,
        defaultPath: join(input.defaultDirectory, createDiagnosticFileName(generatedAt)),
        filters: [{ extensions: ['json'], name: 'JSON' }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        title: command.dialogTitle
      })
      if (dialogResult.canceled || !dialogResult.filePath) return { status: 'cancelled' }
      const snapshot = await input.collect(generatedAt)
      await input.write(dialogResult.filePath, snapshot)
      return { fileName: basename(dialogResult.filePath), status: 'saved' }
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'exportApplicationDiagnostics',
    scope: 'platform.application-diagnostics',
    successLogLevel: 'info'
  })
}

function createApplicationDiagnosticsSummary(
  snapshot: ApplicationDiagnosticsSnapshot
): ApplicationDiagnosticsSummary {
  return {
    application: snapshot.application,
    collection: snapshot.collection,
    generatedAt: snapshot.generatedAt,
    recentFailures: snapshot.logs.filter(isFailureRecord).slice(-10).map(toFailureSummary),
    runtime: snapshot.runtime,
    schemaVersion: 1
  }
}

function isFailureRecord(record: ApplicationDiagnosticsSnapshot['logs'][number]): boolean {
  return (
    record.level === 'warn' ||
    record.level === 'error' ||
    (record.source === 'terminal-provider' && /error|fail/i.test(record.event ?? ''))
  )
}

function toFailureSummary(
  record: ApplicationDiagnosticsSnapshot['logs'][number]
): ApplicationDiagnosticsFailureSummary {
  return compactRecord({
    correlationId: record.correlationId,
    errorCode: record.error?.code,
    event: record.event,
    level: record.level === 'warn' || record.level === 'error' ? record.level : undefined,
    operation: record.operation,
    scope: record.scope,
    source: record.source,
    timestamp: record.timestamp
  })
}

function createDiagnosticFileName(generatedAt: string): string {
  const compactTimestamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')
  return `cleancode-diagnostics-${compactTimestamp.replace('T', '-')}.json`
}

function invalidDiagnosticsCommand() {
  return createExpectedAppError(
    'INVALID_IPC_COMMAND',
    'Invalid application diagnostics IPC command.'
  )
}

function compactRecord<TRecord extends Record<string, unknown>>(record: TRecord): TRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  ) as TRecord
}
