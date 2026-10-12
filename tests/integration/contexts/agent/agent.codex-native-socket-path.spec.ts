import { mkdtemp, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { AgentLaunchArtifactScope } from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'
import { prepareCodexNativeMessageLaunch } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexNativeMessageLaunch'

describe('Codex native socket path budget', () => {
  it.each([103, 104])(
    'uses the complete %s-byte socket path to decide native delivery',
    async (bytes) => {
      const base = await realpath(await mkdtemp(join(tmpdir(), 'cc-path-中文-')))
      const environmentName = process.platform === 'win32' ? 'TEMP' : 'TMPDIR'
      const originalRoot = process.env[environmentName]
      const artifacts = new AgentLaunchArtifactScope()
      const nativePlan = { executable: 'codex', args: [], env: {} }
      const messageDelivery = vi.fn()
      try {
        // mkdtemp adds six random characters. Account for both socket path components.
        const rootNameLength = bytes - Buffer.byteLength(join(base, 'cc-cdx-XXXXXX', 's', 's')) - 1
        const root = join(base, 'a'.repeat(rootNameLength))
        await mkdir(root)
        process.env[environmentName] = root
        const plan = await prepareCodexNativeMessageLaunch({
          command: {
            artifacts,
            workspaceDirectory: base,
            onProviderSessionIdentified: () => undefined,
            messageDelivery
          },
          nativePlan,
          serverArgs: [],
          runtimeExecutable: process.execPath,
          runtimePlatform: process.platform,
          bindIdentity: () => undefined
        })
        if (bytes < 104) {
          expect(plan.executable).toBe(process.execPath)
          const config = JSON.parse(await readFile(plan.args[1]!, 'utf8'))
          const socketPath = join(dirname(plan.args[1]!), ...config.socketPathSegments)
          expect(Buffer.byteLength(socketPath)).toBe(bytes)
          await expect(readdir(dirname(socketPath))).rejects.toMatchObject({ code: 'ENOENT' })
          expect(messageDelivery).not.toHaveBeenCalled()
        } else {
          expect(plan).toBe(nativePlan)
          expect(messageDelivery).toHaveBeenCalledWith(null)
          expect(await readdir(root)).toEqual([])
        }
      } finally {
        if (originalRoot === undefined) delete process.env[environmentName]
        else process.env[environmentName] = originalRoot
        artifacts.seal()
        await artifacts.dispose()
        await rm(base, { recursive: true, force: true })
      }
    }
  )
})
