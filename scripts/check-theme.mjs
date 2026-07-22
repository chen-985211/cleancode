import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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
const terminalPaletteGeneratedPath = 'src/contexts/run/application/dto/TerminalPalette.generated.ts'
const terminalPaletteThemes = ['light', 'dark']
const terminalPaletteProperties = [
  ['background', 'background'],
  ['foreground', 'foreground'],
  ['cursor', 'cursor'],
  ['selectionBackground', 'selection'],
  ['black', 'black'],
  ['red', 'red'],
  ['green', 'green'],
  ['yellow', 'yellow'],
  ['blue', 'blue'],
  ['magenta', 'magenta'],
  ['cyan', 'cyan'],
  ['white', 'white'],
  ['brightBlack', 'bright-black'],
  ['brightRed', 'bright-red'],
  ['brightGreen', 'bright-green'],
  ['brightYellow', 'bright-yellow'],
  ['brightBlue', 'bright-blue'],
  ['brightMagenta', 'bright-magenta'],
  ['brightCyan', 'bright-cyan'],
  ['brightWhite', 'bright-white']
]
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

export async function collectTerminalPaletteViolations({ cwd = process.cwd() } = {}) {
  const themePath = join(cwd, themeDeclarationPath)
  const generatedPath = join(cwd, terminalPaletteGeneratedPath)
  if (!existsSync(themePath)) return []

  let expected
  try {
    expected = createTerminalPaletteModule(readFileSync(themePath, 'utf8'))
  } catch (error) {
    return [
      {
        filePath: themeDeclarationPath,
        line: 1,
        rule: 'terminal-palette-source',
        message: error instanceof Error ? error.message : String(error)
      }
    ]
  }

  if (existsSync(generatedPath) && readFileSync(generatedPath, 'utf8') === expected) return []

  return [
    {
      filePath: terminalPaletteGeneratedPath,
      line: 1,
      rule: 'terminal-palette-generated',
      message:
        'Regenerate the canonical terminal palette with `node scripts/check-theme.mjs --write-terminal-palette`.'
    }
  ]
}

export function createTerminalPaletteModule(themeSource) {
  assertTerminalPaletteAliases(themeSource)
  const palettes = Object.fromEntries(
    terminalPaletteThemes.map((theme) => [
      theme,
      Object.fromEntries(
        terminalPaletteProperties.map(([property, cssSuffix]) => [
          property,
          readTerminalPaletteValue(themeSource, theme, cssSuffix)
        ])
      )
    ])
  )
  const lines = [
    '/**',
    ` * Generated from ${themeDeclarationPath}.`,
    ' * Do not edit by hand; run `node scripts/check-theme.mjs --write-terminal-palette`.',
    ' */',
    'export const canonicalTerminalPalettes = {'
  ]

  for (const [themeIndex, theme] of terminalPaletteThemes.entries()) {
    lines.push(`  ${theme}: {`)
    for (const [propertyIndex, [property]] of terminalPaletteProperties.entries()) {
      const suffix = propertyIndex === terminalPaletteProperties.length - 1 ? '' : ','
      lines.push(`    ${property}: '${palettes[theme][property]}'${suffix}`)
    }
    lines.push(themeIndex === terminalPaletteThemes.length - 1 ? '  }' : '  },')
  }
  lines.push('} as const', '')
  return lines.join('\n')
}

function assertTerminalPaletteAliases(source) {
  for (const theme of terminalPaletteThemes) {
    for (const [, cssSuffix] of terminalPaletteProperties) {
      const pattern = new RegExp(
        `--cc-terminal-${cssSuffix}\\s*:\\s*var\\(\\s*--cc-terminal-${theme}-${cssSuffix}\\s*\\)\\s*;`,
        'g'
      )
      if ([...source.matchAll(pattern)].length !== 1) {
        throw new Error(`Expected exactly one ${theme} terminal ${cssSuffix} alias.`)
      }
    }
  }
}

export function writeTerminalPaletteModule({ cwd = process.cwd() } = {}) {
  const themePath = join(cwd, themeDeclarationPath)
  const generatedPath = join(cwd, terminalPaletteGeneratedPath)
  const generated = createTerminalPaletteModule(readFileSync(themePath, 'utf8'))
  writeFileSync(generatedPath, generated, 'utf8')
}

export async function runThemeGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = [
    ...(await collectThemeViolations({ cwd })),
    ...(await collectTerminalPaletteViolations({ cwd }))
  ]

  if (violations.length === 0) {
    logger.log('Theme rules passed.')
    return 0
  }

  logger.error('Theme rules failed:')
  for (const violation of violations) {
    logger.error(
      `- ${violation.filePath}:${violation.line}: ${violation.rule} - ${violation.message}`
    )
  }

  return 1
}

function readTerminalPaletteValue(source, theme, cssSuffix) {
  const property = `--cc-terminal-${theme}-${cssSuffix}`
  const pattern = new RegExp(`${property}\\s*:\\s*([^;]+);`, 'g')
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${property} declaration.`)
  }
  const value = matches[0][1]?.trim() ?? ''
  if (!/^#[\da-f]{6}$/i.test(value)) {
    throw new Error(`${property} must be a six-digit hexadecimal color.`)
  }
  return value.toLowerCase()
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
  if (process.argv.includes('--write-terminal-palette')) {
    writeTerminalPaletteModule()
    console.log(`Generated ${terminalPaletteGeneratedPath}.`)
  } else {
    process.exitCode = await runThemeGate()
  }
}
