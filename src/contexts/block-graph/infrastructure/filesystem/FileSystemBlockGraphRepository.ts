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
const graphSaveQueues = new Map<string, Promise<void>>()

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
    const serializedGraph = `${JSON.stringify(graph.toSnapshot(), null, 2)}\n`

    await enqueueGraphSave(graphPath, async () => {
      await writeFileAtomically(graphPath, serializedGraph)
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
    const graph = await readGraphSnapshot(
      getDefaultGraphPath(this.storageDirectory, projectDirectory, workspaceName)
    )

    if (graph) {
      return normalizeGraphSnapshot(graph)
    }

    const legacyGraph = await readGraphSnapshot(
      getLegacyDefaultGraphPath(projectDirectory, workspaceName)
    )

    if (!legacyGraph) {
      return null
    }

    const migratedGraph = BlockGraph.fromSnapshot(legacyGraph)

    await this.saveDefaultGraph(projectDirectory, migratedGraph)

    return migratedGraph.toSnapshot()
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

async function enqueueGraphSave(graphPath: string, saveGraph: () => Promise<void>): Promise<void> {
  const queueKey = resolve(graphPath)
  const previousSave = graphSaveQueues.get(queueKey) ?? Promise.resolve()
  const currentSave = previousSave.catch(() => undefined).then(saveGraph)

  graphSaveQueues.set(queueKey, currentSave)

  try {
    await currentSave
  } finally {
    if (graphSaveQueues.get(queueKey) === currentSave) {
      graphSaveQueues.delete(queueKey)
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
