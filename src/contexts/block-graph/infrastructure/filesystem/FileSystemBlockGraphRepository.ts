import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import type { BlockGraphRepository } from '../../application/ports/BlockGraphRepository'
import type {
  BlockGraphSnapshot,
  RestorableBlockGraphSnapshot
} from '../../application/dto/BlockGraphSnapshot'
import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

const graphFileName = 'default-graph.json'
const graphMutationQueues = new Map<string, Promise<unknown>>()

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

  async initializeDefaultGraph(
    projectDirectory: string,
    graph: BlockGraph
  ): Promise<BlockGraphSnapshot> {
    const candidate = graph.toSnapshot()
    const graphPath = getDefaultGraphPath(
      this.storageDirectory,
      projectDirectory,
      candidate.workspaceName
    )

    return enqueueGraphMutation(graphPath, async () => {
      const existing = await readGraphSnapshot(graphPath)

      if (existing) return normalizeGraphSnapshot(existing)

      const legacy = await readGraphSnapshot(
        getLegacyDefaultGraphPath(projectDirectory, candidate.workspaceName)
      )
      const initialized = legacy ? BlockGraph.fromSnapshot(legacy).toSnapshot() : candidate

      await writeFileAtomically(graphPath, serializeGraphSnapshot(initialized))
      return initialized
    })
  }

  async transactDefaultGraph<TResult>(
    projectDirectory: string,
    workspaceName: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ) {
    const graphPath = getDefaultGraphPath(this.storageDirectory, projectDirectory, workspaceName)

    return enqueueGraphMutation(graphPath, async () => {
      const snapshot =
        (await readGraphSnapshot(graphPath)) ??
        (await readGraphSnapshot(getLegacyDefaultGraphPath(projectDirectory, workspaceName)))

      if (!snapshot) {
        return null
      }

      const graph = BlockGraph.fromSnapshot(snapshot)
      const result = await transaction(graph)
      const graphSnapshot = graph.toSnapshot()

      await writeFileAtomically(graphPath, serializeGraphSnapshot(graphSnapshot))

      return { graph: graphSnapshot, result }
    })
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
    const graphPath = getDefaultGraphPath(this.storageDirectory, projectDirectory, workspaceName)
    const graph = await readGraphSnapshot(graphPath)

    if (graph) {
      return normalizeGraphSnapshot(graph)
    }

    return enqueueGraphMutation(graphPath, async () => {
      const currentGraph = await readGraphSnapshot(graphPath)

      if (currentGraph) {
        return normalizeGraphSnapshot(currentGraph)
      }

      const legacyGraph = await readGraphSnapshot(
        getLegacyDefaultGraphPath(projectDirectory, workspaceName)
      )

      if (!legacyGraph) {
        return null
      }

      const migratedGraph = BlockGraph.fromSnapshot(legacyGraph).toSnapshot()

      await writeFileAtomically(graphPath, serializeGraphSnapshot(migratedGraph))

      return migratedGraph
    })
  }
}

async function readGraphSnapshot(graphPath: string): Promise<RestorableBlockGraphSnapshot | null> {
  try {
    return JSON.parse(await readFile(graphPath, 'utf8')) as RestorableBlockGraphSnapshot
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    if (error instanceof SyntaxError) {
      throw createExpectedAppError(
        'BLOCK_GRAPH_SNAPSHOT_CORRUPTED',
        'Persisted block graph snapshot is corrupted.',
        { path: graphPath }
      )
    }

    throw error
  }
}

async function enqueueGraphMutation<TResult>(
  graphPath: string,
  mutateGraph: () => Promise<TResult>
): Promise<TResult> {
  const queueKey = resolve(graphPath)
  const previousMutation = graphMutationQueues.get(queueKey) ?? Promise.resolve()
  const currentMutation = previousMutation.catch(() => undefined).then(mutateGraph)

  graphMutationQueues.set(queueKey, currentMutation)

  try {
    return await currentMutation
  } finally {
    if (graphMutationQueues.get(queueKey) === currentMutation) {
      graphMutationQueues.delete(queueKey)
    }
  }
}

function serializeGraphSnapshot(snapshot: BlockGraphSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const directory = dirname(filePath)
  const temporaryPath = join(directory, `.${basename(filePath)}.tmp-${process.pid}-${randomUUID()}`)
  let temporaryFile: FileHandle | null = null

  await mkdir(directory, { recursive: true })

  try {
    temporaryFile = await open(temporaryPath, 'wx')
    await temporaryFile.writeFile(contents)
    await temporaryFile.sync()
    await temporaryFile.close()
    temporaryFile = null
    await rename(temporaryPath, filePath)
    await syncDirectory(directory)
  } catch (error) {
    if (temporaryFile) {
      await temporaryFile.close().catch(() => undefined)
    }

    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let directoryHandle: FileHandle | null = null

  try {
    directoryHandle = await open(directory, 'r')
    await directoryHandle.sync()
  } catch (error) {
    if (isUnsupportedDirectorySyncError(error)) {
      return
    }

    throw error
  } finally {
    await directoryHandle?.close().catch(() => undefined)
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

function isUnsupportedDirectorySyncError(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error)) {
    return false
  }

  return ['EISDIR', 'EINVAL', 'ENOTSUP', 'EPERM'].includes(
    (error as NodeJS.ErrnoException).code ?? ''
  )
}

function normalizeGraphSnapshot(snapshot: RestorableBlockGraphSnapshot): BlockGraphSnapshot {
  return BlockGraph.fromSnapshot(snapshot).toSnapshot()
}
