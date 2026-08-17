import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createServer } from 'vite'

const catalogModulePath =
  '/src/contexts/agent/infrastructure/providers/catalog/BuiltinAgentProviderCatalog.ts'
const outputDirectoryPath = 'docs/assets/agent-providers'
const readmeTargets = [
  { locale: 'en', path: 'README.md' },
  { locale: 'zh-CN', path: 'README_ZH.md' }
]
const wallStartMarker = '<!-- agent-provider-wall:start -->'
const wallEndMarker = '<!-- agent-provider-wall:end -->'

async function main() {
  const cwd = process.cwd()
  const shouldCheck = process.argv.includes('--check')
  const providers = await loadProviderDescriptors(cwd)
  const generatedAssets = new Map(
    providers.map((provider) => {
      const extension = 'imageDataUrl' in provider.icon ? 'png' : 'svg'
      return [
        `${provider.id}.${extension}`,
        'imageDataUrl' in provider.icon
          ? decodeRasterIcon(provider.icon.imageDataUrl)
          : Buffer.from(renderVectorIcon(provider.icon))
      ]
    })
  )
  const expectedWalls = new Map(
    readmeTargets.map(({ locale, path }) => [path, renderProviderWall(providers, locale)])
  )

  if (shouldCheck) {
    await checkGeneratedState(cwd, generatedAssets, expectedWalls)
    console.log(
      `Agent README walls and ${providers.length} generated icons match the built-in Provider catalog.`
    )
    return
  }

  await writeGeneratedState(cwd, generatedAssets, expectedWalls)
  console.log(
    `Generated ${providers.length} Agent README icons and synchronized both README walls.`
  )
}

async function loadProviderDescriptors(cwd) {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    root: cwd,
    server: { middlewareMode: true }
  })
  try {
    const catalog = await server.ssrLoadModule(catalogModulePath)
    const providers = catalog
      .createBuiltinAgentProviderContributions()
      .map(({ descriptor }) => descriptor)
    if (
      providers.length === 0 ||
      new Set(providers.map(({ id }) => id)).size !== providers.length
    ) {
      throw new Error(
        'The built-in Agent Provider catalog is incomplete or contains duplicate IDs.'
      )
    }
    return providers
  } finally {
    await server.close()
  }
}

async function writeGeneratedState(cwd, generatedAssets, expectedWalls) {
  const outputDirectory = join(cwd, outputDirectoryPath)
  await mkdir(outputDirectory, { recursive: true })
  await Promise.all(
    [...generatedAssets].map(([fileName, contents]) =>
      writeFile(join(outputDirectory, fileName), contents)
    )
  )

  await Promise.all(
    [...expectedWalls].map(async ([readmePath, expectedWall]) => {
      const absoluteReadmePath = join(cwd, readmePath)
      const readme = await readFile(absoluteReadmePath, 'utf8')
      const synchronizedReadme = replaceGeneratedWall(readme, expectedWall)
      await writeFile(absoluteReadmePath, synchronizedReadme)
    })
  )
}

