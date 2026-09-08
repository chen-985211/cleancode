import { createConnection } from 'node:net'
import { Server } from 'node:http'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { prepareProviderActivityReporter } from '../../../../src/contexts/agent/infrastructure/providers/shared/ProviderActivityReporter'

describe('launch-private Provider activity reports', () => {
  it('keeps CLI launch available when the optional activity listener cannot bind', async () => {
    const artifacts = new AgentLaunchArtifactScope()
    const listen = vi.spyOn(Server.prototype, 'listen').mockImplementationOnce(() => {
      throw new Error('listener unavailable')
    })
    try {
      await expect(
        prepareProviderActivityReporter(
          {
            artifacts,
            onActivityChanged: () => {},
            onProviderSessionIdentified: () => {},
            workspaceDirectory: process.cwd()
          },
          'pi'
        )
      ).resolves.toEqual({ CLEANCODE_PROVIDER_ACTIVITY_PROVIDER: 'pi' })
    } finally {
      listen.mockRestore()
      await artifacts.dispose()
    }
  })
  it('authenticates events, rejects stale revisions and malformed signals, and closes live sockets', async () => {
    const artifacts = new AgentLaunchArtifactScope()
    const activity = vi.fn()
    const completed = vi.fn()
    const environment = await prepareProviderActivityReporter(
      {
        artifacts,
        onActivityChanged: activity,
        onTurnCompleted: completed,
        onProviderSessionIdentified: () => {},
        workspaceDirectory: process.cwd()
      },
      'pi'
    )
    artifacts.seal()
    const url = environment.CLEANCODE_PROVIDER_ACTIVITY_URL!
    const report = (
      revision: number,
      signal: unknown,
      token = environment.CLEANCODE_PROVIDER_ACTIVITY_TOKEN
    ) =>
      fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ revision, signal })
      })
    try {
      expect((await report(1, { type: 'turn_completed' }, 'wrong')).status).toBe(403)
      expect((await report(1, { type: 'status_changed', status: 'working' })).status).toBe(204)
      expect((await report(1, { type: 'turn_completed' })).status).toBe(409)
      expect((await report(2, { type: 'status_changed', status: 'invented' })).status).toBe(400)
      expect((await report(2, { type: 'turn_completed' })).status).toBe(204)
      expect(activity).toHaveBeenCalledExactlyOnceWith('working')
      expect(completed).toHaveBeenCalledTimes(1)
      const socket = createConnection(Number(new URL(url).port), '127.0.0.1')
      socket.on('error', (error: NodeJS.ErrnoException) => expect(error.code).toBe('ECONNRESET'))
      await new Promise<void>((resolve) => socket.once('connect', resolve))
      const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
      await Promise.all([artifacts.dispose(), artifacts.dispose(), closed])
      await expect(report(3, { type: 'turn_completed' })).rejects.toThrow()
      expect(completed).toHaveBeenCalledTimes(1)
    } finally {
      await artifacts.dispose()
    }
  })
})
