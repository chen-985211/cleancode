import { join } from 'node:path'

export interface ResolveAppIconPathOptions {
  readonly fileExists: (path: string) => boolean
  readonly isDevelopment: boolean
  readonly mainDirectory: string
  readonly platform?: NodeJS.Platform
  readonly projectDirectory: string
}

export function resolveAppIconPath(options: ResolveAppIconPathOptions): string | undefined {
  const iconDirectory = options.isDevelopment
    ? join(options.projectDirectory, 'public')
    : join(options.mainDirectory, '..', 'renderer')
  const candidateFileNames =
    (options.platform ?? process.platform) === 'win32'
      ? ['app-icon-windows.png', 'app-icon.png']
      : ['app-icon.png']

  return candidateFileNames
    .map((fileName) => join(iconDirectory, fileName))
    .find(options.fileExists)
}
