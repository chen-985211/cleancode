import { open } from 'node:fs/promises'

import type {
  AgentProviderSessionRefCodec,
  AgentRuntimeArtifact,
  AgentTelemetryContribution
} from '../../../application/ports/AgentProviderContribution'
import { createTemporaryProviderConfig } from '../shared/TemporaryProviderConfig'

export async function createProviderSessionFileReporter(
  command: Parameters<AgentTelemetryContribution['prepare']>[0],
  codec: AgentProviderSessionRefCodec,
  kind: string
): Promise<string> {
  const config = await createTemporaryProviderConfig(
    'cleancode-session-report-',
    'identity.json',
    ''
  )
  command.artifacts.track('provider-session-report-file', config)
  let sequence = 0
  let tail = Promise.resolve()
  let disposed = false
  let sampling = false
  const sample = async (): Promise<void> => {
    const file = await open(config.path, 'r').catch(() => null)
    if (!file) return
    try {
      const buffer = Buffer.alloc(8193)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      if (bytesRead === 0 || bytesRead > 8192) return
      const report = JSON.parse(buffer.toString('utf8', 0, bytesRead)) as {
        version?: unknown
        sequence?: unknown
        value?: unknown
      }
      if (
        report.version !== 1 ||
        typeof report.sequence !== 'number' ||
        !Number.isSafeInteger(report.sequence) ||
        report.sequence <= sequence
      )
        return
      const ref =
        report.value === null
          ? null
          : codec.parse({ formatVersion: 1, kind, value: report.value as string })
      sequence = report.sequence
      if (ref) command.onProviderSessionIdentified(ref)
      else command.onProviderSessionCleared?.()
    } catch {
      // Partial, invalid or unsupported reports cannot replace the current binding.
    } finally {
      await file.close()
    }
  }
  const timer = setInterval(() => {
    if (disposed || sampling) return
    sampling = true
    tail = sample()
      .catch(() => undefined)
      .finally(() => {
        sampling = false
      })
  }, 50)
  timer.unref()
  let disposal: Promise<void> | undefined
  const reporter: AgentRuntimeArtifact = {
    dispose() {
      if (disposal) return disposal
      disposed = true
      clearInterval(timer)
      disposal = tail.then(sample)
      return disposal
    }
  }
  command.artifacts.track('provider-session-report-reader', reporter)
  return config.path
}

/** Each launch owns this private transport; no Provider conversation content is copied. */
export function createSessionReportWriterSource(reportPath: string): string {
  return `
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
const reportPath = ${JSON.stringify(reportPath)};
function reportSession(value) {
  try {
    let previous = null;
    try { previous = JSON.parse(readFileSync(reportPath, 'utf8')); } catch {}
    if (previous?.version === 1 && previous.value === value) return;
    const sequence = Number.isSafeInteger(previous?.sequence) ? previous.sequence + 1 : 1;
    writeFileSync(reportPath + '.next', JSON.stringify({ version: 1, sequence, value }), { mode: 0o600 });
    renameSync(reportPath + '.next', reportPath);
  } catch { /* Reporting must never interrupt the CLI. */ }
}
`
}
