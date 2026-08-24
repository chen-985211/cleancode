import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  WorkspaceExternalOpenCapabilitiesSnapshot,
  WorkspaceExternalOpenTarget
} from '../../application/dto/WorkspaceExternalOpen'
import type { WorkspaceExternalOpenPort } from '../../application/ports/WorkspaceExternalOpenPort'

interface ElectronWorkspaceExternalOpenDependencies {
  readonly getApplicationNameForProtocol: (url: string) => string
  readonly openExternal: (url: string) => Promise<void>
  readonly openPath: (path: string) => Promise<string>
}

export class ElectronWorkspaceExternalOpenAdapter implements WorkspaceExternalOpenPort {
  constructor(private readonly dependencies: ElectronWorkspaceExternalOpenDependencies) {}

  async getCapabilities(): Promise<WorkspaceExternalOpenCapabilitiesSnapshot> {
    return {
      vscode: {
        available: this.hasVsCodeProtocolHandler()
      }
    }
  }

  async open(input: {
    readonly directory: string
    readonly target: WorkspaceExternalOpenTarget
  }): Promise<void> {
    if (input.target === 'folder') {
      await this.openFolder(input.directory)
      return
    }

    await this.openVsCode(input.directory)
  }

  private async openFolder(directory: string): Promise<void> {
    let systemError: string

    try {
      systemError = await this.dependencies.openPath(directory)
    } catch {
      throw createExternalOpenFailedError('folder')
    }

    if (systemError) {
      throw createExternalOpenFailedError('folder')
    }
  }

  private async openVsCode(directory: string): Promise<void> {
    if (!this.hasVsCodeProtocolHandler()) {
      throw createExpectedAppError(
        'WORKSPACE_OPEN_TARGET_UNAVAILABLE',
        'VS Code is not registered as a protocol handler.',
        { target: 'vscode' }
      )
    }

    try {
      await this.dependencies.openExternal(createVsCodeWorkspaceUri(directory))
    } catch {
      throw createExternalOpenFailedError('vscode')
    }
  }

  private hasVsCodeProtocolHandler(): boolean {
    try {
      return this.dependencies.getApplicationNameForProtocol('vscode://').trim().length > 0
    } catch {
      return false
    }
  }
}

export function createVsCodeWorkspaceUri(
  directory: string,
  platform: NodeJS.Platform = process.platform
): string {
  const normalizedDirectory = platform === 'win32' ? directory.replaceAll('\\', '/') : directory
  const directoryWithoutTrailingSlash =
    normalizedDirectory === '/' ? normalizedDirectory : normalizedDirectory.replace(/\/+$/, '')
  const encodedDirectory = directoryWithoutTrailingSlash
    .split('/')
    .map((segment) =>
      platform === 'win32' && /^[A-Za-z]:$/.test(segment)
        ? `${segment.slice(0, 1)}:`
        : encodeURIComponent(segment)
    )
    .join('/')
  const absoluteDirectory = encodedDirectory.startsWith('/')
    ? encodedDirectory
    : `/${encodedDirectory}`
  const workspacePath = absoluteDirectory.endsWith('/')
    ? absoluteDirectory
    : `${absoluteDirectory}/`

  return `vscode://file${workspacePath}`
}

function createExternalOpenFailedError(target: WorkspaceExternalOpenTarget) {
  return createExpectedAppError(
    'WORKSPACE_EXTERNAL_OPEN_FAILED',
    'The workspace could not be opened by the operating system.',
    { target }
  )
}