async function checkGeneratedState(cwd, generatedAssets, expectedWalls) {
  const outputDirectory = join(cwd, outputDirectoryPath)
  const actualFiles = new Set(await readdir(outputDirectory))
  const expectedFiles = new Set(generatedAssets.keys())
  const violations = []

  for (const [fileName, expectedContents] of generatedAssets) {
    if (!actualFiles.has(fileName)) {
      violations.push(`missing generated icon: ${fileName}`)
      continue
    }
    const actualContents = await readFile(join(outputDirectory, fileName))
    if (!actualContents.equals(expectedContents)) {
      violations.push(`stale generated icon: ${fileName}`)
    }
  }
  for (const fileName of actualFiles) {
    if (!expectedFiles.has(fileName)) violations.push(`unexpected generated icon: ${fileName}`)
  }

  for (const [readmePath, expectedWall] of expectedWalls) {
    const readme = await readFile(join(cwd, readmePath), 'utf8')
    if (replaceGeneratedWall(readme, expectedWall) !== readme) {
      violations.push(`${readmePath} Agent Provider wall is stale`)
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Agent README assets are out of date. Run "pnpm generate:agent-readme-assets".\n${violations
        .map((violation) => `- ${violation}`)
        .join('\n')}`
    )
  }
}

function replaceGeneratedWall(readme, expectedWall) {
  const start = readme.indexOf(wallStartMarker)
  const end = readme.indexOf(wallEndMarker)
  if (start < 0 || end < start) {
    throw new Error('README Agent Provider wall markers are missing or out of order.')
  }
  return `${readme.slice(0, start)}${expectedWall}${readme.slice(end + wallEndMarker.length)}`
}

function renderProviderWall(providers, locale) {
  const copy = renderProviderWallCopy(locale, providers.length)
  return [
    wallStartMarker,
    '',
    copy.introduction,
    '',
    '<p>',
    ...providers.map((provider) => {
      const extension = 'imageDataUrl' in provider.icon ? 'png' : 'svg'
      const iconPath = `./${outputDirectoryPath}/${provider.id}.${extension}`
      return `  <a href="${escapeHtml(provider.documentationUrl)}"><kbd><img src="${iconPath}" width="18" height="18" alt="" /> ${escapeHtml(provider.displayName)}</kbd></a>`
    }),
    '</p>',
    '',
    copy.conclusion,
    '',
    wallEndMarker
  ].join('\n')
}

function renderProviderWallCopy(locale, providerCount) {
  if (locale === 'en') {
    return {
      introduction: `cleancode includes **${providerCount} Coding Agent Providers**. Each Agent runs the corresponding real local CLI in the current workspace directory; one workspace can host multiple Agents from the same or different Providers.`,
      conclusion:
        '**Keep using the Agents you already know, with the current branch, terminals, and runtime state in the same workspace.**'
    }
  }
  if (locale === 'zh-CN') {
    return {
      introduction: `cleancode 内建 **${providerCount} 个 Coding Agent Provider**。每个 Agent 都使用对应的真实本地 CLI，并在当前工作区目录中运行；同一个工作区可以同时创建多个相同或不同 Provider 的 Agent。`,
      conclusion:
        '**继续使用你熟悉的 Agent，同时让它们与当前分支、终端和运行状态保持在同一个工作区。**'
    }
  }
  throw new Error(`Unsupported README locale: ${locale}`)
}

function decodeRasterIcon(imageDataUrl) {
  const prefix = 'data:image/png;base64,'
  if (!imageDataUrl.startsWith(prefix)) throw new Error('Unsupported Agent raster icon format.')
  return Buffer.from(imageDataUrl.slice(prefix.length), 'base64')
}

function renderVectorIcon(icon) {
  const gradients = icon.linearGradients ?? []
  const definitions =
    gradients.length === 0
      ? ''
      : `<defs>${gradients
          .map(
            (gradient) =>
              `<linearGradient id="${escapeXml(gradient.id)}" x1="${escapeXml(gradient.x1)}" y1="${escapeXml(gradient.y1)}" x2="${escapeXml(gradient.x2)}" y2="${escapeXml(gradient.y2)}">${gradient.stops
                .map(
                  (stop) =>
                    `<stop offset="${escapeXml(stop.offset)}" stop-color="${escapeXml(stop.stopColor)}"/>`
                )
                .join('')}</linearGradient>`
          )
          .join('')}</defs>`
  const paths = icon.paths
    .map((path) => {
      const attributes = [
        `d="${escapeXml(path.d)}"`,
        `fill="${escapeXml(path.fill ?? 'currentColor')}"`,
        path.fillRule ? `fill-rule="${escapeXml(path.fillRule)}"` : '',
        path.transform ? `transform="${escapeXml(path.transform)}"` : ''
      ]
        .filter(Boolean)
        .join(' ')
      return `<path ${attributes}/>`
    })
    .join('')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(icon.viewBox)}">`,
    '<style>:root{color:#24292f}@media(prefers-color-scheme:dark){:root{color:#f0f6fc}}</style>',
    definitions,
    paths,
    '</svg>',
    ''
  ].join('\n')
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const escapeXml = escapeHtml

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
