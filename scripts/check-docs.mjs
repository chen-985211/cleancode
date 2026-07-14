import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ignoredDirectoryNames = new Set(['.git', 'coverage', 'dist', 'node_modules', 'out'])
const rootDocumentationFiles = ['README.md', 'AGENTS.md']
const markdownLinkPattern = /!?\[[^\]]*\]\(([^)\n]+)\)/g

export function collectDocumentationViolations({ cwd = process.cwd() } = {}) {
  const documentationFiles = listDocumentationFiles(cwd)
  const violations = documentationFiles.flatMap((filePath) => collectLinkViolations(cwd, filePath))

  violations.push(...collectRootStructureViolations(cwd))
  violations.push(...collectIndexViolations(cwd))

  return violations.sort(compareViolations)
}

export function runDocumentationGate(cwd = process.cwd(), logger = console) {
  const violations = collectDocumentationViolations({ cwd })

  if (violations.length === 0) {
    logger.log('Documentation links, anchors, structure, and index coverage are valid.')
    return 0
  }

  logger.error('Documentation quality gate found violations:')
  for (const violation of violations) {
    const location = violation.line ? `${violation.filePath}:${violation.line}` : violation.filePath

    logger.error(`- [${violation.rule}] ${location}: ${violation.message}`)
  }

  return 1
}

function listDocumentationFiles(cwd) {
  const rootFiles = rootDocumentationFiles
    .map((filePath) => join(cwd, filePath))
    .filter((filePath) => existsSync(filePath))
  const docsDirectory = join(cwd, 'docs')
  const docsFiles = existsSync(docsDirectory)
    ? listFilesRecursively(docsDirectory).filter((filePath) => extname(filePath) === '.md')
    : []

  return [...rootFiles, ...docsFiles]
}

function listFilesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredDirectoryNames.has(entry.name)) {
      return []
    }

    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return listFilesRecursively(entryPath)
    }

    return entry.isFile() ? [entryPath] : []
  })
}

function collectLinkViolations(cwd, absoluteFilePath) {
  const contents = readFileSync(absoluteFilePath, 'utf8')
  const sourceFilePath = toProjectPath(cwd, absoluteFilePath)
  const violations = []

  for (const link of extractMarkdownLinks(contents)) {
    const destination = parseLocalDestination(link.destination)

    if (!destination) {
      continue
    }

    const targetPath = resolveLinkTarget(cwd, absoluteFilePath, destination.filePath)

    if (!existsSync(targetPath)) {
      violations.push({
        filePath: sourceFilePath,
        line: lineNumberAt(contents, link.offset),
        rule: 'broken-local-link',
        message: `Local target does not exist: ${link.destination}`
      })
      continue
    }

    if (destination.anchor && isMarkdownFile(targetPath)) {
      const anchors = collectMarkdownAnchors(readFileSync(targetPath, 'utf8'))

      if (!anchors.has(destination.anchor)) {
        violations.push({
          filePath: sourceFilePath,
          line: lineNumberAt(contents, link.offset),
          rule: 'missing-heading-anchor',
          message: `Markdown heading anchor does not exist: ${link.destination}`
        })
      }
    }
  }

  return violations
}

function collectRootStructureViolations(cwd) {
  const docsDirectory = join(cwd, 'docs')

  if (!existsSync(docsDirectory)) {
    return []
  }

  return readdirSync(docsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === '.md')
    .filter((entry) => entry.name !== 'README.md')
    .map((entry) => ({
      filePath: `docs/${entry.name}`,
      rule: 'docs-root-topic',
      message: 'Topic documents must live under a semantic or bounded-context directory.'
    }))
}

function collectIndexViolations(cwd) {
  const indexPath = join(cwd, 'docs', 'README.md')
  const docsDirectory = join(cwd, 'docs')

  if (!existsSync(indexPath)) {
    return [
      {
        filePath: 'docs/README.md',
        rule: 'missing-docs-index',
        message: 'The documentation center is required.'
      }
    ]
  }

  const indexedDocuments = new Set(
    extractMarkdownLinks(readFileSync(indexPath, 'utf8'))
      .map((link) => parseLocalDestination(link.destination))
      .filter(Boolean)
      .map((destination) => resolveLinkTarget(cwd, indexPath, destination.filePath))
      .filter((filePath) => isMarkdownFile(filePath))
      .map((filePath) => resolve(filePath))
  )

  return listFilesRecursively(docsDirectory)
    .filter((filePath) => isMarkdownFile(filePath))
    .filter((filePath) => resolve(filePath) !== resolve(indexPath))
    .filter((filePath) => !indexedDocuments.has(resolve(filePath)))
    .map((filePath) => ({
      filePath: toProjectPath(cwd, filePath),
      rule: 'unindexed-document',
      message: 'Document must be linked directly from docs/README.md.'
    }))
}

function extractMarkdownLinks(contents) {
  return Array.from(contents.matchAll(markdownLinkPattern), (match) => ({
    destination: readLinkDestination(match[1] ?? ''),
    offset: match.index ?? 0
  })).filter((link) => link.destination.length > 0)
}

function readLinkDestination(rawDestination) {
  const destination = rawDestination.trim()

  if (destination.startsWith('<')) {
    const closingBracket = destination.indexOf('>')

    return closingBracket === -1 ? destination : destination.slice(1, closingBracket)
  }

  return destination.split(/\s+/u, 1)[0] ?? ''
}

function parseLocalDestination(rawDestination) {
  if (
    rawDestination.length === 0 ||
    rawDestination.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(rawDestination)
  ) {
    return null
  }

  const [rawPath, rawAnchor = ''] = rawDestination.split('#', 2)
  const filePath = decodeSafely((rawPath ?? '').split('?', 1)[0] ?? '')
  const anchor = decodeSafely(rawAnchor).toLowerCase()

  return { filePath, anchor }
}

function resolveLinkTarget(cwd, sourceFilePath, targetFilePath) {
  if (targetFilePath.length === 0) {
    return sourceFilePath
  }

  return isAbsolute(targetFilePath)
    ? resolve(targetFilePath)
    : resolve(dirname(sourceFilePath), targetFilePath)
}

function collectMarkdownAnchors(contents) {
  const anchors = new Set()
  const slugCounts = new Map()
  let insideFence = false

  for (const line of contents.split(/\r?\n/u)) {
    if (/^\s*(```|~~~)/u.test(line)) {
      insideFence = !insideFence
      continue
    }

    if (insideFence) {
      continue
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u)

    if (!heading) {
      continue
    }

    const baseSlug = createHeadingSlug(heading[1] ?? '')
    const duplicateCount = slugCounts.get(baseSlug) ?? 0
    const slug = duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount}`

    slugCounts.set(baseSlug, duplicateCount + 1)
    anchors.add(slug)
  }

  return anchors
}

function createHeadingSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]*>/gu, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[`*_~]/gu, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/gu, '-')
}

function isMarkdownFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile() && extname(filePath) === '.md'
}

function lineNumberAt(contents, offset) {
  return contents.slice(0, offset).split('\n').length
}

function decodeSafely(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function toProjectPath(cwd, filePath) {
  return relative(cwd, filePath).split(sep).join('/')
}

function compareViolations(left, right) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    left.rule.localeCompare(right.rule)
  )
}

const isExecutedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isExecutedDirectly) {
  process.exitCode = runDocumentationGate()
}
