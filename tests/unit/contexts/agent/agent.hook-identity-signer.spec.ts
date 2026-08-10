import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  AgentHookIdentitySigner,
  loadOrCreateAgentHookIdentitySigner
} from '../../../../src/contexts/agent/infrastructure/terminal-activity/AgentHookIdentitySigner'
import type { AgentActivityIdentity } from '../../../../src/contexts/agent/application/dto/AgentActivityProtocol'

describe('Agent hook identity signer', () => {
  it('binds a token to the complete terminal generation without binding one invocation', () => {
    const signer = new AgentHookIdentitySigner(Buffer.alloc(32, 7))
    const identity = createIdentity()
    const token = signer.sign(identity)

    expect(signer.verify(identity, token)).toBe(true)
    expect(signer.verify({ ...identity, invocationId: 'another-invocation' }, token)).toBe(true)
    expect(
      signer.verify({ ...identity, terminal: { ...identity.terminal, generation: 2 } }, token)
    ).toBe(false)
    expect(signer.verify(identity, `${token}tampered`)).toBe(false)
  })

  it('creates and reuses a private app-scoped signing secret', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-agent-hook-secret-'))
    const secretPath = join(directory, 'identity-secret')
    try {
      const first = await loadOrCreateAgentHookIdentitySigner(secretPath)
      const identity = createIdentity()
      const token = first.sign(identity)
      const second = await loadOrCreateAgentHookIdentitySigner(secretPath)

      expect(second.verify(identity, token)).toBe(true)
      expect((await readFile(secretPath)).byteLength).toBe(32)
      if (process.platform !== 'win32') {
        expect((await stat(secretPath)).mode & 0o777).toBe(0o600)
      }
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})

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
