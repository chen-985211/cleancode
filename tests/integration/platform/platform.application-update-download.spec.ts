import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

describe('real electron-updater download verification', () => {
  it.each([false, true])(
    'accepts only the published checksum (corrupt=%s)',
    async (corrupt) => {
      const directory = await mkdtemp(join(tmpdir(), 'cleancode-update-download-'))
      const bytes = Buffer.alloc(256 * 1024, 42)
      const checksum = createHash('sha512').update(bytes).digest('base64')
      const requests: string[] = []
      const server = createServer((request, response) => {
        requests.push(request.url ?? '')
        if (request.url?.startsWith('/latest')) {
          response.setHeader('Content-Type', 'text/yaml')
          response.end(
            `version: 0.2.0\nfiles:\n  - url: update.exe\n    sha512: ${checksum}\n    size: ${bytes.length}\npath: update.exe\nsha512: ${checksum}\nreleaseDate: '2026-01-01T00:00:00.000Z'\n`
          )
        } else {
          response.setHeader('Content-Length', bytes.length)
          response.end(corrupt ? Buffer.alloc(bytes.length, 43) : bytes)
        }
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (address === null || typeof address === 'string')
        throw new Error('Expected local TCP server')
      const env: Record<string, string> = {}
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
      }
      const application = await electron.launch({
        args: [
          join(process.cwd(), 'tests', 'fixtures', 'platform', 'applicationUpdateWindow.mjs'),
          `--user-data-dir=${join(directory, 'profile')}`
        ],
        env
      })
      try {
        await application.firstWindow()
        const result = await application.evaluate(
          async (_electron, input) => {
            const probe = globalThis as typeof globalThis & {
              runUpdateProbe: (
                value: typeof input
              ) => Promise<{ ready: boolean; size: number; error: string | null }>
            }
            return probe.runUpdateProbe(input)
          },
          { directory, url: `http://127.0.0.1:${address.port}` }
        )
        expect(result.ready).toBe(!corrupt)
        if (corrupt) expect(result.error).toBe('ERR_CHECKSUM_MISMATCH')
        else expect(result.size).toBe(bytes.length)
        expect(requests.some((url) => url.startsWith('/latest'))).toBe(true)
        expect(requests.some((url) => url.startsWith('/update.exe'))).toBe(true)
      } finally {
        try {
          await application.close()
        } finally {
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
          await rm(directory, { recursive: true, force: true })
        }
      }
    },
    30_000
  )
})
