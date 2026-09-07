import { runInNewContext } from 'node:vm'

import { codexNativeMessageFiles } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexNativeMessageFiles'

describe('Codex native response publication', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'])(
    'publishes the complete response after a temporary Windows %s lock and removes staging files',
    async (code) => {
      const { publish, files } = createWriter('win32', code, 2)
      await publish('response', { id: 'attempt', ok: true })
      expect([...files]).toEqual([['response', '{"id":"attempt","ok":true}']])
    }
  )

  it.each([
    ['win32', 'EPERM', Infinity],
    ['win32', 'ENOSPC', 1],
    ['linux', 'EPERM', 1],
    ['darwin', 'EACCES', 1]
  ] as const)(
    'preserves the previous response and cleans staging files for %s %s failures',
    async (platform, code, failures) => {
      const { publish, files } = createWriter(platform, code, failures)
      await expect(publish('response', { id: 'attempt', ok: true })).rejects.toMatchObject({
        code
      })
      expect([...files]).toEqual([['response', 'previous response']])
    }
  )
})

function createWriter(platform: string, code: string, failures: number) {
  const files = new Map([['response', 'previous response']])
  const publish = runInNewContext(`${codexNativeMessageFiles}\npublish`, {
    process: { platform },
    randomBytes: () => Buffer.from('staging'),
    writeFile: async (path: string, contents: string) => {
      files.set(path, contents)
    },
    rename: async (from: string, to: string) => {
      if (failures-- > 0) throw Object.assign(new Error('File sharing lock'), { code })
      files.set(to, files.get(from)!)
      files.delete(from)
    },
    unlink: async (path: string) => {
      files.delete(path)
    },
    // Exercise the bounded policy without wall-clock waits in this unit test.
    setTimeout: (callback: () => void) => queueMicrotask(callback)
  }) as (path: string, value: unknown) => Promise<void>
  return { publish, files }
}
