import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

const checkedExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
const checkedDirectories = ['tests/e2e', 'tests/fixtures', 'tests/support']
const allowedRawSleepFiles = new Set(['tests/support/e2ePolling.ts'])
const actionCallNamePattern = /^(?:create|execute|launch|open|run|start)(?:[A-Z_]|$)/u

export function collectTestStabilityViolations({ cwd = process.cwd() } = {}) {
  return collectCheckedFiles(cwd)
    .flatMap((filePath) => findFileViolations(cwd, filePath))
    .sort(compareViolations)
}

export function runTestStabilityGate({ cwd = process.cwd(), logger = console } = {}) {
  const violations = collectTestStabilityViolations({ cwd })

  if (violations.length === 0) {
    logger.log('Test stability rules passed.')
    return 0
  }

  logger.error(
    'Test stability rules failed. Use observable state for success and deadlines only for failure:'
  )
  for (const violation of violations) {
    logger.error(
      `- ${violation.filePath}:${violation.line}: ${violation.rule} - ${violation.message}`
    )
  }
  return 1
}

function collectCheckedFiles(cwd) {
  const nestedFiles = checkedDirectories.flatMap((directory) => {
    const absoluteDirectory = join(cwd, directory)
    return existsSync(absoluteDirectory) ? collectFiles(absoluteDirectory, cwd) : []
  })
  const rootConfigs = existsSync(cwd)
    ? readdirSync(cwd, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isFile() && /^vitest\.e2e(?:\.[^.]+)*\.config\.[cm]?[jt]s$/u.test(entry.name)
        )
        .map((entry) => entry.name)
    : []

  return [...new Set([...nestedFiles, ...rootConfigs])].sort()
}

function collectFiles(directory, cwd) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectFiles(absolutePath, cwd)
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
  const reportedKeys = new Set()
  const isE2eConfig = /^vitest\.e2e(?:\.[^.]+)*\.config\.[cm]?[jt]s$/u.test(filePath)
  const promiseTimerNames = collectPromiseTimerNames(sourceFile)

  function report(node, rule, message) {
    const position = node.getStart(sourceFile)
    const reportKey = `${position}:${rule}`
    if (reportedKeys.has(reportKey)) return

    reportedKeys.add(reportKey)
    violations.push({
      filePath,
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      rule,
      message
    })
  }

  function visit(node) {
    if (isWaitForTimeoutCall(node)) {
      report(
        node,
        'no-fixed-time-wait',
        'Wait for an observable process, protocol, identity, or UI state instead of elapsed time.'
      )
    } else if (isDirectStatePollCall(node)) {
      report(
        node,
        'no-direct-state-poll',
        'Use tests/support/e2ePolling.ts with an observable state, completion predicate, deadline, and diagnostic description.'
      )
    } else if (isRawTimerSleep(node, promiseTimerNames) && !allowedRawSleepFiles.has(filePath)) {
      report(
        node,
        'no-raw-test-sleep',
        'Use tests/support/e2ePolling.ts so state determines success and the timer is only a polling interval.'
      )
    } else if (isTestRetryConfiguration(node, isE2eConfig)) {
      report(
        node,
        'no-test-retry',
        'Automatic test retry hides the first failure; use explicit stress reruns with retry disabled.'
      )
    } else if (isActionRetryLoop(node)) {
      report(
        node,
        'no-action-retry-loop',
        'Do not catch and repeat a scenario action; wait for its authoritative handoff state instead.'
      )
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function isWaitForTimeoutCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'waitForTimeout'
  )
}

function isDirectStatePollCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false

  const owner = node.expression.expression
  if (!ts.isIdentifier(owner)) return false

  return (
    (owner.text === 'expect' && node.expression.name.text === 'poll') ||
    (['vi', 'vitest'].includes(owner.text) && node.expression.name.text === 'waitUntil')
  )
}

