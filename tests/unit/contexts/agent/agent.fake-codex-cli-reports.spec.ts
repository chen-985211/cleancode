import { readFile } from 'node:fs/promises'
import type * as fsPromises from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFakeCodexCliReports } from '../../../fixtures/contexts/agent/fakeCodexCli'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof fsPromises>()),
  readFile: vi.fn()
}))

const reportPath = join('fixture', 'reports.jsonl')
const report = { args: [], cwd: 'workspace', kind: 'inspection', pid: 123 }
const nextReport = { ...report, kind: 'color-query-response' }

describe('fake Codex CLI reports', () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset()
  })

  it.each([
    ['partial JSON', '{"kind":"color-query-res'],
    ['JSON awaiting its newline', JSON.stringify(nextReport)]
  ])('waits for the record delimiter when an append exposes %s', async (_name, tail) => {
    vi.mocked(readFile)
      .mockResolvedValueOnce(`${JSON.stringify(report)}\n${tail}`)
      .mockResolvedValueOnce(`${JSON.stringify(report)}\n${JSON.stringify(nextReport)}\n`)

    await expect(readFakeCodexCliReports(reportPath)).resolves.toEqual([report])
    await expect(readFakeCodexCliReports(reportPath)).resolves.toEqual([report, nextReport])
  })

  it.each(['', '{"kind":"inspection', JSON.stringify(report)])(
    'returns no reports before the first complete record: %j',
    async (contents) => {
      vi.mocked(readFile).mockResolvedValue(contents)

      await expect(readFakeCodexCliReports(reportPath)).resolves.toEqual([])
    }
  )

  it('does not hide a malformed completed record', async () => {
    vi.mocked(readFile).mockResolvedValue(`${JSON.stringify(report)}\n{"kind":\n`)

    await expect(readFakeCodexCliReports(reportPath)).rejects.toBeInstanceOf(SyntaxError)
  })

  it('returns no reports until the report file exists', async () => {
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))

    await expect(readFakeCodexCliReports(reportPath)).resolves.toEqual([])
  })

  it('preserves file read failures', async () => {
    const error = Object.assign(new Error('denied'), { code: 'EACCES' })
    vi.mocked(readFile).mockRejectedValue(error)

    await expect(readFakeCodexCliReports(reportPath)).rejects.toBe(error)
  })
})
