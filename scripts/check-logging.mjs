import { existsSync, readdirSync } from 'node:fs'
import { join, posix, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

const checkedExtensions = new Set(['.ts', '.tsx'])
const sharedErrorModule = /^src\/shared-kernel\/(?:domain|application)\/errors\/AppError$/
const contextErrorModule = /^src\/contexts\/([^/]+)\/(?:domain|application)\/errors\//
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

export async function collectLoggingViolations({ cwd = process.cwd() } = {}) {
  const violations = []
  const files = collectSourceFiles(cwd)
  // Binding symbols distinguish imported aliases from locally shadowed names. No emit or type
  // diagnostics are needed here; the regular typecheck gate validates the declared contracts.
  const program = ts.createProgram(
    files.map((file) => resolve(cwd, file)),
    {
      noEmit: true,
      noLib: true,
      noResolve: true,
      target: ts.ScriptTarget.Latest,
      jsx: ts.JsxEmit.Preserve
    }
  )
  const checker = program.getTypeChecker()
  const commonCodes = collectCommonCodes(program, cwd)

  for (const filePath of files) {
    const sourceFile = program.getSourceFile(resolve(cwd, filePath))
    const reported = new Set()
    const [, context, layer] =
      /^src\/contexts\/([^/]+)\/(domain|application|infrastructure)\//.exec(filePath) ?? []
    function report(node, rule, message) {
      if (reported.has(rule)) return
      reported.add(rule)
      violations.push({
        filePath,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        rule,
        message
      })
    }
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const callee = memberPath(node.expression)
        if (
          filePath !== 'src/platform/logging/ConsoleLogSink.ts' &&
          /^console\.(log|debug|info|warn|error)$/.test(callee)
        ) {
          report(
            node,
            'no-direct-console',
            'Use the platform logger instead of direct console calls in src code.'
          )
        }
        if (filePath.startsWith('src/platform/electron-main/') && callee === 'ipcMain.handle') {
          report(
            node,
            'no-bare-ipc-main-handle',
            'Register Electron IPC handlers through registerIpcHandler.'
          )
        }
        if (isPresentationFile(filePath) && callee === 'error.message.includes') {
          report(
            node,
            'no-renderer-error-message-parsing',
            'Map application errors by code instead of parsing error.message.'
          )
        }
      }
      if (layer && (ts.isCallExpression(node) || ts.isNewExpression(node))) {
        const binding = errorBinding(node.expression, checker, filePath)
        if (
          binding?.context &&
          binding.context !== context &&
          isContextConstruction(node, binding.name)
        ) {
          report(
            node,
            'no-foreign-context-error',
            `Construct ${context} business errors through its own error module instead of ${binding.context}'s.`
          )
        } else if (
          binding &&
          !binding.context &&
          isUnownedConstruction(node, binding, layer, commonCodes)
        ) {
          report(
            node,
            layer === 'domain' ? 'no-unowned-domain-error' : 'no-unowned-context-error',
            'Construct business errors through the owning context error module; generic envelopes are for common errors or metadata-preserving reconstruction.'
          )
        }
      }
      if (
        ['domain', 'application'].includes(layer) &&
        ts.isThrowStatement(node) &&
        node.expression &&
        ts.isNewExpression(unwrap(node.expression))
      ) {
        const constructor = unwrap(unwrap(node.expression).expression)
        if (
          ts.isIdentifier(constructor) &&
          constructor.text === 'Error' &&
          !checker.getSymbolAtLocation(constructor)
        ) {
          report(
            node,
            'no-bare-context-application-error',
            'Use the owning context error factory with a declared code in domain and application layers.'
          )
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  return violations
}

function isContextConstruction(node, name) {
  return ts.isNewExpression(node)
    ? /^[A-Z]\w*Error$/.test(name ?? '')
    : /^create[A-Z]\w*Error$/.test(name ?? '')
}

function isUnownedConstruction(node, binding, layer, commonCodes) {
  if (ts.isNewExpression(node) && binding.name === 'AppError') {
    return layer === 'domain' || !isEnvelopeClone(node.arguments?.[0])
  }
  if (!ts.isCallExpression(node) || binding.name !== 'createExpectedAppError') return false
  // The Domain factory is limited to CommonErrorCode by typecheck. The Application builder is
  // intentionally generic, so only a statically declared common code may use it here.
  if (binding.module === 'src/shared-kernel/domain/errors/AppError') return false
  const code = node.arguments[0] && unwrap(node.arguments[0])
  return !code || !ts.isStringLiteralLike(code) || !commonCodes.has(code.text)
}

function isEnvelopeClone(input) {
  if (!input) return false
  const value = unwrap(input)
  if (!ts.isObjectLiteralExpression(value)) return false
  const spreads = value.properties.filter(ts.isSpreadAssignment)
  const metadata = new Set(['message', 'details', 'correlationId'])
  return (
    spreads.length === 1 &&
    value.properties.every(
      (property) =>
        ts.isSpreadAssignment(property) ||
        ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
          metadata.has(property.name.getText().replace(/^['"]|['"]$/g, '')))
    )
  )
}

function errorBinding(expression, checker, filePath, seen = new Set()) {
  const node = unwrap(expression)
  if (ts.isIdentifier(node)) {
    const symbol = checker.getSymbolAtLocation(node)
    if (!symbol)
      return ['AppError', 'createExpectedAppError'].includes(node.text) ? { name: node.text } : null
    if (seen.has(symbol)) return null
    seen.add(symbol)
    for (const declaration of symbol.declarations ?? []) {
      if (ts.isImportSpecifier(declaration) || ts.isNamespaceImport(declaration)) {
        const clause = ts.isImportSpecifier(declaration)
          ? declaration.parent.parent
          : declaration.parent
        const specifier = clause.parent.moduleSpecifier
        if (!ts.isStringLiteral(specifier)) continue
        const module = posix
          .normalize(posix.join(posix.dirname(filePath), specifier.text))
          .replace(/\.(?:ts|tsx|js)$/, '')
        const context = contextErrorModule.exec(module)?.[1]
        if (!context && !sharedErrorModule.test(module)) return null
        return {
          module,
          context,
          name: ts.isImportSpecifier(declaration)
            ? (declaration.propertyName ?? declaration.name).text
            : null
        }
      }
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        (declaration.parent.flags & ts.NodeFlags.Const) !== 0
      ) {
        return errorBinding(declaration.initializer, checker, filePath, seen)
      }
    }
    return null
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const base = errorBinding(node.expression, checker, filePath, seen)
    const name = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : literalText(node.argumentExpression)
    return base && base.name === null ? { ...base, name } : null
  }
  return null
}

function collectCommonCodes(program, cwd) {
  const source = program.getSourceFile(resolve(cwd, 'src/shared-kernel/domain/errors/AppError.ts'))
  const codes = new Set()
  if (!source) return codes
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== 'commonErrorCodes' ||
        !declaration.initializer
      )
        continue
      const array = unwrap(declaration.initializer)
      if (ts.isArrayLiteralExpression(array)) {
        for (const element of array.elements)
          if (ts.isStringLiteralLike(element)) codes.add(element.text)
      }
    }
  }
  return codes
}

function memberPath(expression) {
  const node = unwrap(expression)
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return `${memberPath(node.expression)}.${node.name.text}`
  if (ts.isElementAccessExpression(node))
    return `${memberPath(node.expression)}.${literalText(node.argumentExpression)}`
  return ''
}

function literalText(node) {
  return node && ts.isStringLiteralLike(unwrap(node)) ? unwrap(node).text : ''
}

function unwrap(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    node = node.expression
  return node
}

export async function runLoggingGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = await collectLoggingViolations({ cwd })

  if (violations.length === 0) {
    logger.log('Logging rules passed.')
    return 0
  }

  logger.error('Logging rules failed:')

  for (const violation of violations) {
    logger.error(
      `- ${violation.filePath}:${violation.line}: ${violation.rule} - ${violation.message}`
    )
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

function isPresentationFile(filePath) {
  return filePath.startsWith('src/presentation/') || filePath.includes('/presentation/')
}

function toPosixPath(filePath) {
  return filePath.split(sep).join('/')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const exitCode = await runLoggingGate()

  process.exitCode = exitCode
}
