import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createServer } from 'vite'

const catalogModulePath =
  '/src/contexts/agent/infrastructure/providers/catalog/BuiltinAgentProviderCatalog.ts'
const outputDirectoryPath = 'docs/assets/agent-providers'
const badgeFilePrefix = 'badge-'
const anyCliAgentBadgeFileName = `${badgeFilePrefix}any-cli-agent.svg`
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
  const generatedIconAssets = new Map(
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
  const generatedBadgeAssets = new Map([
    ...providers.map((provider) => [
      `${badgeFilePrefix}${provider.id}.svg`,
      Buffer.from(renderAgentBadge(provider.displayName, provider.icon))
    ]),
    [anyCliAgentBadgeFileName, Buffer.from(renderAnyCliAgentBadge())]
  ])
  const generatedAssets = new Map([...generatedIconAssets, ...generatedBadgeAssets])
  const expectedWalls = new Map(
    readmeTargets.map(({ locale, path }) => [path, renderProviderWall(providers, locale)])
  )

  if (shouldCheck) {
    await checkGeneratedState(cwd, generatedAssets, expectedWalls)
    console.log(
      `Agent README walls, ${providers.length} generated icons, and ${providers.length + 1} badges match the built-in Provider catalog.`
    )
    return
  }

  await writeGeneratedState(cwd, generatedAssets, expectedWalls)
  console.log(
    `Generated ${providers.length} Agent README icons, ${providers.length + 1} badges, and synchronized both README walls.`
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
      const badgePath = `./${outputDirectoryPath}/${badgeFilePrefix}${provider.id}.svg`
      return `  <a href="${escapeHtml(provider.documentationUrl)}"><img src="${badgePath}" height="30" alt="${escapeHtml(provider.displayName)}" /></a>`
    }),
    `  <img src="./${outputDirectoryPath}/${anyCliAgentBadgeFileName}" height="30" alt="Any CLI Agent" />`,
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
      introduction: [
        `There is a key idea here: CleanCode is not built by binding itself to a few specific Agents. Its foundation is the terminal, so the **${providerCount} Coding Agent Providers** are more like entries we prepared first: common Agent commands, icons, detection, and default arguments are already organized.`,
        'Look one layer deeper, and any Agent that can start from the command line can theoretically enter this canvas as a terminal process. Run the command in a terminal, then pin it to the current workspace with the pin button in the terminal header. Now it is no longer just a temporary command opened for one conversation. It becomes an Agent context that can stay in the background and keep working.'
      ].join('\n\n'),
      conclusion:
        '**Keep using the Agents you already know; CleanCode pins those CLI processes into a visible, runnable development context that stays with the work.**'
    }
  }
  if (locale === 'zh-CN') {
    return {
      introduction: [
        `这里有一个很关键的地方：CleanCode 并不是靠绑定某几个 Agent 来成立的。它的底座是终端，所以 **${providerCount} 个 Coding Agent Provider** 更像是我们先替你铺好的入口：常见 Agent 的命令、图标、检测方式和默认参数已经整理好。`,
        '再往下看，只要一个 Agent 能从命令行启动，它理论上就可以先作为一个终端进程进入这张画布。你在终端里输入命令，把它跑起来，再用终端右上角的图钉把它钉在当前工作区里。这样它就不再只是某次对话里临时打开的一条命令，而是一个可以留在后台、继续工作的 Agent 现场。'
      ].join('\n\n'),
      conclusion:
        '**你继续使用熟悉的 Agent；CleanCode 负责把这些 CLI 进程钉在一张可见、可运行、可长期停留的开发现场里。**'
    }
  }
  throw new Error(`Unsupported README locale: ${locale}`)
}

function renderAgentBadge(label, icon) {
  const height = 30
  const iconSize = 18
  const paddingLeft = 8
  const iconGap = 8
  const paddingRight = 11
  const textX = paddingLeft + iconSize + iconGap
  const textWidth = estimateBadgeTextWidth(label)
  const width = Math.ceil(textX + textWidth + paddingRight)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">`,
    '<rect x="0.5" y="0.5" width="' +
      (width - 1) +
      '" height="29" rx="6" fill="#24292f" stroke="#444d56"/>',
    renderBadgeIcon(icon, paddingLeft, 6, iconSize),
    `<text x="${textX}" y="15.5" fill="#e6edf3" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" font-weight="600" dominant-baseline="middle">${escapeXml(label)}</text>`,
    '</svg>',
    ''
  ].join('\n')
}

function renderAnyCliAgentBadge() {
  const terminalIcon = [
    '<g fill="none" stroke="#e6edf3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">',
    '<path d="M5.5 7.5 9.5 11 5.5 14.5"/>',
    '<path d="M11.5 14.5h5"/>',
    '</g>'
  ].join('')
  return renderAgentBadge('Any CLI Agent', { customContent: terminalIcon, viewBox: '0 0 22 22' })
}

function renderBadgeIcon(icon, x, y, size) {
  if ('customContent' in icon) {
    return `<g transform="translate(${x} ${y}) scale(${size / 22})">${icon.customContent}</g>`
  }
  if ('imageDataUrl' in icon) {
    return `<image href="${escapeXml(icon.imageDataUrl)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`
  }

  const viewBox = parseViewBox(icon.viewBox)
  const scale = size / Math.max(viewBox.width, viewBox.height)
  const offsetX = x + (size - viewBox.width * scale) / 2
  const offsetY = y + (size - viewBox.height * scale) / 2
  const gradients = renderGradientDefinitions(icon.linearGradients ?? [])
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
    gradients,
    `<g color="#e6edf3" transform="translate(${formatNumber(offsetX)} ${formatNumber(offsetY)}) scale(${formatNumber(scale)}) translate(${formatNumber(-viewBox.minX)} ${formatNumber(-viewBox.minY)})">${paths}</g>`
  ].join('')
}

function renderGradientDefinitions(gradients) {
  if (gradients.length === 0) return ''
  return `<defs>${gradients
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
}

function parseViewBox(viewBox) {
  const [minX, minY, width, height] = viewBox.trim().split(/\s+/).map(Number)
  if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`Unsupported Agent icon viewBox: ${viewBox}`)
  }
  return { minX, minY, width, height }
}

function estimateBadgeTextWidth(label) {
  return [...label].reduce((total, character) => {
    if (character === ' ') return total + 5
    if (/[A-Z0-9]/.test(character)) return total + 8.8
    return total + 8.1
  }, 0)
}

function formatNumber(value) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function decodeRasterIcon(imageDataUrl) {
  const prefix = 'data:image/png;base64,'
  if (!imageDataUrl.startsWith(prefix)) throw new Error('Unsupported Agent raster icon format.')
  return Buffer.from(imageDataUrl.slice(prefix.length), 'base64')
}

function renderVectorIcon(icon) {
  const gradients = icon.linearGradients ?? []
  const definitions = gradients.length === 0 ? '' : renderGradientDefinitions(gradients)
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
