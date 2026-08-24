import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  WorkspaceExternalOpenCapabilitiesSnapshot,
  WorkspaceExternalOpenTarget
} from '../../application/dto/WorkspaceExternalOpen'
import type { WorkspaceExternalOpenPort } from '../../application/ports/WorkspaceExternalOpenPort'

interface ElectronWorkspaceExternalOpenDependencies {
  readonly getApplicationInfoForProtocol: (url: string) => Promise<unknown>
  readonly openExternal: (url: string) => Promise<void>
  readonly openPath: (path: string) => Promise<string>
}

export class ElectronWorkspaceExternalOpenAdapter implements WorkspaceExternalOpenPort {
  constructor(private readonly dependencies: ElectronWorkspaceExternalOpenDependencies) {}

  async getCapabilities(): Promise<WorkspaceExternalOpenCapabilitiesSnapshot> {
    try {
      await this.dependencies.getApplicationInfoForProtocol('vscode://')

      return {
        vscode: {
          available: true
        }
      }
    } catch {
      return {
        vscode: {
          available: false
        }
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
    try {
      await this.dependencies.getApplicationInfoForProtocol('vscode://')
    } catch {
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
}

export function createVsCodeWorkspaceUri(directory: string): string {
  const normalizedDirectory = directory.replaceAll('\\', '/').replace(/\/$/, '')
  const url = new URL('vscode://file')

  url.pathname = `${normalizedDirectory.startsWith('/') ? '' : '/'}${normalizedDirectory}/`

  return url.toString()
}

function createExternalOpenFailedError(target: WorkspaceExternalOpenTarget) {
  return createExpectedAppError(
    'WORKSPACE_EXTERNAL_OPEN_FAILED',
    'The workspace could not be opened by the operating system.',
    { target }
  )
}
