import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  CanvasArrangementRepository,
  CanvasArrangementScope
} from '../../application/ports/CanvasArrangementRepository'
import { CanvasArrangement } from '../../domain/aggregates/CanvasArrangement'
import {
  parseCanvasArrangementStore,
  serializeCanvasArrangementStore
} from './CanvasArrangementStore'

const mutationQueues = new Map<string, Promise<unknown>>()
const windowsRenameRetryDelaysMs = [10, 20, 40, 80, 160] as const

export class FileSystemCanvasArrangementRepository implements CanvasArrangementRepository {
  constructor(private readonly storageDirectory: string) {}

  async findWorkspaceSnapshot(projectDirectory: string, workspaceId: string) {
    const filePath = getCanvasArrangementPath(this.storageDirectory, projectDirectory, workspaceId)
    const snapshot = await readArrangement(filePath)
    if (snapshot && snapshot.workspaceId !== workspaceId) scopeMismatch(filePath)
    return snapshot
  }

  async transactWorkspace<TResult>(
    projectDirectory: string,
    scope: CanvasArrangementScope,
    transaction: (arrangement: CanvasArrangement) => TResult | Promise<TResult>
  ) {
    const filePath = getCanvasArrangementPath(
      this.storageDirectory,
      projectDirectory,
      scope.workspaceId
    )

    return enqueueMutation(filePath, async () => {
      const stored = await readArrangement(filePath)
      if (
        stored &&
        (stored.projectId !== scope.projectId || stored.workspaceId !== scope.workspaceId)
      ) {
        scopeMismatch(filePath)
      }
      const arrangement = stored
        ? CanvasArrangement.fromSnapshot(stored)
        : CanvasArrangement.create(scope)
      const result = await transaction(arrangement)
      const snapshot = arrangement.toSnapshot()
      await writeFileAtomically(filePath, serializeCanvasArrangementStore(snapshot))
      return { result, snapshot }
    })
  }
}

function getCanvasArrangementPath(
  storageDirectory: string,
  projectDirectory: string,
  workspaceId: string
): string {
  const projectKey = createHash('sha256').update(resolve(projectDirectory)).digest('hex')
  return join(
    storageDirectory,
    'projects',
    projectKey,
    'workspaces',
    encodeURIComponent(workspaceId),
    'canvas-arrangement.json'
  )
}

async function readArrangement(filePath: string) {
  try {
    return parseCanvasArrangementStore(await readFile(filePath, 'utf8'), filePath)
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}

async function enqueueMutation<TResult>(
  filePath: string,
  mutation: () => Promise<TResult>
): Promise<TResult> {
  const queueKey = resolve(filePath)
  const previous = mutationQueues.get(queueKey) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(mutation)
  mutationQueues.set(queueKey, current)

  try {
    return await current
  } finally {
    if (mutationQueues.get(queueKey) === current) mutationQueues.delete(queueKey)
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
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined)
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

function scopeMismatch(path: string): never {
  throw createExpectedAppError(
    'CANVAS_ARRANGEMENT_SCOPE_MISMATCH',
    'Canvas arrangement workspace identity does not match its storage scope.',
    { path }
  )
}

function isTransientRenameError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['EACCES', 'EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')
  )
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}
