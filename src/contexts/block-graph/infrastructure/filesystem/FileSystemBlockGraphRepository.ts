import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import type { BlockGraphRepository } from '../../application/ports/BlockGraphRepository'
import type { BlockGraphSnapshot } from '../../application/dto/BlockGraphSnapshot'
import { BlockGraph } from '../../domain/aggregates/BlockGraph'

const graphFileName = 'default-graph.json'

function getLegacyDefaultGraphPath(projectDirectory: string, workspaceName: string): string {
  return join(projectDirectory, '.cleancode', 'workspaces', workspaceName, graphFileName)
}

function getDefaultGraphPath(
  storageDirectory: string,
  projectDirectory: string,
  workspaceName: string
): string {
  return join(
    storageDirectory,
    'projects',
    createProjectStorageKey(projectDirectory),
    'workspaces',
    encodeURIComponent(workspaceName),
    graphFileName
  )
}

function createProjectStorageKey(projectDirectory: string): string {
  return createHash('sha256').update(resolve(projectDirectory)).digest('hex')
}

export class FileSystemBlockGraphRepository implements BlockGraphRepository {
  constructor(private readonly storageDirectory: string) {}

  async saveDefaultGraph(projectDirectory: string, graph: BlockGraph): Promise<void> {
    const graphPath = getDefaultGraphPath(
      this.storageDirectory,
      projectDirectory,
      graph.workspaceName
    )

    await mkdir(dirname(graphPath), { recursive: true })
    await writeFile(graphPath, `${JSON.stringify(graph.toSnapshot(), null, 2)}\n`)
  }

  async findDefaultGraph(
    projectDirectory: string,
    workspaceName: string
  ): Promise<BlockGraph | null> {
    const snapshot = await this.findDefaultGraphSnapshot(projectDirectory, workspaceName)

    return snapshot ? BlockGraph.fromSnapshot(snapshot) : null
  }

  async findDefaultGraphSnapshot(
    projectDirectory: string,
    workspaceName: string
  ): Promise<BlockGraphSnapshot | null> {
    const graph = await readGraphSnapshot(
      getDefaultGraphPath(this.storageDirectory, projectDirectory, workspaceName)
    )

    if (graph) {
      return graph
    }

    const legacyGraph = await readGraphSnapshot(
      getLegacyDefaultGraphPath(projectDirectory, workspaceName)
    )

    if (!legacyGraph) {
      return null
    }

    await this.saveDefaultGraph(projectDirectory, BlockGraph.fromSnapshot(legacyGraph))

    return legacyGraph
  }
}

async function readGraphSnapshot(graphPath: string): Promise<BlockGraphSnapshot | null> {
  try {
    return JSON.parse(await readFile(graphPath, 'utf8')) as BlockGraphSnapshot
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
