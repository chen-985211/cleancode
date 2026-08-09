import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { platform } from 'node:os'
import { win32 as pathWin32 } from 'node:path'

const PWSH_ALIAS_DISCOVERY_TIMEOUT_MS = 10_000
const DEFAULT_PWSH_RESOLUTION_TTL_MS = 5 * 60_000
const DEFAULT_INBOX_POWERSHELL_RESOLUTION_TTL_MS = 30_000
const AUTOMATIC_PWSH_QUARANTINE_TTL_MS = 60_000

export interface TerminalShellExecutableResolutionOptions {
  readonly explicitShell?: string
  readonly environment?: NodeJS.ProcessEnv
  readonly isRealExecutable?: (candidate: string) => boolean
  readonly platform?: NodeJS.Platform
  readonly resolveAppExecutionAlias?: (candidate: string) => Promise<string | null> | string | null
}

interface DefaultWindowsShellResolutionCacheEntry {
  readonly promise: Promise<string>
  readonly state: {
    expiresAt: number
    resolvedExecutable: string | null
  }
  readonly token: symbol
}

let defaultWindowsShellResolution: DefaultWindowsShellResolutionCacheEntry | null = null
const automaticPowerShellExecutableQuarantine = new Map<string, number>()

export async function resolveTerminalShellExecutable(
  options: TerminalShellExecutableResolutionOptions = {}
): Promise<string> {
  if (options.explicitShell) {
    return options.explicitShell
  }

  const environment = options.environment ?? process.env
  const runtimePlatform = options.platform ?? platform()
  if (runtimePlatform !== 'win32') {
    return environment.SHELL || '/bin/sh'
  }

  const dependencies: PowerShell7ExecutableDependencies = {
    isRealExecutable: options.isRealExecutable ?? defaultIsRealExecutable,
    resolveAppExecutionAlias: options.resolveAppExecutionAlias ?? defaultResolveAppExecutionAlias
  }
  if (
    options.environment !== undefined ||
    options.isRealExecutable !== undefined ||
    options.resolveAppExecutionAlias !== undefined
  ) {
    return resolveDefaultWindowsShell(environment, dependencies)
  }

  return resolveCachedDefaultWindowsShell(environment, dependencies)
}

export function quarantineAutomaticWindowsPowerShellExecutable(executable: string): void {
  if (
    !pathWin32.isAbsolute(executable) ||
    pathWin32.basename(executable).toLowerCase() !== 'pwsh.exe'
  ) {
    return
  }

  const identity = createWindowsExecutableIdentity(executable)
  pruneExpiredAutomaticPowerShellExecutableQuarantine()
  automaticPowerShellExecutableQuarantine.set(
    identity,
    Date.now() + AUTOMATIC_PWSH_QUARANTINE_TTL_MS
  )

  if (
    defaultWindowsShellResolution?.state.resolvedExecutable &&
    createWindowsExecutableIdentity(defaultWindowsShellResolution.state.resolvedExecutable) ===
      identity
  ) {
    defaultWindowsShellResolution = null
  }
}

interface PowerShell7ExecutableDependencies {
  readonly isRealExecutable: (candidate: string) => boolean
  readonly resolveAppExecutionAlias: (candidate: string) => Promise<string | null> | string | null
}

async function resolveDefaultWindowsShell(
  environment: NodeJS.ProcessEnv,
  dependencies: PowerShell7ExecutableDependencies,
  isQuarantined: (candidate: string) => boolean = () => false
): Promise<string> {
  return (
    (await resolvePowerShell7Executable(environment, dependencies, isQuarantined)) ??
    resolveInboxWindowsPowerShellExecutable(environment)
  )
}

function resolveCachedDefaultWindowsShell(
  environment: NodeJS.ProcessEnv,
  dependencies: PowerShell7ExecutableDependencies
): Promise<string> {
  const now = Date.now()
  const cached = defaultWindowsShellResolution
  if (
    cached &&
    cached.state.expiresAt > now &&
    (!cached.state.resolvedExecutable ||
      !isAutomaticPowerShellExecutableQuarantined(cached.state.resolvedExecutable, now))
  ) {
    return cached.promise
  }

  const token = Symbol('default-windows-shell-resolution')
  const state = {
    expiresAt: Number.POSITIVE_INFINITY,
    resolvedExecutable: null as string | null
  }
  const promise = resolveDefaultWindowsShell(
    environment,
    dependencies,
    isAutomaticPowerShellExecutableQuarantined
  ).then(
    (executable) => {
      state.resolvedExecutable = executable
      state.expiresAt =
        Date.now() +
        (pathWin32.basename(executable).toLowerCase() === 'pwsh.exe'
          ? DEFAULT_PWSH_RESOLUTION_TTL_MS
          : DEFAULT_INBOX_POWERSHELL_RESOLUTION_TTL_MS)
      return executable
    },
    (error: unknown) => {
      if (defaultWindowsShellResolution?.token === token) {
        defaultWindowsShellResolution = null
      }
      throw error
    }
  )
  const entry: DefaultWindowsShellResolutionCacheEntry = {
    promise,
    state,
    token
  }
  defaultWindowsShellResolution = entry
  return promise
}

async function resolvePowerShell7Executable(
  environment: NodeJS.ProcessEnv,
  dependencies: PowerShell7ExecutableDependencies,
  isQuarantined: (candidate: string) => boolean
): Promise<string | null> {
  let appExecutionAlias: string | null = null
  for (const candidate of createPowerShell7Candidates(environment)) {
    if (isQuarantined(candidate)) continue

    if (isWindowsAppExecutionAlias(candidate)) {
      appExecutionAlias ??= candidate
      continue
    }

    if (dependencies.isRealExecutable(candidate)) {
      return candidate
    }
  }

  if (appExecutionAlias) {
    const target = await dependencies.resolveAppExecutionAlias(appExecutionAlias)
    if (
      isSafePowerShell7AliasTarget(target, dependencies.isRealExecutable) &&
      !isQuarantined(target)
    ) {
      return pathWin32.normalize(target)
    }
  }

  return null
}

