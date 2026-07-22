import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

const providerRootPath = 'src/contexts/agent/infrastructure/providers'
const contributionFilePattern = /AgentProviderContribution\.tsx?$/u
const presentationExtensions = new Set(['.css', '.ts', '.tsx'])
const ignoredDirectories = new Set([
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])
const legacyProviderIdAllowances = [
  {
    filePath: 'src/presentation/app-shell/agentConsoleModel.ts',
    providerId: 'codex',
    reason: 'Legacy fallback used only before a persisted Agent descriptor is available.',
    variableName: 'rendererLegacyDefaultProviderId'
  }
]

export function discoverBuiltInAgentProviders({ cwd = process.cwd() } = {}) {
  return readContributionCandidates(cwd)
    .flatMap((filePath) => {
      const descriptor = readContributionDescriptor(cwd, filePath)
      return descriptor.providerId
        ? [
            {
              directoryPath: toPosixPath(dirname(filePath)),
              filePath,
              providerId: descriptor.providerId
            }
          ]
        : []
    })
    .sort(compareProviders)
}

export function collectAgentProviderBoundaryViolations({ cwd = process.cwd() } = {}) {
  const contributionCandidates = readContributionCandidates(cwd)
  const discoveredProviders = []
  const violations = []

  for (const filePath of contributionCandidates) {
    const descriptor = readContributionDescriptor(cwd, filePath)
    if (!descriptor.providerId) {
      violations.push({
        filePath,
        line: descriptor.line,
        providerId: null,
        rule: 'provider-id-discovery-failed',
        message: 'Expose the built-in Provider descriptor id as a static string literal.'
      })
      continue
    }
    discoveredProviders.push({
      directoryPath: toPosixPath(dirname(filePath)),
      filePath,
      providerId: descriptor.providerId
    })
  }

  for (const filePath of collectProductionPresentationFiles(cwd)) {
    const extension = extname(filePath)
    violations.push(
      ...(extension === '.css'
        ? findStyleViolations(cwd, filePath, discoveredProviders)
        : findTypeScriptViolations(cwd, filePath, discoveredProviders))
    )
  }

  return violations.sort(compareViolations)
}

export function runAgentProviderBoundaryGate({ cwd = process.cwd(), logger = console } = {}) {
  const providers = discoverBuiltInAgentProviders({ cwd })
  const violations = collectAgentProviderBoundaryViolations({ cwd })

  if (violations.length === 0) {
    logger.log(`Agent Provider boundary rules passed for ${providers.length} built-in Providers.`)
    return 0
  }

  logger.error(
    'Agent Provider boundary rules failed. Keep production Presentation capability-driven:'
  )
  for (const violation of violations) {
    logger.error(
      `- ${violation.filePath}:${violation.line}: ${violation.rule} - ${violation.message}`
    )
  }
  return 1
}

function readContributionCandidates(cwd) {
  const providerRoot = join(cwd, providerRootPath)
  if (!existsSync(providerRoot)) return []

  return collectFiles(providerRoot, cwd)
    .filter((filePath) => contributionFilePattern.test(filePath))
    .sort()
}

function readContributionDescriptor(cwd, filePath) {
  const sourceText = readFileSync(join(cwd, filePath), 'utf8')
  const sourceFile = createSourceFile(filePath, sourceText)
  const staticStrings = collectStaticStrings(sourceFile)
  let descriptorLine = 1
  let providerId = null

  function visit(node) {
    if (providerId) return
    if (
      ts.isPropertyDeclaration(node) &&
      readPropertyName(node.name) === 'descriptor' &&
      node.initializer
    ) {
      descriptorLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
      const descriptor = unwrapExpression(node.initializer)
      if (ts.isObjectLiteralExpression(descriptor)) {
        const idProperty = descriptor.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) && readPropertyName(property.name) === 'id'
        )
        if (idProperty && ts.isPropertyAssignment(idProperty)) {
          providerId = readStaticString(idProperty.initializer, staticStrings)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { line: descriptorLine, providerId }
}

function collectStaticStrings(sourceFile) {
  const values = new Map()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const value = readLiteralString(unwrapExpression(declaration.initializer))
      if (value !== null) values.set(declaration.name.text, value)
    }
  }
  return values
}

function collectProductionPresentationFiles(cwd) {
  const sourceDirectory = join(cwd, 'src')
  if (!existsSync(sourceDirectory)) return []

  return collectFiles(sourceDirectory, cwd)
    .filter(isProductionPresentationFile)
    .filter((filePath) => presentationExtensions.has(extname(filePath)))
    .sort()
}

