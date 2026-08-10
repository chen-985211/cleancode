import { request } from 'node:http'

import { AgentHookGateway } from '../../../../src/contexts/agent/infrastructure/terminal-activity/AgentHookGateway'
import type { AgentActivityIdentity } from '../../../../src/contexts/agent/application/dto/AgentActivityProtocol'

describe('Agent hook gateway', () => {
  it('authenticates a terminal identity and assigns monotonic source revisions', async () => {
    const reports: unknown[] = []
    const authorize = vi.fn(
      async (identity: AgentActivityIdentity, token: string) =>
        identity.terminal.sessionId === 'terminal-session-1' && token === 'scope-token'
    )
    const gateway = await AgentHookGateway.start({
      authorize,
      onReport: (report) => {
        reports.push(report)
      }
    })

    try {
      const identity = createIdentity()
      await expect(postReport(gateway.url, identity, 'scope-token', 'working')).resolves.toBe(204)
      await expect(postReport(gateway.url, identity, 'scope-token', 'idle')).resolves.toBe(204)

      expect(authorize).toHaveBeenCalledTimes(2)
      expect(reports).toEqual([
        {
          identity,
          signal: { status: 'working', type: 'status_changed' },
          sourceRevision: 1
        },
        {
          identity,
          signal: { status: 'idle', type: 'status_changed' },
          sourceRevision: 2
        }
      ])
    } finally {
      await gateway.dispose()
      await gateway.dispose()
    }
  })

  it('rejects unauthorized, malformed, and oversized reports without invoking consumers', async () => {
    const onReport = vi.fn()
    const gateway = await AgentHookGateway.start({
      authorize: async (_identity, token) => token === 'scope-token',
      onReport
    })

    try {
      expect(await postReport(gateway.url, createIdentity(), 'wrong-token', 'working')).toBe(401)
      expect(
        await fetch(gateway.url, {
          body: JSON.stringify({ identity: { providerId: 'codex' } }),
          headers: { authorization: 'Bearer scope-token', 'content-type': 'application/json' },
          method: 'POST'
        }).then((response) => response.status)
      ).toBe(400)
      expect(
        await fetch(gateway.url, {
          body: JSON.stringify({ padding: 'x'.repeat(65_000) }),
          headers: { authorization: 'Bearer scope-token', 'content-type': 'application/json' },
          method: 'POST'
        }).then((response) => response.status)
      ).toBe(413)
      expect(onReport).not.toHaveBeenCalled()
    } finally {
      await gateway.dispose()
    }
  })

  it('does not let a partial unauthenticated request block gateway disposal', async () => {
    const gateway = await AgentHookGateway.start({
      authorize: vi.fn(async () => true),
      onReport: vi.fn()
    })
    const partialRequest = request(gateway.url, {
      headers: { authorization: 'Bearer scope-token', 'content-type': 'application/json' },
      method: 'POST'
    })
    partialRequest.on('error', () => undefined)
    const connected = new Promise<void>((resolve) => {
      partialRequest.once('socket', (socket) => {
        if (!socket.connecting) resolve()
        else socket.once('connect', resolve)
      })
    })
    partialRequest.write('{"identity":')
    await connected

    await expect(gateway.dispose()).resolves.toBeUndefined()
    partialRequest.destroy()
  })
})

async function postReport(
  url: string,
  identity: AgentActivityIdentity,
  token: string,
  status: 'idle' | 'working'
): Promise<number> {
  return fetch(url, {
    body: JSON.stringify({ identity, signal: { status, type: 'status_changed' } }),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    method: 'POST'
  }).then((response) => response.status)
}

function createIdentity(): AgentActivityIdentity {
  return {
    invocationId: 'invocation-1',
    providerId: 'codex',
    terminal: {
      blockId: 'terminal-block-1',
      generation: 1,
      gitBranch: 'main',
      owner: { id: 'terminal-block-1', kind: 'block' },
      projectDirectory: '/project',
      projectId: 'project-1',
      runId: 'terminal-run-1',
      sessionId: 'terminal-session-1',
      workspaceDirectory: '/workspace',
      workspaceId: 'workspace-1'
    }
  }
}