function isAutomaticPowerShellExecutableQuarantined(candidate: string, now = Date.now()): boolean {
  const identity = createWindowsExecutableIdentity(candidate)
  const expiresAt = automaticPowerShellExecutableQuarantine.get(identity)
  if (!expiresAt) return false
  if (expiresAt > now) return true

  automaticPowerShellExecutableQuarantine.delete(identity)
  return false
}

function pruneExpiredAutomaticPowerShellExecutableQuarantine(now = Date.now()): void {
  for (const [identity, expiresAt] of automaticPowerShellExecutableQuarantine) {
    if (expiresAt <= now) automaticPowerShellExecutableQuarantine.delete(identity)
  }
}

function createWindowsExecutableIdentity(executable: string): string {
  return pathWin32.normalize(executable).toLowerCase()
}

function createPowerShell7Candidates(environment: NodeJS.ProcessEnv): readonly string[] {
  const candidates: string[] = []
  const seen = new Set<string>()
  const programFilesRoots = [
    readEnvironmentValue(environment, ['ProgramW6432']),
    readEnvironmentValue(environment, ['ProgramFiles']),
    readEnvironmentValue(environment, ['ProgramFiles(x86)'])
  ]

  for (const root of programFilesRoots) {
    if (root && pathWin32.isAbsolute(root)) {
      pushUniqueCandidate(candidates, seen, pathWin32.join(root, 'PowerShell', '7', 'pwsh.exe'))
    }
  }

  const localAppData = readEnvironmentValue(environment, ['LOCALAPPDATA'])
  if (localAppData && pathWin32.isAbsolute(localAppData)) {
    pushUniqueCandidate(
      candidates,
      seen,
      pathWin32.join(localAppData, 'Microsoft', 'PowerShell', '7', 'pwsh.exe')
    )
  }

  const pathValue = readEnvironmentValue(environment, ['PATH'])
  for (const rawDirectory of pathValue?.split(pathWin32.delimiter) ?? []) {
    const directory = rawDirectory.trim().replace(/^"|"$/gu, '')
    if (pathWin32.isAbsolute(directory)) {
      pushUniqueCandidate(candidates, seen, pathWin32.join(directory, 'pwsh.exe'))
    }
  }

  return candidates
}

function pushUniqueCandidate(candidates: string[], seen: Set<string>, candidate: string): void {
  const normalized = pathWin32.normalize(candidate)
  const identity = normalized.toLowerCase()
  if (seen.has(identity)) return

  seen.add(identity)
  candidates.push(normalized)
}

function isSafePowerShell7AliasTarget(
  target: string | null,
  isRealExecutable: (candidate: string) => boolean
): target is string {
  if (!target || !pathWin32.isAbsolute(target)) return false

  const normalized = pathWin32.normalize(target)
  return (
    pathWin32.basename(normalized).toLowerCase() === 'pwsh.exe' &&
    !isWindowsAppExecutionAlias(normalized) &&
    isRealExecutable(normalized)
  )
}

export function resolveInboxWindowsPowerShellExecutable(
  environment: NodeJS.ProcessEnv = process.env
): string {
  const configuredSystemRoot = readEnvironmentValue(environment, ['SystemRoot', 'WINDIR'])
  const systemRoot =
    configuredSystemRoot && pathWin32.isAbsolute(configuredSystemRoot)
      ? configuredSystemRoot
      : 'C:\\Windows'
  return pathWin32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function isWindowsAppExecutionAlias(candidate: string): boolean {
  return /[\\/]Microsoft[\\/]WindowsApps[\\/]/iu.test(pathWin32.normalize(candidate))
}

function defaultIsRealExecutable(candidate: string): boolean {
  if (isWindowsAppExecutionAlias(candidate)) return false

  try {
    if (!existsSync(candidate)) return false
    const stat = statSync(candidate)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

function defaultResolveAppExecutionAlias(candidate: string): Promise<string | null> {
  if (!isWindowsAppExecutionAlias(candidate)) return Promise.resolve(null)

  const aliasDirectory = pathWin32.dirname(candidate)
  return new Promise((resolve) => {
    execFile(
      pathWin32.basename(candidate),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '[Console]::Write($PSHOME)'],
      {
        cwd: aliasDirectory,
        encoding: 'utf8',
        env: createAppExecutionAliasDiscoveryEnvironment(aliasDirectory),
        timeout: PWSH_ALIAS_DISCOVERY_TIMEOUT_MS,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }

        const powerShellHome = stdout.trim()
        resolve(
          pathWin32.isAbsolute(powerShellHome) ? pathWin32.join(powerShellHome, 'pwsh.exe') : null
        )
      }
    )
  })
}

function createAppExecutionAliasDiscoveryEnvironment(aliasDirectory: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (name.toLowerCase() !== 'path') environment[name] = value
  }
  environment.Path = aliasDirectory
  return environment
}

function readEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  names: readonly string[]
): string | undefined {
  for (const name of names) {
    if (environment[name]) return environment[name]
  }

  const normalizedNames = new Set(names.map((name) => name.toLowerCase()))
  for (const [name, value] of Object.entries(environment)) {
    if (value && normalizedNames.has(name.toLowerCase())) return value
  }

  return undefined
}
