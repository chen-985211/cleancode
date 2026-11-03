import { channel } from 'node:diagnostics_channel'
import type { IncomingMessage } from 'node:http'
import { CodexThreadIdentityReporter } from '../../../../src/contexts/agent/infrastructure/pty/CodexThreadIdentityReporter'

const thread = '0190d8a1-8b7d-4d75-9f62-7a663ef87e33'
const other = '0290d8a1-8b7d-4d75-9f62-7a663ef87e44'
const cases = [
  { name: 'same UUID refresh', titles: [thread], accepted: true },
  { name: 'same prefix rename', titles: [`Renamed | ${thread.slice(0, 29)}...`], accepted: true },
  { name: 'different thread', titles: [other], accepted: false },
  { name: 'switch away and back', titles: [other, thread], accepted: false }
]

describe('Codex directory identity during asynchronous validation', () => {
  it.each(cases.flatMap((entry) => ['turn', 'session-end'].map((event) => ({ ...entry, event }))))(
    'queued $event with $name',
    async ({ titles, accepted, event }) => {
      const validating = createGate()
      const validated = createGate()
      const queued = createGate()
      const directories: string[] = []
      const validations: string[] = []
      const completed = vi.fn()
      const reporter = await CodexThreadIdentityReporter.start({
        onThreadIdentified: vi.fn(),
        onTurnCompleted: completed,
        onExecutionDirectoryChanged: async (directory, isCurrent) => {
          validations.push(directory)
          if (directory === '/repo/first') {
            validating.resolve()
            await validated.promise
          }
          if (!isCurrent?.()) return false
          directories.push(directory)
          return true
        }
      })
      const requests = channel('http.server.request.start')
      const observeArrival = (message: unknown): void => {
        const { request } = message as { request: IncomingMessage }
        if (
          request.headers.authorization === `Bearer ${reporter.token}` &&
          request.headers['x-report-stage'] === 'queued'
        ) {
          // Observe the server receiving the whole body; no timer or private reporter access.
          request.once('end', queued.resolve)
        }
      }
      const postings: Promise<Response>[] = []
      const post = (stage: string, threadId = thread): Promise<Response> => {
        const posting = fetch(reporter.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${reporter.token}`, 'x-report-stage': stage },
          body: JSON.stringify({
            cwd: `/repo/${stage}`,
            ...(event === 'turn'
              ? { type: 'agent-turn-complete', 'thread-id': threadId }
              : { hook_event_name: 'SessionEnd', session_id: threadId })
          })
        })
        postings.push(posting)
        return posting
      }
      requests.subscribe(observeArrival)
      try {
        reporter.acceptTerminalTitle(thread)
        const first = post('first')
        await validating.promise
        const second = post('queued')
        await queued.promise
        titles.forEach((title) => reporter.acceptTerminalTitle(title))
        validated.resolve()
        expect((await first).status).toBe(204)
        expect((await second).status).toBe(204)
        const currentThread = titles.at(-1) === other ? other : thread
        expect((await post('fresh', currentThread)).status).toBe(204)
        expect(validations).toEqual(
          accepted ? ['/repo/first', '/repo/queued', '/repo/fresh'] : ['/repo/first', '/repo/fresh']
        )
        expect(directories).toEqual(
          accepted ? ['/repo/first', '/repo/queued', '/repo/fresh'] : ['/repo/fresh']
        )
        expect(completed).toHaveBeenCalledTimes(event === 'turn' ? (accepted ? 3 : 1) : 0)
      } finally {
        requests.unsubscribe(observeArrival)
        validated.resolve()
        await Promise.allSettled(postings)
        await reporter.close()
      }
    }
  )

  it.each(cases.flatMap((entry) => ['turn', 'session-end'].map((event) => ({ ...entry, event }))))(
    '$event with $name',
    async ({ titles, accepted, event }) => {
      const validating = createGate()
      const validated = createGate()
      const directories: string[] = []
      const completed = vi.fn()
      const reporter = await CodexThreadIdentityReporter.start({
        onThreadIdentified: vi.fn(),
        onTurnCompleted: completed,
        onExecutionDirectoryChanged: async (directory, isCurrent) => {
          validating.resolve()
          await validated.promise
          if (!isCurrent?.()) return false
          directories.push(directory)
          return true
        }
      })
      let posting: Promise<Response> | undefined
      try {
        reporter.acceptTerminalTitle(thread)
        posting = fetch(reporter.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${reporter.token}` },
          body: JSON.stringify({
            cwd: '/repo/worktree',
            ...(event === 'turn'
              ? { type: 'agent-turn-complete', 'thread-id': thread }
              : { hook_event_name: 'SessionEnd', session_id: thread })
          })
        })
        await validating.promise
        titles.forEach((title) => reporter.acceptTerminalTitle(title))
        validated.resolve()
        expect((await posting).status).toBe(204)
        expect(directories).toEqual(accepted ? ['/repo/worktree'] : [])
        expect(completed).toHaveBeenCalledTimes(accepted && event === 'turn' ? 1 : 0)
      } finally {
        validated.resolve()
        await posting
        await reporter.close()
      }
    }
  )
})

function createGate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
