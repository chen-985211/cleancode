import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { OpenTerminalLinkCommand, TerminalLinkOpenResult } from '../dto/TerminalLink'
import type {
  TerminalLinkContextPort,
  TerminalLinkFileSystemPort,
  TerminalLinkOpenerPort
} from '../ports/TerminalLinkPorts'

export class OpenTerminalLinkUseCase {
  constructor(
    private readonly contexts: TerminalLinkContextPort,
    private readonly files: TerminalLinkFileSystemPort,
    private readonly opener: TerminalLinkOpenerPort
  ) {}

  async execute(command: OpenTerminalLinkCommand): Promise<TerminalLinkOpenResult> {
    const target = command.rawTarget.trim()
    const externalAddress = readExternalAddress(target)
    if (externalAddress) {
      try {
        await this.opener.openExternal(externalAddress)
      } catch {
        throw createExpectedAppError(
          'TERMINAL_LINK_NOT_OPENABLE',
          'The terminal link could not be opened.'
        )
      }
      return { kind: 'external', target: externalAddress }
    }

    if (hasUriScheme(target)) {
      throw createExpectedAppError(
        'TERMINAL_LINK_NOT_ALLOWED',
        'Only HTTP and HTTPS terminal links can be opened.'
      )
    }

    const localTarget = readLocalTarget(target)
    if (!localTarget) {
      throw createExpectedAppError(
        'TERMINAL_LINK_NOT_ALLOWED',
        'The terminal link is not an allowed local path.'
      )
    }

    const context = await this.contexts.getTerminalLinkContext(command)
    let resolved
    try {
      resolved = await this.files.resolve({
        ...context,
        rawPath: localTarget.path
      })
    } catch {
      throw createExpectedAppError(
        'TERMINAL_LINK_NOT_FOUND',
        'The local terminal link no longer exists.'
      )
    }

    if (resolved.relativeSegments[0] === '..' || resolved.kind === 'other') {
      throw createExpectedAppError(
        'TERMINAL_LINK_NOT_ALLOWED',
        'The local terminal link is outside the current workspace.'
      )
    }

    const openCommand = {
      path: resolved.canonicalPath,
      ...(resolved.kind === 'file' && localTarget.line ? { line: localTarget.line } : {}),
      ...(resolved.kind === 'file' && localTarget.column ? { column: localTarget.column } : {})
    }
    try {
      await this.opener.openLocal(openCommand)
    } catch {
      throw createExpectedAppError(
        'TERMINAL_LINK_NOT_OPENABLE',
        'The local terminal link could not be opened.'
      )
    }

    return { kind: 'local', target: resolved.canonicalPath, ...localTarget.position }
  }
}

function readExternalAddress(target: string): string | null {
  try {
    const address = new URL(target)
    return address.protocol === 'http:' || address.protocol === 'https:' ? address.toString() : null
  } catch {
    return null
  }
}

function hasUriScheme(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/iu.test(target)
}

function readLocalTarget(target: string): {
  readonly path: string
  readonly line?: number
  readonly column?: number
  readonly position: {
    readonly line?: number
    readonly column?: number
  }
} | null {
  if (containsControlCharacter(target)) return null
  const withoutQuotes = target.replace(/^["'`](.*)["'`]$/u, '$1')
  const withLineAndColumn = /^(.*):(\d+):(\d+)$/u.exec(withoutQuotes)
  const withLine = withLineAndColumn ? null : /^(.*):(\d+)$/u.exec(withoutQuotes)
  const path = (withLineAndColumn?.[1] ?? withLine?.[1] ?? withoutQuotes).trim()
  if (!isRecognizableLocalPath(path)) return null

  const line = readPositiveInteger(withLineAndColumn?.[2] ?? withLine?.[2])
  const column = readPositiveInteger(withLineAndColumn?.[3])
  if ((withLineAndColumn || withLine) && !line) return null
  if (withLineAndColumn && !column) return null
  const position = { ...(line ? { line } : {}), ...(column ? { column } : {}) }
  return { path, ...position, position }
}

function containsControlCharacter(target: string): boolean {
  return [...target].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

function isRecognizableLocalPath(path: string): boolean {
  return (
    path.startsWith('/') ||
    path.startsWith('./') ||
    path.startsWith('../') ||
    path.includes('/') ||
    path.includes('\\')
  )
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}