function findTypeScriptViolations(cwd, filePath, providers) {
  const sourceText = readFileSync(join(cwd, filePath), 'utf8')
  const sourceFile = createSourceFile(filePath, sourceText)
  const violations = []
  const reportedPositions = new Set()

  function report(node, provider, rule, message) {
    const position = node.getStart(sourceFile)
    const reportKey = `${position}:${rule}:${provider.providerId}`
    if (reportedPositions.has(reportKey)) return
    reportedPositions.add(reportKey)
    violations.push({
      filePath,
      line: sourceFile.getLineAndCharacterOfPosition(position).line + 1,
      providerId: provider.providerId,
      rule,
      message
    })
  }

  function visit(node) {
    const moduleSpecifier = readModuleSpecifier(node)
    if (moduleSpecifier) {
      const referencedProvider = findReferencedProvider(cwd, filePath, moduleSpecifier, providers)
      if (referencedProvider) {
        report(
          node,
          referencedProvider,
          'no-provider-infrastructure-reference',
          `Depend on Agent application contracts instead of ${referencedProvider.providerId} infrastructure.`
        )
      }
    }

    const literalText = isModuleSpecifierNode(node) ? null : readLiteralText(node)
    if (literalText !== null) {
      for (const provider of providers) {
        if (
          containsProviderId(literalText, provider.providerId) &&
          !isAllowedLegacyProviderIdLiteral(filePath, node, provider.providerId, literalText)
        ) {
          report(
            node,
            provider,
            'no-provider-id-literal',
            `Read ${provider.providerId} identity and capabilities from the Provider descriptor.`
          )
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function findStyleViolations(cwd, filePath, providers) {
  const lines = readFileSync(join(cwd, filePath), 'utf8').split(/\r?\n/u)
  return lines.flatMap((line, index) =>
    providers.flatMap((provider) =>
      containsProviderId(line, provider.providerId)
        ? [
            {
              filePath,
              line: index + 1,
              providerId: provider.providerId,
              rule: 'no-provider-id-literal',
              message: `Style Agent UI by semantic state, not the ${provider.providerId} Provider id.`
            }
          ]
        : []
    )
  )
}

function readModuleSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : null
  }
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
  ) {
    const argument = node.arguments[0]
    return argument && ts.isStringLiteralLike(argument) ? argument.text : null
  }
  return null
}

function findReferencedProvider(cwd, filePath, moduleSpecifier, providers) {
  const referencedPath = moduleSpecifier.startsWith('.')
    ? toPosixPath(relative(cwd, resolve(dirname(join(cwd, filePath)), moduleSpecifier)))
    : toPosixPath(moduleSpecifier.replace(/^src\//u, 'src/'))
  return (
    providers.find(
      (provider) =>
        referencedPath === provider.directoryPath ||
        referencedPath.startsWith(`${provider.directoryPath}/`)
    ) ?? null
  )
}

function readModuleSpecifierParent(node) {
  const parent = node.parent
  if (!parent) return null
  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) {
    return parent
  }
  if (ts.isCallExpression(parent) && parent.arguments[0] === node) return parent
  return null
}

function isModuleSpecifierNode(node) {
  return readModuleSpecifierParent(node) !== null
}

function readLiteralText(node) {
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('')
  }
  return null
}

function isAllowedLegacyProviderIdLiteral(filePath, node, providerId, literalText) {
  return legacyProviderIdAllowances.some(
    (allowance) =>
      allowance.filePath === filePath &&
      allowance.providerId === providerId &&
      literalText === allowance.providerId &&
      ts.isVariableDeclaration(node.parent) &&
      node.parent.initializer === node &&
      ts.isIdentifier(node.parent.name) &&
      node.parent.name.text === allowance.variableName
  )
}

function containsProviderId(value, providerId) {
  const escapedProviderId = providerId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapedProviderId}(?=$|[^\\p{L}\\p{N}])`, 'u').test(value)
}

function readStaticString(expression, staticStrings) {
  const unwrapped = unwrapExpression(expression)
  const literal = readLiteralString(unwrapped)
  if (literal !== null) return literal
  return ts.isIdentifier(unwrapped) ? (staticStrings.get(unwrapped.text) ?? null) : null
}

function readLiteralString(node) {
  return ts.isStringLiteralLike(node) ? node.text : null
}

function unwrapExpression(expression) {
  let current = expression
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function readPropertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null
}

function collectFiles(directory, cwd) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectFiles(absolutePath, cwd)
    }
    return entry.isFile() ? [toPosixPath(relative(cwd, absolutePath))] : []
  })
}

function isProductionPresentationFile(filePath) {
  return filePath.startsWith('src/presentation/') || filePath.includes('/presentation/')
}

function createSourceFile(filePath, sourceText) {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
}

function compareProviders(left, right) {
  return (
    left.providerId.localeCompare(right.providerId) || left.filePath.localeCompare(right.filePath)
  )
}

function compareViolations(left, right) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.line - right.line ||
    left.rule.localeCompare(right.rule) ||
    (left.providerId ?? '').localeCompare(right.providerId ?? '')
  )
}

function toPosixPath(filePath) {
  return filePath.split(sep).join('/')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runAgentProviderBoundaryGate()
}
