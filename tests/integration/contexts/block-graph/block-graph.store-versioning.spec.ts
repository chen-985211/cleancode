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

  it('writes new graphs in the version 2 envelope', async () => {
    const repository = new FileSystemBlockGraphRepository(appStateDirectory)
    const graph = BlockGraph.createDefault({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main'
    })

    await repository.initializeDefaultGraph(projectDirectory, graph)

    await expect(readStore(appStateDirectory)).resolves.toEqual({
      graph: graph.toSnapshot(),
      version: 2
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
    const originalStore = `${JSON.stringify({ graph: malformedGraph, version: 2 }, null, 2)}\n`
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
