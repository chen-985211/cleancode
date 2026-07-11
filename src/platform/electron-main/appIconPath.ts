import { join } from 'node:path'

export interface ResolveAppIconPathOptions {
  readonly fileExists: (path: string) => boolean
  readonly isDevelopment: boolean
  readonly mainDirectory: string
  readonly projectDirectory: string
}

export function resolveAppIconPath(options: ResolveAppIconPathOptions): string | undefined {
  const candidatePath = options.isDevelopment
    ? join(options.projectDirectory, 'public', 'app-icon.png')
    : join(options.mainDirectory, '..', 'renderer', 'app-icon.png')

  return options.fileExists(candidatePath) ? candidatePath : undefined
}
