import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const checkedExtensions = new Set(['.css', '.svg', '.ts', '.tsx'])
const ignoredDirectories = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])
const themeDeclarationPath = 'src/presentation/app-shell/styles/theme.css'
const colorLiteralPatterns = [
  /#[\da-f]{3,8}\b/i,
  /\b(?:color|hsl|hsla|hwb|lab|lch|oklab|oklch|rgb|rgba)\s*\(/i,
  /(?:[:=]\s*|["'])(?:aliceblue|aqua|black|blue|fuchsia|gray|green|lime|maroon|navy|olive|orange|purple|red|silver|teal|white|yellow)(?=[;\s}"'])/i
]

export async function collectThemeViolations({ cwd = process.cwd() } = {}) {
  const sourceDirectory = join(cwd, 'src')

  if (!existsSync(sourceDirectory)) {
    return []
  }

  return collectFiles(sourceDirectory, cwd)
    .filter(isProductionUiFile)
    .filter((filePath) => filePath !== themeDeclarationPath)
    .flatMap((filePath) => findFileViolation(cwd, filePath))
    .sort((left, right) => left.filePath.localeCompare(right.filePath))
}

export async function runThemeGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = await collectThemeViolations({ cwd })

  if (violations.length === 0) {
    logger.log('Theme rules passed.')
    return 0
  }

  logger.error('Theme rules failed. Move UI colors into the centralized theme stylesheet:')
  for (const violation of violations) {
    logger.error(
      `- ${violation.filePath}:${violation.line}: ${violation.rule} - ${violation.message}`
    )
  }

  return 1
}

function collectFiles(directory, cwd) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectFiles(absolutePath, cwd)
    }

    return entry.isFile() && checkedExtensions.has(extname(entry.name))
      ? [toPosixPath(relative(cwd, absolutePath))]
      : []
  })
}

function isProductionUiFile(filePath) {
  return (
    filePath.endsWith('.css') ||
    filePath.endsWith('.svg') ||
    filePath.startsWith('src/presentation/') ||
    filePath.includes('/presentation/') ||
    filePath.startsWith('src/platform/renderer-bootstrap/')
  )
}

function findFileViolation(cwd, filePath) {
  const source = readFileSync(join(cwd, filePath), 'utf8')
  const lines = source.split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    if (colorLiteralPatterns.some((pattern) => pattern.test(line))) {
      return [
        {
          filePath,
          line: index + 1,
          rule: 'no-ui-color-literal',
          message: 'Use a semantic --cc-* token instead of a color literal.'
        }
      ]
    }
  }

  return []
}

function toPosixPath(filePath) {
  return filePath.split(sep).join('/')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await runThemeGate()
}
