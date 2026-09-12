import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

export const defaultMaxLines = 700

const codeDirectories = ['src', 'tests', 'scripts']
const codeExtensions = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx'
])
const ignoredPathParts = new Set(['.git', 'node_modules', 'out', 'dist', 'coverage'])

export function countTextLines(text) {
  if (text.length === 0) {
    return 0
  }

  const normalizedText = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const trailingNewlineOffset = normalizedText.endsWith('\n') ? 1 : 0

  return normalizedText.split('\n').length - trailingNewlineOffset
}

export function isCodeFile(filePath) {
  const parts = filePath.split(/[\\/]/)

  return (
    parts.every((part) => !ignoredPathParts.has(part)) &&
    codeDirectories.includes(parts[0] ?? '') &&
    codeExtensions.has(extname(filePath))
  )
}

export function collectLineViolations(
  filePaths,
  { cwd = process.cwd(), maxLines = defaultMaxLines } = {}
) {
  const uniqueFilePaths = Array.from(new Set(filePaths))
    .filter(isCodeFile)
    .filter((filePath) => existsSync(join(cwd, filePath)))
    .sort()

  return uniqueFilePaths
    .map((filePath) => {
      const text = readFileSync(join(cwd, filePath), 'utf8')

      return {
        filePath,
        lineCount: countTextLines(text)
      }
    })
    .filter((entry) => entry.lineCount > maxLines)
}

export function listAllCodeFiles(cwd = process.cwd()) {
  return codeDirectories.flatMap((directory) => listCodeFilesInDirectory(cwd, directory))
}

export function listChangedCodeFiles(cwd = process.cwd()) {
  const changedFiles = runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'], cwd)
  const untrackedFiles = runGit(['ls-files', '--others', '--exclude-standard'], cwd)

  return [...changedFiles, ...untrackedFiles].filter(isCodeFile)
}

export function runLineGate(argv = process.argv.slice(2), cwd = process.cwd(), logger = console) {
  const shouldCheckAll = argv.includes('--all')
  const maxLines = readMaxLines(argv)
  const filePaths = shouldCheckAll ? listAllCodeFiles(cwd) : listChangedCodeFiles(cwd)
  const violations = collectLineViolations(filePaths, { cwd, maxLines })

  if (violations.length === 0) {
    const checkedScope = shouldCheckAll ? 'All code files' : 'Changed code files'
    const emptyScope = shouldCheckAll ? 'No code files' : 'No changed code files'

    logger.log(
      filePaths.length === 0
        ? `${emptyScope} to check for the ${maxLines}-line limit.`
        : `${checkedScope} stay within the ${maxLines}-line limit.`
    )
    return 0
  }

  logger.error(
    `Code files must stay within ${maxLines} lines. Split these files before committing:`
  )
  for (const violation of violations) {
    logger.error(`- ${violation.filePath}: ${violation.lineCount} lines`)
  }
  logger.error(
    [
      '',
      'Required action for the coding agent:',
      'Treat this failure as a refactoring task to complete now. Do not stop after reporting it or only propose a split.',
      '1. Read each listed file and its callers/tests. Follow AGENTS.md routing and docs/engineering/development.md for the affected paths and change risk.',
      '2. Identify cohesive responsibilities and actively extract them into clearly named modules in the appropriate context and layer. Preserve behavior, public contracts and dependency direction; avoid circular imports.',
      `3. Update imports and affected tests. Keep every resulting file within ${maxLines} lines, including newly extracted modules.`,
      '4. Do not bypass this gate by raising the limit, adding exclusions, moving code outside checked directories, deleting behavior/tests, or compressing code/removing readable formatting just to reduce line count.',
      `5. Run the affected tests, then node scripts/check-max-lines.mjs --all --max-lines ${maxLines}, and rerun the failed parent gate (if any). Fix remaining failures before resuming the original task.`,
      'Report the responsibility split and verification results when finished. If genuinely blocked, explain the concrete blocker and required next action.',
      'Rule owner: docs/engineering/development.md (quality gates and file size).'
    ].join('\n')
  )

  return 1
}

function listCodeFilesInDirectory(cwd, directory) {
  const absoluteDirectory = join(cwd, directory)

  if (!existsSync(absoluteDirectory)) {
    return []
  }

  return listFilesRecursively(absoluteDirectory).map((filePath) => relative(cwd, filePath))
}

function listFilesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)

    if (ignoredPathParts.has(entry.name)) {
      return []
    }

    if (entry.isDirectory()) {
      return listFilesRecursively(entryPath)
    }

    return entry.isFile() ? [entryPath] : []
  })
}

function readMaxLines(argv) {
  const maxFlagIndex = argv.indexOf('--max-lines')

  if (maxFlagIndex === -1) {
    return defaultMaxLines
  }

  const rawValue = argv[maxFlagIndex + 1]
  const maxLines = Number(rawValue)

  if (!Number.isInteger(maxLines) || maxLines <= 0) {
    throw new Error(`--max-lines must be a positive integer, got: ${rawValue ?? ''}`)
  }

  return maxLines
}

function runGit(args, cwd) {
  try {
    const output = execFileSync('git', args, { cwd, encoding: 'utf8' })

    return output.split('\n').filter(Boolean)
  } catch {
    return listAllCodeFiles(cwd)
  }
}

const isExecutedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isExecutedDirectly) {
  process.exitCode = runLineGate()
}
