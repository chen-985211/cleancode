import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const checkedExtensions = new Set(['.ts', '.tsx'])
const ignoredDirectories = new Set([
  'node_modules',
  'out',
  'dist',
  'dist-electron',
  'build',
  'release',
  'coverage',
  '.vite'
])

const directConsolePattern = /\bconsole\.(log|debug|info|warn|error)\s*\(/
const bareIpcMainHandlePattern = /\bipcMain\.handle\s*\(/
const rendererErrorMessageParsingPattern = /\berror\.message\.includes\s*\(/
const bareContextApplicationErrorPattern = /\bthrow\s+new\s+Error\s*\(/

export async function collectLoggingViolations({ cwd = process.cwd() } = {}) {
  const violations = []

  for (const filePath of collectSourceFiles(cwd)) {
    const absolutePath = join(cwd, filePath)
    const source = readFileSync(absolutePath, 'utf8')

    if (hasDirectConsoleViolation(filePath, source)) {
      violations.push({
        filePath,
        rule: 'no-direct-console',
        message: 'Use the platform logger instead of direct console calls in src code.'
      })
    }

    if (isElectronMainFile(filePath) && bareIpcMainHandlePattern.test(source)) {
      violations.push({
        filePath,
        rule: 'no-bare-ipc-main-handle',
        message: 'Register Electron IPC handlers through registerIpcHandler.'
      })
    }

    if (isPresentationFile(filePath) && rendererErrorMessageParsingPattern.test(source)) {
      violations.push({
        filePath,
        rule: 'no-renderer-error-message-parsing',
        message: 'Map application errors by code instead of parsing error.message.'
      })
    }

    if (
      isContextApplicationOrDomainFile(filePath) &&
      bareContextApplicationErrorPattern.test(source)
    ) {
      violations.push({
        filePath,
        rule: 'no-bare-context-application-error',
        message: 'Use AppError with a registered code in context domain and application layers.'
      })
    }
  }

  return violations
}

export async function runLoggingGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = await collectLoggingViolations({ cwd })

  if (violations.length === 0) {
    logger.log('Logging rules passed.')
    return 0
  }

  logger.error('Logging rules failed:')

  for (const violation of violations) {
    logger.error(`- ${violation.filePath}: ${violation.rule} - ${violation.message}`)
  }

  return 1
}

function collectSourceFiles(cwd) {
  const sourceDirectory = join(cwd, 'src')

  if (!existsSync(sourceDirectory)) {
    return []
  }

  return collectFiles(sourceDirectory, cwd).sort()
}

function collectFiles(directory, cwd) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...collectFiles(absolutePath, cwd))
      }

      continue
    }

    const extension = entry.name.slice(entry.name.lastIndexOf('.'))

    if (checkedExtensions.has(extension)) {
      files.push(toPosixPath(relative(cwd, absolutePath)))
    }
  }

  return files
}

function hasDirectConsoleViolation(filePath, source) {
  return (
    filePath.startsWith('src/') &&
    filePath !== 'src/platform/logging/ConsoleLogSink.ts' &&
    directConsolePattern.test(source)
  )
}

function isElectronMainFile(filePath) {
  return filePath.startsWith('src/platform/electron-main/')
}

function isPresentationFile(filePath) {
  return filePath.startsWith('src/presentation/') || filePath.includes('/presentation/')
}

function isContextApplicationOrDomainFile(filePath) {
  return /^src\/contexts\/[^/]+\/(application|domain)\//.test(filePath)
}

function toPosixPath(filePath) {
  return filePath.split(sep).join('/')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const exitCode = await runLoggingGate()

  process.exitCode = exitCode
}
