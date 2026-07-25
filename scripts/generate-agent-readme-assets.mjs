import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createServer } from 'vite'

const catalogModulePath =
  '/src/contexts/agent/infrastructure/providers/catalog/BuiltinAgentProviderCatalog.ts'
const outputDirectoryPath = 'docs/assets/agent-providers'
const readmePath = 'README.md'
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
  const expectedWall = renderProviderWall(providers)

  if (shouldCheck) {
    await checkGeneratedState(cwd, generatedAssets, expectedWall)
    console.log(
      `Agent README wall and ${providers.length} generated icons match the built-in Provider catalog.`
    )
    return
  }

  await writeGeneratedState(cwd, generatedAssets, expectedWall)
  console.log(`Generated ${providers.length} Agent README icons and synchronized the README wall.`)
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

async function writeGeneratedState(cwd, generatedAssets, expectedWall) {
  const outputDirectory = join(cwd, outputDirectoryPath)
  await mkdir(outputDirectory, { recursive: true })
  await Promise.all(
    [...generatedAssets].map(([fileName, contents]) =>
      writeFile(join(outputDirectory, fileName), contents)
    )
  )

  const absoluteReadmePath = join(cwd, readmePath)
  const readme = await readFile(absoluteReadmePath, 'utf8')
  const synchronizedReadme = replaceGeneratedWall(readme, expectedWall)
  await writeFile(absoluteReadmePath, synchronizedReadme)
}

async function checkGeneratedState(cwd, generatedAssets, expectedWall) {
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

  const readme = await readFile(join(cwd, readmePath), 'utf8')
  if (replaceGeneratedWall(readme, expectedWall) !== readme) {
    violations.push('README Agent Provider wall is stale')
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

function renderProviderWall(providers) {
  return [
    wallStartMarker,
    '',
    `cleancode 内建 **${providers.length} 个 Coding Agent Provider**。它们都可以进入同一个可见、可执行的开发世界，与终端、服务、分支和运行状态一起工作。`,
    '',
    '<p>',
    ...providers.map((provider) => {
      const extension = 'imageDataUrl' in provider.icon ? 'png' : 'svg'
      const iconPath = `./${outputDirectoryPath}/${provider.id}.${extension}`
      return `  <a href="${escapeHtml(provider.documentationUrl)}"><kbd><img src="${iconPath}" width="18" height="18" alt="" /> ${escapeHtml(provider.displayName)}</kbd></a>`
    }),
    '</p>',
    '',
    `**${providers.length} 个主流 Coding Agent，全部可以在 cleancode 中拥有一个真正的开发现场。**`,
    '',
    wallEndMarker
  ].join('\n')
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
