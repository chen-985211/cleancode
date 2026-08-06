import type { TerminalModelCheckpoint } from '../../application/dto/TerminalModelSnapshot'
import type { SequencedTerminalOutput } from '../../application/ports/TerminalModelPort'
import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type {
  FileTerminalRecoveryStore,
  TerminalRecoveryRecord
} from '../persistence/FileTerminalRecoveryStore'

const defaultOutputBatchWindowMs = 0
const defaultCheckpointIntervalMs = 2_000

interface TerminalProviderSessionPersistenceOptions {
  readonly batchWindowMs?: number
  readonly captureCheckpoint: () => Promise<TerminalModelCheckpoint>
  readonly checkpointIntervalMs?: number
  readonly getSession: () => TerminalSessionSnapshot
  readonly instanceId: string
  readonly isRetired: () => boolean
  readonly onBackgroundError: (error: unknown) => void
  readonly store: FileTerminalRecoveryStore
}

export class TerminalProviderSessionPersistence {
  private checkpointTimer: ReturnType<typeof setTimeout> | null = null
  private outputTimer: ReturnType<typeof setTimeout> | null = null
  private pendingOutputs: SequencedTerminalOutput[] = []
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly options: TerminalProviderSessionPersistenceOptions) {}

  appendOutput(output: SequencedTerminalOutput): void {
    if (this.options.isRetired()) return
    this.pendingOutputs.push(output)
    this.scheduleOutputFlush()
    this.scheduleCheckpoint()
  }

  checkpoint(truncateOutputLog: boolean): Promise<void> {
    this.clearTimers()
    const outputs = this.takePendingOutputs()
    this.tail = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (this.options.isRetired()) return
        if (outputs.length > 0) {
          const result = await this.options.store.appendOutputs(this.options.getSession(), outputs)
          if (result === 'checkpoint-required') {
            await this.persistCheckpoint(truncateOutputLog)
            return
          }
        }
        await this.persistCheckpoint(truncateOutputLog)
      })
    return this.tail
  }

  replaceCheckpoint(model: TerminalModelCheckpoint, truncateOutputLog: boolean): Promise<void> {
    this.clearTimers()
    this.pendingOutputs = []
    this.tail = this.tail
      .catch(() => undefined)
      .then(() => this.writeCheckpoint(model, truncateOutputLog))
    return this.tail
  }

  async retire(): Promise<void> {
    this.clearTimers()
    this.pendingOutputs = []
  }

  private scheduleOutputFlush(): void {
    if (this.outputTimer) return
    this.outputTimer = setTimeout(() => {
      this.outputTimer = null
      this.queueOutputFlush()
    }, this.options.batchWindowMs ?? defaultOutputBatchWindowMs)
    this.outputTimer.unref()
  }

  private queueOutputFlush(): void {
    const outputs = this.takePendingOutputs()
    if (outputs.length === 0) return
    this.tail = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (this.options.isRetired()) return
        const result = await this.options.store.appendOutputs(this.options.getSession(), outputs)
        if (result === 'checkpoint-required') await this.persistCheckpoint(true)
      })
      .catch((error) => this.options.onBackgroundError(error))
  }

  private scheduleCheckpoint(): void {
    if (this.checkpointTimer) return
    this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = null
      void this.checkpoint(true).catch((error) => this.options.onBackgroundError(error))
    }, this.options.checkpointIntervalMs ?? defaultCheckpointIntervalMs)
    this.checkpointTimer.unref()
  }

  private async persistCheckpoint(truncateOutputLog: boolean): Promise<void> {
    if (this.options.isRetired()) return
    const checkpoint = await this.options.captureCheckpoint()
    if (this.options.isRetired()) return
    await this.writeCheckpoint(checkpoint, truncateOutputLog)
  }

  private writeCheckpoint(
    model: TerminalModelCheckpoint,
    truncateOutputLog: boolean
  ): Promise<void> {
    if (this.options.isRetired()) return Promise.resolve()
    const record: TerminalRecoveryRecord = {
      schemaVersion: 2,
      providerInstanceId: this.options.instanceId,
      updatedAt: new Date().toISOString(),
      session: this.options.getSession(),
      model
    }
    return this.options.store.writeCheckpoint(record, { truncateOutputLog })
  }

  private takePendingOutputs(): readonly SequencedTerminalOutput[] {
    const outputs = this.pendingOutputs
    this.pendingOutputs = []
    return outputs
  }

  private clearTimers(): void {
    if (this.outputTimer) clearTimeout(this.outputTimer)
    if (this.checkpointTimer) clearTimeout(this.checkpointTimer)
    this.outputTimer = null
    this.checkpointTimer = null
  }
}
