import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import type { BlockGraphRepository } from '../../application/ports/BlockGraphRepository'
import type { BlockGraphSnapshot } from '../../application/dto/BlockGraphSnapshot'
import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import {
  parseBlockGraphStore,
  serializeBlockGraphStore,
  type ParsedBlockGraphStore
} from './BlockGraphStore'

const graphFileName = 'default-graph.json'
const graphMutationQueues = new Map<string, Promise<unknown>>()
const windowsRenameRetryDelaysMs = [10, 20, 40, 80, 160] as const

function getDefaultGraphPath(
  storageDirectory: string,
  projectDirectory: string,
  workspaceId: string
): string {
  return join(
    storageDirectory,
    'projects',
    createProjectStorageKey(projectDirectory),
    'workspaces',
    encodeURIComponent(workspaceId),
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
      candidate.workspaceId
    )

    return enqueueGraphMutation(graphPath, async () => {
      const existing = await readGraphStore(graphPath)

      if (existing) {
        return existing.graph
      }

      await writeFileAtomically(graphPath, serializeBlockGraphStore(candidate))
      return candidate
    })
  }

  async transactDefaultGraph<TResult>(
    projectDirectory: string,
    workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ) {
    const graphPath = getDefaultGraphPath(this.storageDirectory, projectDirectory, workspaceId)

    return enqueueGraphMutation(graphPath, async () => {
      const snapshot = await readGraphStore(graphPath)

      if (!snapshot) {
        return null
      }

      const graph = BlockGraph.fromSnapshot(snapshot.graph)
      const result = await transaction(graph)
      const graphSnapshot = graph.toSnapshot()

      await writeFileAtomically(graphPath, serializeBlockGraphStore(graphSnapshot))

      return { graph: graphSnapshot, result }
    })
  }

  async findDefaultGraph(
    projectDirectory: string,
    workspaceId: string
  ): Promise<BlockGraph | null> {
    const snapshot = await this.findDefaultGraphSnapshot(projectDirectory, workspaceId)

    return snapshot ? BlockGraph.fromSnapshot(snapshot) : null
  }

  async findDefaultGraphSnapshot(
    projectDirectory: string,
    workspaceId: string
  ): Promise<BlockGraphSnapshot | null> {
    const graphPath = getDefaultGraphPath(this.storageDirectory, projectDirectory, workspaceId)
    const graph = await readGraphStore(graphPath)

    if (graph) {
      return graph.graph
    }
    return null
  }
}

async function readGraphStore(graphPath: string): Promise<ParsedBlockGraphStore | null> {
  try {
    return parseBlockGraphStore(await readFile(graphPath, 'utf8'), graphPath)
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
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
    await replaceFile(temporaryPath, filePath)
    await syncDirectory(directory)
  } catch (error) {
    if (temporaryFile) {
      await temporaryFile.close().catch(() => undefined)
    }

    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function replaceFile(sourcePath: string, targetPath: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(sourcePath, targetPath)
      return
    } catch (error) {
      const retryDelay = windowsRenameRetryDelaysMs[attempt]
      if (
        process.platform !== 'win32' ||
        retryDelay === undefined ||
        !isTransientRenameError(error)
      ) {
        throw error
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelay))
    }
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

function isTransientRenameError(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error)) {
    return false
  }

  return ['EACCES', 'EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')
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
