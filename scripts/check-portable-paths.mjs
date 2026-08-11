import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

const checkedExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
const checkedRoots = ['src', 'tests']
const ignoredDirectories = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])
const pathTokens = new Set(['cwd', 'dir', 'directory', 'dirname', 'file', 'folder', 'path', 'root'])
const nonFileSystemTokens = new Set([
  'address',
  'endpoint',
  'href',
  'key',
  'route',
  'specifier',
  'uri',
  'url'
])

export function collectPortablePathViolations({ cwd = process.cwd() } = {}) {
  return checkedRoots
    .flatMap((rootPath) => collectRootFiles(cwd, rootPath))
    .flatMap((filePath) => findFileViolations(cwd, filePath))
    .sort(compareViolations)
}

export function runPortablePathGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = collectPortablePathViolations({ cwd })

  if (violations.length === 0) {
    logger.log('Portable path rules passed.')
    return 0
  }

  logger.error(
    'Portable path rules failed. Use node:path APIs or an explicit canonical separator contract:'
  )
  for (const violation of violations) {
    logger.error(
      `- ${violation.filePath}:${violation.line}: ${violation.rule} - ${violation.message}`
    )
  }
  return 1
}

function collectRootFiles(cwd, rootPath) {
  const rootDirectory = join(cwd, rootPath)
  return existsSync(rootDirectory) ? collectFiles(rootDirectory, cwd) : []
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

function findFileViolations(cwd, filePath) {
  const sourceText = readFileSync(join(cwd, filePath), 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    readScriptKind(filePath)
  )
  const violations = []
  const reportedPositions = new Set()
  const hasCanonicalPosixContract = declaresCanonicalPosixSeparator(sourceText)
  const ambientPathObjects = collectAmbientPathObjects(sourceFile, filePath)

  function report(node, rule, message) {
    const position = node.getStart(sourceFile)
    const reportKey = `${position}:${rule}`
    if (reportedPositions.has(reportKey)) return

    reportedPositions.add(reportKey)
    violations.push({
      filePath,
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      rule,
      message
    })
  }

  function visit(node) {
    if (
      isAmbientPathSeparatorImport(node, filePath) ||
      isAmbientPathSeparatorAccess(node, ambientPathObjects)
    ) {
      report(
        node,
        'no-ambient-path-separator',
        'Use an explicit posix or win32 path API in deterministic tests.'
      )
    } else if (
      ts.isTemplateExpression(node) &&
      hasManualTemplatePathSeparator(node, hasCanonicalPosixContract)
    ) {
      report(
        node,
        'no-manual-path-separator',
        'Compose filesystem paths with join/resolve or an explicit posix/win32 path API.'
      )
    } else if (ts.isBinaryExpression(node) && hasManualBinaryPathSeparator(node)) {
      report(
        node,
        'no-manual-path-separator',
        'Compose filesystem paths with join/resolve or an explicit posix/win32 path API.'
      )
    } else if (isPlatformSpecificPathRegexAssertion(node)) {
      report(
        node,
        'no-platform-specific-path-regexp',
        'Assert path structure with dirname/basename and the selected path API.'
      )
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function isAmbientPathSeparatorImport(node, filePath) {
  if (!isDeterministicTest(filePath) || !ts.isImportDeclaration(node)) return false
  if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'node:path') {
    return false
  }

  const namedBindings = node.importClause?.namedBindings
  if (!namedBindings || !ts.isNamedImports(namedBindings)) return false
  return namedBindings.elements.some((element) =>
    ['delimiter', 'sep'].includes(element.propertyName?.text ?? element.name.text)
  )
}

function collectAmbientPathObjects(sourceFile, filePath) {
  if (!isDeterministicTest(filePath)) return new Set()
  const bindings = new Set()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'node:path'
    ) {
      continue
    }

    const importClause = statement.importClause
    if (importClause?.name) bindings.add(importClause.name.text)
    if (importClause?.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
      bindings.add(importClause.namedBindings.name.text)
    }
  }

  return bindings
}

function isAmbientPathSeparatorAccess(node, ambientPathObjects) {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      ambientPathObjects.has(node.expression.text) &&
      ['delimiter', 'sep'].includes(node.name.text)
    )
  }
  if (!ts.isElementAccessExpression(node) || !ts.isIdentifier(node.expression)) return false
  const key = node.argumentExpression
  return (
    ambientPathObjects.has(node.expression.text) &&
    ts.isStringLiteralLike(key) &&
    ['delimiter', 'sep'].includes(key.text)
  )
}

function isDeterministicTest(filePath) {
  return filePath.startsWith('tests/unit/') || filePath.startsWith('tests/contract/')
}

function hasManualTemplatePathSeparator(node, hasCanonicalPosixContract) {
  const chunks = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]

  return node.templateSpans.some((span, index) => {
    const expressionIsPath = isPathLikeExpression(span.expression)
    const previousChunk = chunks[index]
    const followingChunk = chunks[index + 1]
    const hasPosixSeparator =
      (expressionIsPath && followingChunk.startsWith('/')) ||
      (isPathLikeExpression(span.expression) && previousChunk.endsWith('/'))

    if (hasPosixSeparator && hasCanonicalPosixContract) {
      return false
    }

    return (
      (expressionIsPath && startsWithPathSeparator(followingChunk)) ||
      (expressionIsPath && endsWithPathSeparator(previousChunk))
    )
  })
}

function hasManualBinaryPathSeparator(node) {
  if (node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return false

  const leftLiteral = readLiteralText(node.left)
  const rightLiteral = readLiteralText(node.right)

  return (
    (isPathLikeExpression(node.left) &&
      rightLiteral !== null &&
      startsWithPathSeparator(rightLiteral)) ||
    (isPathLikeExpression(node.right) && leftLiteral !== null && endsWithPathSeparator(leftLiteral))
  )
}

function isPlatformSpecificPathRegexAssertion(node) {
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return false
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'toMatch') {
    return false
  }

  const expectCall = node.expression.expression
  if (
    !ts.isCallExpression(expectCall) ||
    !ts.isIdentifier(expectCall.expression) ||
    expectCall.expression.text !== 'expect' ||
    expectCall.arguments.length === 0 ||
    !isPathLikeExpression(expectCall.arguments[0])
  ) {
    return false
  }

  const pattern = node.arguments[0]
  return (
    ts.isRegularExpressionLiteral(pattern) &&
    (pattern.getText().startsWith('/^\\/') || isWindowsAbsolutePathPattern(pattern.getText()))
  )
}

function isWindowsAbsolutePathPattern(pattern) {
  return /(?:\^|\[A-Za-z\])[^/]*:\\\\/u.test(pattern)
}

function isPathLikeExpression(node) {
  const tokens = tokenizeIdentifierText(node.getText())
  if (tokens.some((token) => nonFileSystemTokens.has(token))) return false
  return tokens.some((token) => pathTokens.has(token))
}

function tokenizeIdentifierText(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean)
}

function readLiteralText(node) {
  return ts.isStringLiteralLike(node) ? node.text : null
}

function startsWithPathSeparator(value) {
  return value.startsWith('/') || value.startsWith('\\')
}

function endsWithPathSeparator(value) {
  return value.endsWith('/') || value.endsWith('\\')
}

function declaresCanonicalPosixSeparator(sourceText) {
  return /replaceAll\(\s*['"]\\\\['"]\s*,\s*['"]\/['"]\s*\)/u.test(sourceText)
}

function readScriptKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
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
  process.exitCode = runPortablePathGate()
}
