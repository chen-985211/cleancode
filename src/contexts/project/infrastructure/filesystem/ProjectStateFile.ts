import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

const mutations = new Map<string, Promise<unknown>>()

export async function mutateProjectStateFile<T>(
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = resolve(path)
  const current = (mutations.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation)
  mutations.set(key, current)
  try {
    return await current
  } finally {
    if (mutations.get(key) === current) mutations.delete(key)
  }
}

export async function writeProjectStateFile(path: string, contents: string): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.${basename(path)}.tmp-${randomUUID()}`)
  try {
    const file = await open(temporary, 'wx')
    try {
      await file.writeFile(contents)
      await file.sync()
    } finally {
      await file.close()
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, path)
        break
      } catch (error) {
        if (
          process.platform !== 'win32' ||
          attempt >= 5 ||
          !hasCode(error, ['EACCES', 'EBUSY', 'EPERM'])
        )
          throw error
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10 * 2 ** attempt))
      }
    }
    let handle
    try {
      handle = await open(directory, 'r')
      await handle.sync()
    } catch (error) {
      if (!hasCode(error, ['EISDIR', 'EINVAL', 'ENOTSUP', 'EPERM'])) throw error
    } finally {
      await handle?.close()
    }
  } finally {
    await unlink(temporary).catch(() => undefined)
  }
}

function hasCode(error: unknown, codes: readonly string[]): boolean {
  return error instanceof Error && 'code' in error && codes.includes(String(error.code))
}
