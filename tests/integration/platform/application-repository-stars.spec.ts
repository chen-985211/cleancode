import { createServer, type Server } from 'node:http'

import { createApplicationRepositoryStarsReader } from '../../../src/platform/electron-main/applicationRepositoryStars'

describe('application repository stars HTTP integration', () => {
  let server: Server
  let endpoint: string
  let requests: number

  beforeEach(async () => {
    requests = 0
    server = createServer((request, response) => {
      requests += 1
      if (request.url === '/stalled') return
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ stargazers_count: 42 }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No local test endpoint.')
    endpoint = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  })

  it('reads JSON over HTTP and shares the result across concurrent callers', async () => {
    const read = createApplicationRepositoryStarsReader({
      request: (_url, options) => fetch(endpoint, options)
    })
    await expect(Promise.all([read(), read()])).resolves.toEqual([42, 42])
    expect(requests).toBe(1)
  })

  it('aborts a real stalled HTTP request at the query deadline', async () => {
    const read = createApplicationRepositoryStarsReader({
      request: (_url, options) => fetch(`${endpoint}/stalled`, options)
    })
    await expect(read()).rejects.toMatchObject({ code: 'GITHUB_REQUEST_FAILED' })
    expect(requests).toBe(1)
  }, 10_000)
})
