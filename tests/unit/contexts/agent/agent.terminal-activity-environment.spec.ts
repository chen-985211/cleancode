import { delimiter } from 'node:path'

import type { AgentActivityTerminalScope } from '../../../../src/contexts/agent/application/dto/AgentActivityProtocol'
import { AgentHookIdentitySigner } from '../../../../src/contexts/agent/infrastructure/terminal-activity/AgentHookIdentitySigner'
import { TerminalAgentActivityEnvironmentService } from '../../../../src/contexts/agent/infrastructure/terminal-activity/TerminalAgentActivityEnvironmentService'

describe('terminal Agent activity environment', () => {
  it('adds stable PTY identity and shims without leaking Electron runtime mode', async () => {
    const terminal = createTerminalScope()
    const signer = new AgentHookIdentitySigner(Buffer.alloc(32, 9))
    const service = new TerminalAgentActivityEnvironmentService({
      assets: {
        ensure: async () => ({
          bashRcPath: '/state/agent-activity/assets-v1/shell/bashrc',
          gatewayManifestPath: '/state/agent-activity/gateway.json',
          hookRelayPath: '/state/agent-activity/assets-v1/hook-relay.mjs',
          launchSpecsPath: '/state/agent-activity/assets-v1/launch-specs.json',
          rootDirectory: '/state/agent-activity',
          shimDirectory: '/state/agent-activity/assets-v1/bin',
          shellLauncherPath: '/state/agent-activity/assets-v1/shell/launch',
          zshDotDirectory: '/state/agent-activity/assets-v1/shell/zsh'
        }),
        publishGateway: vi.fn(async () => undefined)
      },
      inheritedPath: '/usr/local/bin:/usr/bin',
      inheritedShell: '/bin/zsh',
      signer
    })

    const prepared = await service.prepare({
      environment: { EXISTING: 'value', PATH: '/custom/bin:/usr/bin', ZDOTDIR: '/user/zsh' },
      launchCommand: undefined,
      terminal
    })

    expect(prepared.launchCommand).toBeUndefined()
    expect(prepared.shell).toBe('/state/agent-activity/assets-v1/shell/launch')
    expect(prepared.environment).toMatchObject({
      CLEANCODE_AGENT_ACTIVITY_REAL_SHELL: '/bin/zsh',
      CLEANCODE_AGENT_ACTIVITY_SHIM_DIRECTORY: '/state/agent-activity/assets-v1/bin',
      CLEANCODE_AGENT_ACTIVITY_ORIGINAL_ZDOTDIR: '/user/zsh',
      CLEANCODE_AGENT_ACTIVITY_MANIFEST: '/state/agent-activity/gateway.json',
      EXISTING: 'value',
      PATH: `/state/agent-activity/assets-v1/bin${delimiter}/custom/bin:/usr/bin`
    })
    expect(prepared.environment?.ELECTRON_RUN_AS_NODE).toBeUndefined()
    const encodedScope = prepared.environment?.CLEANCODE_AGENT_ACTIVITY_SCOPE
    expect(JSON.parse(Buffer.from(encodedScope ?? '', 'base64url').toString('utf8'))).toEqual(
      terminal
    )
    expect(
      signer.verify(
        {
          invocationId: 'any-invocation',
          providerId: 'any-provider',
          terminal
        },
        prepared.environment?.CLEANCODE_AGENT_ACTIVITY_TOKEN ?? ''
      )
    ).toBe(true)

    const unsupportedShell = await service.prepare({
      environment: { PATH: '/custom/bin:/usr/bin' },
      launchCommand: undefined,
      shell: '/usr/local/bin/fish',
      terminal
    })
    expect(unsupportedShell.shell).toBe('/usr/local/bin/fish')
    expect(unsupportedShell.environment.CLEANCODE_AGENT_ACTIVITY_REAL_SHELL).toBeUndefined()

    const commandLaunch = await service.prepare({
      environment: { PATH: '/custom/bin:/usr/bin' },
      launchCommand: 'printf ready',
      shell: '/bin/zsh',
      terminal
    })
    expect(commandLaunch.shell).toBe('/bin/zsh')
    expect(commandLaunch.launchCommand).toBe('printf ready')
  })

  it('preserves a case-insensitive Windows Path override without duplicate keys', async () => {
    const service = new TerminalAgentActivityEnvironmentService({
      assets: {
        ensure: async () => ({
          bashRcPath: 'C:\\state\\agent-activity\\assets-v1\\shell\\bashrc',
          gatewayManifestPath: 'C:\\state\\agent-activity\\gateway.json',
          hookRelayPath: 'C:\\state\\agent-activity\\assets-v1\\hook-relay.mjs',
          launchSpecsPath: 'C:\\state\\agent-activity\\assets-v1\\launch-specs.json',
          rootDirectory: 'C:\\state\\agent-activity',
          shimDirectory: 'C:\\state\\agent-activity\\assets-v1\\bin',
          shellLauncherPath: 'C:\\state\\agent-activity\\assets-v1\\shell\\launch',
          zshDotDirectory: 'C:\\state\\agent-activity\\assets-v1\\shell\\zsh'
        }),
        publishGateway: vi.fn(async () => undefined)
      },
      inheritedPath: 'C:\\Windows\\System32',
      platform: 'win32',
      signer: new AgentHookIdentitySigner(Buffer.alloc(32, 7))
    })

    const prepared = await service.prepare({
      environment: { EXISTING: 'value', Path: 'C:\\custom;C:\\Windows\\System32' },
      launchCommand: undefined,
      terminal: createTerminalScope()
    })

    expect(prepared.environment.PATH).toBe(
      'C:\\state\\agent-activity\\assets-v1\\bin;C:\\custom;C:\\Windows\\System32'
    )
    expect(Object.keys(prepared.environment).filter((key) => key.toLowerCase() === 'path')).toEqual(
      ['PATH']
    )
    expect(prepared.shell).toBeUndefined()
  })
})

function createTerminalScope(): AgentActivityTerminalScope {
  return {
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
