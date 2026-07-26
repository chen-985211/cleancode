import { mkdirSync, realpathSync } from 'node:fs'

import { configureRuntimeDataDirectories } from './runtimeDataDirectoryPolicy'

interface ElectronRuntimeDataDirectoryApp {
  readonly commandLine: {
    readonly hasSwitch: (name: string) => boolean
  }
  readonly isPackaged: boolean
  readonly getAppPath: () => string
  readonly getPath: (name: 'appData' | 'userData') => string
  readonly setPath: (name: 'sessionData' | 'userData', directory: string) => void
}

interface RuntimeDataDirectoryBootstrapOptions {
  readonly canonicalizeDirectory?: (directory: string) => string
  readonly ensureDirectory?: (directory: string) => void
  readonly platform?: NodeJS.Platform
}

export function configureElectronRuntimeDataDirectories(
  app: ElectronRuntimeDataDirectoryApp,
  options: RuntimeDataDirectoryBootstrapOptions = {}
): string {
  const hasExplicitUserDataDirectory = app.commandLine.hasSwitch('user-data-dir')
  const usesAutomaticDevelopmentProfile = !app.isPackaged && !hasExplicitUserDataDirectory
  const developmentApplicationDirectory = usesAutomaticDevelopmentProfile
    ? (options.canonicalizeDirectory ?? realpathSync.native)(app.getAppPath())
    : ''

  return configureRuntimeDataDirectories(
    {
      appDataDirectory: app.getPath('appData'),
      currentUserDataDirectory: app.getPath('userData'),
      developmentApplicationDirectory,
      hasExplicitUserDataDirectory,
      isPackaged: app.isPackaged,
      platform: options.platform ?? process.platform
    },
    {
      ensureDirectory:
        options.ensureDirectory ?? ((directory) => mkdirSync(directory, { recursive: true })),
      setElectronPath: (name, directory) => app.setPath(name, directory)
    }
  )
}