function isRawTimerSleep(node, promiseTimerNames) {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    promiseTimerNames.has(node.expression.text)
  ) {
    return true
  }

  if (
    !ts.isNewExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== 'Promise' ||
    node.arguments?.length !== 1
  ) {
    return false
  }

  const executor = node.arguments[0]
  if (
    (!ts.isArrowFunction(executor) && !ts.isFunctionExpression(executor)) ||
    !executor.parameters[0]
  ) {
    return false
  }

  const resolveName = readBindingName(executor.parameters[0].name)
  if (!resolveName) return false

  const expression = readOnlyExecutorExpression(executor.body)
  return expression !== null && isTimerCallingResolve(expression, resolveName)
}

function readOnlyExecutorExpression(body) {
  if (!ts.isBlock(body)) return body
  if (body.statements.length !== 1 || !ts.isExpressionStatement(body.statements[0])) return null
  return body.statements[0].expression
}

function isTimerCallingResolve(expression, resolveName) {
  if (!ts.isCallExpression(expression) || !isSetTimeoutExpression(expression.expression)) {
    return false
  }

  const callback = expression.arguments[0]
  if (ts.isIdentifier(callback)) return callback.text === resolveName
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return false
  }

  const callbackExpression = readOnlyExecutorExpression(callback.body)
  return (
    callbackExpression !== null &&
    ts.isCallExpression(callbackExpression) &&
    ts.isIdentifier(callbackExpression.expression) &&
    callbackExpression.expression.text === resolveName
  )
}

function isSetTimeoutExpression(expression) {
  return (
    (ts.isIdentifier(expression) && expression.text === 'setTimeout') ||
    (ts.isPropertyAccessExpression(expression) && expression.name.text === 'setTimeout')
  )
}

function isTestRetryConfiguration(node, isE2eConfig) {
  if (isE2eConfig && ts.isPropertyAssignment(node)) {
    const name = readPropertyName(node.name)
    return name === 'retry' || name === 'retries'
  }

  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    (node.expression.name.text === 'retry' || node.expression.name.text === 'retries')
  )
}

function isActionRetryLoop(node) {
  if (!isIterationStatement(node) || !hasRetryControlSignal(node)) return false

  return collectDescendants(node.statement, ts.isTryStatement).some(
    (tryStatement) =>
      tryStatement.catchClause !== undefined &&
      containsScenarioAction(tryStatement.tryBlock) &&
      !blockAlwaysThrows(tryStatement.catchClause.block)
  )
}

function hasRetryControlSignal(node) {
  const controlNodes = []

  if (ts.isForStatement(node)) {
    if (node.initializer) controlNodes.push(node.initializer)
    if (node.condition) controlNodes.push(node.condition)
    if (node.incrementor) controlNodes.push(node.incrementor)
  } else if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
    controlNodes.push(node.initializer, node.expression)
  } else {
    controlNodes.push(node.expression)
  }

  return controlNodes.some((controlNode) => /(?:attempt|delay|retry)/iu.test(controlNode.getText()))
}

function collectPromiseTimerNames(sourceFile) {
  const names = new Set()

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !['node:timers/promises', 'timers/promises'].includes(statement.moduleSpecifier.text)
    ) {
      continue
    }

    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue

    for (const element of bindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === 'setTimeout') {
        names.add(element.name.text)
      }
    }
  }

  return names
}

function containsScenarioAction(node) {
  return collectDescendants(node, ts.isCallExpression).some((call) => {
    const callName = readCallName(call.expression)
    return callName !== null && actionCallNamePattern.test(callName)
  })
}

function blockAlwaysThrows(block) {
  const finalStatement = block.statements.at(-1)
  return finalStatement !== undefined && ts.isThrowStatement(finalStatement)
}

function collectDescendants(node, predicate) {
  const matches = []

  function visit(current) {
    if (predicate(current)) matches.push(current)
    ts.forEachChild(current, visit)
  }

  visit(node)
  return matches
}

function isIterationStatement(node) {
  return (
    ts.isDoStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isWhileStatement(node)
  )
}

function readCallName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return null
}

function readBindingName(name) {
  return ts.isIdentifier(name) ? name.text : null
}

function readPropertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null
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
  process.exitCode = runTestStabilityGate()
}
