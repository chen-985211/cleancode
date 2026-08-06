import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { FileSystemBlockGraphRepository } from '../../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'
import { getAppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'

describe('block graph versioned store', () => {
  let appStateDirectory: string
  let projectDirectory: string

  beforeEach(async () => {
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-app-state-'))
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-project-'))
  })

  afterEach(async () => {
    await rm(appStateDirectory, { force: true, recursive: true })
    await rm(projectDirectory, { force: true, recursive: true })
  })

  it('writes new graphs in the version 4 envelope', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main'
    })

    await repository.initializeDefaultGraph(projectDirectory, graph)

    await expect(readStore(appStateDirectory)).resolves.toEqual({
      graph: graph.toSnapshot(),
      version: 4
    })
  })

  it('reads version 2 with five empty slots and rewrites only on the next transaction', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graphPath = await initializeAndFindGraphPath(
      repository,
      appStateDirectory,
      projectDirectory
    )
    const versionTwoStore = `${JSON.stringify(
      { graph: createRawGraph([]), version: 2 },
      null,
      2
    )}\n`
    await writeFile(graphPath, versionTwoStore)

    const restored = await repository.findDefaultGraphSnapshot(projectDirectory, 'main')

    expect(restored?.quickExecutionSlots).toEqual([
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ])
    await expect(readFile(graphPath, 'utf8')).resolves.toBe(versionTwoStore)

    await repository.transactDefaultGraph(projectDirectory, 'main', (graph) => {
      graph.updateViewport({ x: 48 })
    })

    await expect(readStore(appStateDirectory)).resolves.toMatchObject({
      graph: { quickExecutionSlots: restored?.quickExecutionSlots },
      version: 4
    })
  })

  it('repairs legacy cross-space workflows on read and persists version 4 on the next transaction', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graphPath = await initializeAndFindGraphPath(
      repository,
      appStateDirectory,
      projectDirectory
    )
    const legacyGraph = BlockGraph.createDefault({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main'
    })
    const source = legacyGraph.createTerminalBlock({
      id: 'source',
      name: 'Source',
      description: '',
      position: { x: 100, y: 100 }
    })
    const target = legacyGraph.createTerminalBlock({
      id: 'target',
      name: 'Target',
      description: '',
      position: { x: 700, y: 100 }
    })
    legacyGraph.connectTerminalBlocks({ sourceBlockId: source.id, targetBlockId: target.id })
    const legacySnapshot = legacyGraph.toSnapshot()
    const versionThreeStore = `${JSON.stringify(
      {
        graph: {
          ...legacySnapshot,
          terminalGroups: [
            {
              id: 'legacy-group',
              type: 'terminal-group',
              name: 'Legacy',
              position: { x: 64, y: 24 },
              size: { width: 520, height: 460 },
              isCollapsed: false,
              memberBlockIds: [source.id]
            }
          ]
        },
        version: 3
      },
      null,
      2
    )}\n`
    await writeFile(graphPath, versionThreeStore)

    const restored = await repository.findDefaultGraphSnapshot(projectDirectory, 'main')

    expect(restored?.connections).toHaveLength(1)
    expect(restored?.terminalGroups).toEqual([
      expect.objectContaining({ id: 'legacy-group', memberBlockIds: [] })
    ])
    await expect(readFile(graphPath, 'utf8')).resolves.toBe(versionThreeStore)

    await repository.transactDefaultGraph(projectDirectory, 'main', (graph) => {
      graph.updateViewport({ x: 48 })
    })

    await expect(readStore(appStateDirectory)).resolves.toMatchObject({
      graph: {
        connections: [
          expect.objectContaining({ sourceBlockId: source.id, targetBlockId: target.id })
        ],
        terminalGroups: [expect.objectContaining({ id: 'legacy-group', memberBlockIds: [] })]
      },
      version: 4
    })
  })

  it('rejects a raw legacy graph without migrating or rewriting it', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graphPath = await initializeAndFindGraphPath(
      repository,
      appStateDirectory,
      projectDirectory
    )
    const legacyGraph = createRawGraph([
      {
        executionConfig: {
          mode: 'service',
          readiness: { port: 4_173, type: 'tcp' },
          readinessTimeoutMs: 30_000
        },
        id: 'tcp-server'
      },
      {
        executionConfig: {
          mode: 'service',
          readiness: { text: 'ready', type: 'output' },
          readinessTimeoutMs: 30_000
        },
        id: 'output-server'
      }
    ])
    const legacyContents = `${JSON.stringify(legacyGraph, null, 2)}\n`
    await writeFile(graphPath, legacyContents)

    await expect(repository.findDefaultGraphSnapshot(projectDirectory, 'main')).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED'
    )
    await expect(readFile(graphPath, 'utf8')).resolves.toBe(legacyContents)
  })

  it('rejects an unsupported store version without rewriting it', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graphPath = await initializeAndFindGraphPath(
      repository,
      appStateDirectory,
      projectDirectory
    )
    const unsupportedStore = `${JSON.stringify({ graph: createRawGraph([]), version: 99 }, null, 2)}\n`
    await writeFile(graphPath, unsupportedStore)

    await expect(repository.findDefaultGraphSnapshot(projectDirectory, 'main')).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED'
    )
    await expect(readFile(graphPath, 'utf8')).resolves.toBe(unsupportedStore)
  })

  it('rejects a present malformed execution config without silently restoring a task', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graphPath = await initializeAndFindGraphPath(
      repository,
      appStateDirectory,
      projectDirectory
    )
    const malformedGraph = createRawGraph([
      {
        executionConfig: {
          mode: 'service',
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        },
        id: 'invalid-server'
      }
    ])
    const originalStore = `${JSON.stringify(
      {
        graph: {
          ...malformedGraph,
          quickExecutionSlots: [
            { number: 1, target: null },
            { number: 2, target: null },
            { number: 3, target: null },
            { number: 4, target: null },
            { number: 5, target: null }
          ]
        },
        version: 3
      },
      null,
      2
    )}\n`
    await writeFile(graphPath, originalStore)

    await expect(repository.findDefaultGraphSnapshot(projectDirectory, 'main')).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'BLOCK_GRAPH_SNAPSHOT_CORRUPTED'
    )
    await expect(readFile(graphPath, 'utf8')).resolves.toBe(originalStore)
  })
})

