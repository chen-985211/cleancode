import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import type { BlockTemplateRepository } from '../../application/ports/BlockTemplateRepository'
import { BlockTemplateLibrary } from '../../domain/aggregates/BlockTemplateLibrary'
import { parseBlockTemplateStore, serializeBlockTemplateStore } from './BlockTemplateStore'

const mutationQueues = new Map<string, Promise<unknown>>()
const windowsRenameRetryDelaysMs = [10, 20, 40, 80, 160] as const

export class FileSystemBlockTemplateRepository implements BlockTemplateRepository {
  constructor(private readonly filePath: string) {}

  async get() {
    return readLibrary(this.filePath)
  }

  async transact<TResult>(
    transaction: (library: BlockTemplateLibrary) => TResult | Promise<TResult>
  ) {
    return enqueueMutation(this.filePath, async () => {
      const library = BlockTemplateLibrary.restore(await readLibrary(this.filePath))
      const result = await transaction(library)
      const snapshot = library.toSnapshot()

      await writeFileAtomically(this.filePath, serializeBlockTemplateStore(snapshot))

      return { library: snapshot, result }
    })
  }
}

async function readLibrary(filePath: string) {
  try {
    return parseBlockTemplateStore(await readFile(filePath, 'utf8'), filePath)
  } catch (error) {
    if (isMissingFileError(error)) {
      return BlockTemplateLibrary.empty().toSnapshot()
    }
    throw error
  }
}

async function enqueueMutation<TResult>(
  filePath: string,
  transaction: () => Promise<TResult>
): Promise<TResult> {
  const key = resolve(filePath)
  const previous = mutationQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(transaction)
  mutationQueues.set(key, current)

  try {
    return await current
  } finally {
    if (mutationQueues.get(key) === current) {
      mutationQueues.delete(key)
    }
  }
}

async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const directory = dirname(filePath)
  const temporaryPath = join(directory, `.${basename(filePath)}.tmp-${process.pid}-${randomUUID()}`)
  let temporaryFile: FileHandle | null = null

  await mkdir(directory, { recursive: true })

  try {
    temporaryFile = await open(temporaryPath, 'wx', 0o600)
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
      if (!shouldRetryWindowsRename(error, attempt)) {
        throw error
      }
      await wait(windowsRenameRetryDelaysMs[attempt]!)
    }
  }
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, 'r')
    await handle.sync()
    await handle.close()
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error
    }
  }
}

function shouldRetryWindowsRename(error: unknown, attempt: number): boolean {
  return (
    process.platform === 'win32' &&
    attempt < windowsRenameRetryDelaysMs.length &&
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EBUSY')
  )
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, durationMs))
}
