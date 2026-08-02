export const windowsAgentShellReadyDeadlineMs = 15_000
export const windowsAgentShellReadyMarker = '\x1b]633;CLEANCODE_SHELL_READY\x07'
export const windowsAgentShellReadyCommand = [
  'function global:prompt {',
  "[Console]::Write(([char]27) + ']633;CLEANCODE_SHELL_READY' + ([char]7));",
  "return 'PS ' + $executionContext.SessionState.Path.CurrentLocation + '> '",
  '}'
].join(' ')

type WindowsAgentShellReadinessPhase = 'waiting' | 'ready' | 'exited' | 'deadlineExceeded'

export interface WindowsAgentShellReadinessSnapshot {
  readonly elapsedMs: number
  readonly markerMatchBytes: number
  readonly phase: WindowsAgentShellReadinessPhase
  readonly receivedOutputBytes: number
}

interface WindowsAgentShellReadinessOptions {
  readonly deadlineMs: number
}

export class WindowsAgentShellReadiness {
  private readonly deadlineMs: number
  private readonly outcome: Promise<void>
  private readonly startedAt = Date.now()
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined
  private markerMatchBytes = 0
  private outputTail = ''
  private phase: WindowsAgentShellReadinessPhase = 'waiting'
  private receivedOutputBytes = 0
  private rejectOutcome: (error: Error) => void = () => undefined
  private resolveOutcome: () => void = () => undefined

  constructor(options: WindowsAgentShellReadinessOptions) {
    this.deadlineMs = Math.max(1, options.deadlineMs)
    this.outcome = new Promise<void>((resolve, reject) => {
      this.resolveOutcome = resolve
      this.rejectOutcome = reject
    })
    this.deadlineTimer = setTimeout(() => {
      this.fail(
        'deadlineExceeded',
        `Windows Agent shell did not become ready for interactive input; ${this.describeState()}`
      )
    }, this.deadlineMs)
  }

  acceptOutput(data: string): void {
    if (this.phase !== 'waiting') return

    this.receivedOutputBytes += Buffer.byteLength(data)
    const candidate = this.outputTail + data
    if (candidate.includes(windowsAgentShellReadyMarker)) {
      this.markerMatchBytes = Buffer.byteLength(windowsAgentShellReadyMarker)
      this.completeReady()
      return
    }

    this.outputTail = candidate.slice(-(windowsAgentShellReadyMarker.length - 1))
    this.markerMatchBytes = matchingMarkerPrefixLength(this.outputTail)
  }

  acceptExit(): void {
    this.fail(
      'exited',
      `Windows Agent shell exited before its interactive prompt became ready; ${this.describeState()}`
    )
  }

  snapshot(): WindowsAgentShellReadinessSnapshot {
    return {
      elapsedMs: Date.now() - this.startedAt,
      markerMatchBytes: this.markerMatchBytes,
      phase: this.phase,
      receivedOutputBytes: this.receivedOutputBytes
    }
  }

  waitForReady(): Promise<void> {
    return this.outcome
  }

  private completeReady(): void {
    if (this.phase !== 'waiting') return

    this.phase = 'ready'
    this.clearDeadline()
    this.resolveOutcome()
  }

  private fail(
    phase: Extract<WindowsAgentShellReadinessPhase, 'deadlineExceeded' | 'exited'>,
    message: string
  ): void {
    if (this.phase !== 'waiting') return

    this.phase = phase
    this.clearDeadline()
    this.rejectOutcome(new Error(message))
  }

  private clearDeadline(): void {
    if (!this.deadlineTimer) return

    clearTimeout(this.deadlineTimer)
    this.deadlineTimer = undefined
  }

  private describeState(): string {
    return [
      `deadlineMs=${this.deadlineMs}`,
      `elapsedMs=${Date.now() - this.startedAt}`,
      `receivedOutputBytes=${this.receivedOutputBytes}`,
      `markerMatchBytes=${this.markerMatchBytes}`
    ].join(', ')
  }
}

function matchingMarkerPrefixLength(outputTail: string): number {
  const maximumLength = Math.min(outputTail.length, windowsAgentShellReadyMarker.length - 1)

  for (let length = maximumLength; length > 0; length -= 1) {
    if (outputTail.endsWith(windowsAgentShellReadyMarker.slice(0, length))) return length
  }

  return 0
}