function createRawGraph(
  blocks: readonly { readonly executionConfig: unknown; readonly id: string }[]
) {
  return {
    blocks: blocks.map((block, index) => ({
      description: '',
      executionConfig: block.executionConfig,
      id: block.id,
      launchCommand: 'pnpm dev',
      name: block.id,
      position: { x: index * 600, y: 0 },
      type: 'terminal'
    })),
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main'
  }
}

async function initializeAndFindGraphPath(
  repository: FileSystemBlockGraphRepository,
  appStateDirectory: string,
  projectDirectory: string
): Promise<string> {
  await repository.initializeDefaultGraph(
    projectDirectory,
    BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  )
  return findOnlyFileNamed(appStateDirectory, 'default-graph.json')
}

async function readStore(directory: string): Promise<unknown> {
  return JSON.parse(
    await readFile(await findOnlyFileNamed(directory, 'default-graph.json'), 'utf8')
  )
}

async function findOnlyFileNamed(directory: string, fileName: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findFileNamed(path, fileName)
      if (nested) return nested
    } else if (entry.isFile() && entry.name === fileName) {
      return path
    }
  }

  throw new Error(`Expected ${fileName}.`)
}

async function findFileNamed(directory: string, fileName: string): Promise<string | null> {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findFileNamed(path, fileName)
      if (nested) return nested
    } else if (entry.isFile() && entry.name === fileName) {
      return path
    }
  }

  return null
}
