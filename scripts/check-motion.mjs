import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ignoredDirectories = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])
const registeredOwnerExceptions = new Map([
  [
    'src/presentation/app-shell/workbench/nodes/agent/agent-tool-approval.css',
    new Set(['agent-approval-intent'])
  ],
  ['src/presentation/app-shell/styles/base.css', new Set(['app-shell-layout'])],
  [
    'src/presentation/app-shell/workbench/nodes/workbench-object-motion.css',
    new Set(['workbench-object'])
  ]
])
const motionDeclarationPattern = /(?<![-\w])((?:transition|animation)(?:-[\w-]+)?)\s*:\s*([^;]+);/g
const rawDurationPattern = /(?:^|[\s,(])-?(?:\d*\.)?\d+(?:ms|s)\b/i
const rawCurvePattern =
  /\b(?:cubic-bezier|ease(?:-in(?:-out)?|-out)?|linear|steps?|step-start|step-end)\b/i

export async function collectMotionViolations({ cwd = process.cwd() } = {}) {
  const sourceDirectory = join(cwd, 'src')
  if (!existsSync(sourceDirectory)) return []

  return collectSourceFiles(sourceDirectory, cwd)
    .flatMap((filePath) => findFileViolations(cwd, filePath))
    .sort((left, right) => left.filePath.localeCompare(right.filePath) || left.line - right.line)
}

export async function runMotionGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = await collectMotionViolations({ cwd })
  if (violations.length === 0) {
    logger.log('Motion rules passed.')
    return 0
  }

  logger.error('Motion rules failed:')
  for (const violation of violations) {
    logger.error(
      `- ${violation.filePath}:${violation.line}: ${violation.rule} - ${violation.message}`
    )
  }
  return 1
}

function findFileViolations(cwd, filePath) {
  const source = readFileSync(join(cwd, filePath), 'utf8')
  const violations = Array.from(source.matchAll(/\bprefers-reduced-motion\b/gi), (match) => ({
    filePath,
    line: lineNumberAt(source, match.index),
    rule: 'system-motion-preference',
    message: 'Use the application motion rules independently of the system motion preference.'
  }))
  if (!filePath.endsWith('.css')) return violations

  for (const match of source.matchAll(motionDeclarationPattern)) {
    const declaration = match[0]
    const property = match[1]
    const value = match[2].trim()
    const index = match.index ?? 0
    if (value === 'none' || isRegisteredOwnerException(filePath, source, index)) {
      continue
    }

    const hasRawDuration = rawDurationPattern.test(value)
    const hasRawCurve = rawCurvePattern.test(value) && !isTokenizedSpinner(property, value)
    if (!hasRawDuration && !hasRawCurve) continue

    violations.push({
      filePath,
      line: lineNumberAt(source, index),
      rule: 'raw-motion-timing',
      message: `Use semantic motion tokens or a registered named owner for \`${declaration.replace(/\s+/g, ' ')}\`.`
    })
  }

  return violations
}

function isRegisteredOwnerException(filePath, source, declarationIndex) {
  const ownerMatch = source
    .slice(0, declarationIndex)
    .match(/\/\*\s*cc-motion-owner:\s*([a-z0-9-]+)\s*\*\/\s*$/i)
  const registeredOwners = registeredOwnerExceptions.get(filePath)
  return Boolean(ownerMatch?.[1] && registeredOwners?.has(ownerMatch[1]))
}

function isTokenizedSpinner(property, value) {
  return (
    property === 'animation' &&
    value.includes('var(--cc-motion-duration-spinner)') &&
    /\blinear\b/.test(value) &&
    /\binfinite\b/.test(value)
  )
}

function collectSourceFiles(directory, cwd) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : collectSourceFiles(absolutePath, cwd)
      }
      return entry.isFile() && /\.(?:css|tsx?|jsx?)$/.test(entry.name)
        ? [toPosixPath(relative(cwd, absolutePath))]
        : []
    })
    .sort()
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

function toPosixPath(filePath) {
  return filePath.split(sep).join('/')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await runMotionGate()
}
