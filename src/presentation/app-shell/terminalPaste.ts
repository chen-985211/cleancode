const terminalPasteMaximumBytes = 1024 * 1024
const terminalPasteChunkBytes = 32 * 1024

const bracketedPasteStart = '\u001b[200~'
const bracketedPasteEnd = '\u001b[201~'

export interface TerminalPasteAnalysis {
  readonly accepted: boolean
  readonly byteLength: number
  readonly highRisk: boolean
}

export type TerminalPasteState =
  | { readonly status: 'idle' }
  | { readonly status: 'pasting'; readonly completedBytes: number; readonly totalBytes: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed' }

interface TerminalPasteControllerOptions {
  readonly chunkBytes?: number
  readonly write: (chunk: string) => Promise<void>
  readonly onStateChange?: (state: TerminalPasteState) => void
}

interface PasteRequest {
  isCancelled: boolean
  readonly text: string
  readonly bracketedPasteMode: boolean
}

export class TerminalPasteController {
  private activeRequest: PasteRequest | null = null
  private readonly pendingRequests = new Set<PasteRequest>()
  private tail: Promise<void> = Promise.resolve()
  private readonly chunkBytes: number
  private readonly write: (chunk: string) => Promise<void>
  private readonly onStateChange: (state: TerminalPasteState) => void

  constructor(options: TerminalPasteControllerOptions) {
    this.chunkBytes = options.chunkBytes ?? terminalPasteChunkBytes
    this.write = options.write
    this.onStateChange = options.onStateChange ?? (() => undefined)
  }

  paste(text: string, options: { readonly bracketedPasteMode: boolean }): Promise<void> {
    const normalizedText = normalizeTerminalPaste(text)
    const analysis = analyzeTerminalPaste(normalizedText)
    if (!analysis.accepted) return Promise.reject(new RangeError('Terminal paste is too large.'))

    for (const pendingRequest of this.pendingRequests) pendingRequest.isCancelled = true
    this.cancel()
    const request: PasteRequest = {
      isCancelled: false,
      text: normalizedText,
      bracketedPasteMode: options.bracketedPasteMode
    }
    this.pendingRequests.add(request)
    const operation = this.tail.catch(() => undefined).then(() => this.run(request))
    this.tail = operation
    return operation
  }

  cancel(): void {
    if (this.activeRequest) this.activeRequest.isCancelled = true
  }

  private async run(request: PasteRequest): Promise<void> {
    if (request.isCancelled) {
      this.pendingRequests.delete(request)
      this.onStateChange({ status: 'cancelled' })
      return
    }
    this.activeRequest = request
    const chunks = splitTerminalPasteChunks(request.text, this.chunkBytes)
    const totalBytes = utf8ByteLength(request.text)
    let completedBytes = 0
    let bracketOpened = false
    let failure: unknown

    this.onStateChange({ status: 'pasting', completedBytes, totalBytes })
    try {
      if (request.bracketedPasteMode) {
        await this.write(bracketedPasteStart)
        bracketOpened = true
      }
      for (const chunk of chunks) {
        if (request.isCancelled) break
        await this.write(chunk)
        completedBytes += utf8ByteLength(chunk)
        this.onStateChange({ status: 'pasting', completedBytes, totalBytes })
      }
    } catch (error) {
      failure = error
    } finally {
      if (bracketOpened) {
        try {
          await this.write(bracketedPasteEnd)
        } catch (error) {
          failure ??= error
        }
      }
      if (this.activeRequest === request) this.activeRequest = null
      this.pendingRequests.delete(request)
    }

    if (failure) {
      this.onStateChange({ status: 'failed' })
      throw failure
    }
    this.onStateChange(request.isCancelled ? { status: 'cancelled' } : { status: 'idle' })
  }
}

export function analyzeTerminalPaste(text: string): TerminalPasteAnalysis {
  const byteLength = utf8ByteLength(text)
  return {
    accepted: byteLength <= terminalPasteMaximumBytes,
    byteLength,
    highRisk: containsHighRiskControlCharacter(text)
  }
}

function containsHighRiskControlCharacter(text: string): boolean {
  return [...text].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return (
      (codePoint <= 31 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13) ||
      codePoint === 127
    )
  })
}

export function splitTerminalPasteChunks(
  text: string,
  maximumBytes = terminalPasteChunkBytes
): string[] {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 4) {
    throw new RangeError('Terminal paste chunk size must hold one Unicode code point.')
  }

  const chunks: string[] = []
  let chunk = ''
  let chunkBytes = 0
  for (const character of text) {
    const characterBytes = utf8ByteLength(character)
    if (chunk && chunkBytes + characterBytes > maximumBytes) {
      chunks.push(chunk)
      chunk = ''
      chunkBytes = 0
    }
    chunk += character
    chunkBytes += characterBytes
  }
  if (chunk) chunks.push(chunk)
  return chunks
}

export function quoteTerminalFilePaths(paths: readonly string[]): string {
  return paths.map((path) => `'${path.replaceAll("'", "'\\''")}'`).join(' ')
}

function normalizeTerminalPaste(text: string): string {
  return text.replace(/\r\n|\n/gu, '\r')
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}
