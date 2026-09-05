import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

const checkedExtensions = new Set(['.ts', '.tsx'])
const ignoredDirectories = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])
const userFacingAttributes = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'description',
  'helpertext',
  'label',
  'placeholder',
  'title',
  'tooltip'
])
const userFacingProperties = new Set([
  'actionLabel',
  'ariaLabel',
  'cancelLabel',
  'confirmLabel',
  'description',
  'emptyMessage',
  'helperText',
  'label',
  'message',
  'placeholder',
  'title',
  'tooltip'
])
const userFacingDialogCalls = new Set([
  'alert',
  'confirm',
  'prompt',
  'showErrorBox',
  'showMessageBox'
])
const nonLocalizableUiTerms = new Set(['HTTP', 'HTTPS', 'TCP'])

export function collectI18nViolations({ cwd = process.cwd() } = {}) {
  const sourceDirectory = join(cwd, 'src')

  if (!existsSync(sourceDirectory)) {
    return []
  }

  return collectFiles(sourceDirectory, cwd)
    .filter(isProductionUiFile)
    .filter((filePath) => !isLocaleCatalog(filePath))
    .flatMap((filePath) => findFileViolations(cwd, filePath))
    .sort(compareViolations)
}

export function runI18nGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = collectI18nViolations({ cwd })

  if (violations.length === 0) {
    logger.log('i18n rules passed.')
    return 0
  }

  logger.error('i18n rules failed. Move first-party UI copy into locale catalogs:')
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
    filePath.startsWith('src/presentation/') ||
    filePath.includes('/presentation/') ||
    filePath.startsWith('src/platform/renderer-bootstrap/')
  )
}

function isLocaleCatalog(filePath) {
  return /^src\/presentation\/i18n\/catalogs\/[^/]+\/[^/]+\.ts$/u.test(filePath)
}

function findFileViolations(cwd, filePath) {
  const sourceText = readFileSync(join(cwd, filePath), 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const violations = []
  const reportedPositions = new Set()

  function report(node, rule, message) {
    const position = node.getStart(sourceFile)

    if (reportedPositions.has(position)) {
      return
    }

    reportedPositions.add(position)
    violations.push({
      filePath,
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      rule,
      message
    })
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const jsxText = node.getText(sourceFile)

      if (hasHumanReadableText(jsxText) && !isNonLocalizableUiTerm(jsxText)) {
        report(node, 'no-hardcoded-jsx-text', 'Use t(...) for text rendered directly by JSX.')
      }
      return
    }

    const literalText = readLiteralText(node)

    if (literalText !== null) {
      const visibleContext = readVisibleContext(node)

      if (
        visibleContext &&
        hasHumanReadableText(literalText) &&
        !isNonLocalizableUiTerm(literalText)
      ) {
        report(node, visibleContext.rule, visibleContext.message)
      } else if (containsHanCharacters(literalText)) {
        report(
          node,
          'no-hardcoded-ui-copy',
          'Chinese first-party copy is only allowed in locale catalogs.'
        )
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function readLiteralText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }

  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('')
  }

  return null
}

function readVisibleContext(node) {
  const parent = node.parent

  if (ts.isJsxAttribute(parent) && parent.initializer === node) {
    return readJsxAttributeContext(parent)
  }

  if (ts.isJsxExpression(parent) && parent.expression === node) {
    if (ts.isJsxAttribute(parent.parent)) {
      return readJsxAttributeContext(parent.parent)
    }

    if (
      ts.isJsxElement(parent.parent) ||
      ts.isJsxFragment(parent.parent) ||
      ts.isJsxSelfClosingElement(parent.parent)
    ) {
      return {
        rule: 'no-hardcoded-jsx-text',
        message: 'Use t(...) for string literals rendered by JSX.'
      }
    }
  }

  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const propertyName = readPropertyName(parent.name)

    if (propertyName && userFacingProperties.has(propertyName)) {
      return {
        rule: 'no-hardcoded-ui-property',
        message: `Use a locale key for the user-facing ${propertyName} property.`
      }
    }
  }

  if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
    const callName = readCallName(parent.expression)

    if (callName && userFacingDialogCalls.has(callName)) {
      return {
        rule: 'no-hardcoded-dialog-copy',
        message: `Use a locale key for copy passed to ${callName}(...).`
      }
    }
  }

  return null
}

function readJsxAttributeContext(attribute) {
  const attributeName = attribute.name.getText().toLowerCase()

  return userFacingAttributes.has(attributeName)
    ? {
        rule: 'no-hardcoded-ui-attribute',
        message: `Use t(...) for the user-facing ${attributeName} attribute.`
      }
    : null
}

function readPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }

  return null
}

function readCallName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text
  }

  return null
}

function hasHumanReadableText(value) {
  return /\p{L}/u.test(value)
}

function containsHanCharacters(value) {
  return /\p{Script=Han}/u.test(value)
}

function isNonLocalizableUiTerm(value) {
  return nonLocalizableUiTerms.has(value.trim())
}

function compareViolations(left, right) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.line - right.line ||
    left.rule.localeCompare(right.rule)
  )
}

function toPosixPath(filePath) {
  return filePath.split(sep).join('/')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runI18nGate()
}
