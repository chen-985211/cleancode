import { AgentProviderPreferences } from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'

describe('Agent Provider preferences', () => {
  it('defaults new and migrated profiles to Yolo with CleanCode MCP enabled', () => {
    expect(AgentProviderPreferences.create().toSnapshot()).toEqual({
      defaultCleancodeMcpEnabled: true,
      defaultProviderId: null,
      disabledProviderIds: [],
      permissionMode: 'yolo',
      providerOverrides: {},
      version: 1
    })
  })

  it('clears the default when that Provider is disabled', () => {
    const preferences = AgentProviderPreferences.create()

    preferences.setDefaultProvider('codex')
    preferences.setProviderEnabled('codex', false)

    expect(preferences.toSnapshot()).toMatchObject({
      defaultProviderId: null,
      disabledProviderIds: ['codex']
    })
  })

  it('normalizes persisted overrides without sharing mutable state', () => {
    const preferences = AgentProviderPreferences.restore({
      defaultCleancodeMcpEnabled: false,
      defaultProviderId: 'codex',
      disabledProviderIds: [' opencode ', 'opencode', '', 'missing'],
      permissionMode: 'manual',
      providerOverrides: {
        codex: {
          argumentsText: ' --model gpt-5 ',
          environment: { CODEX_HOME: ' /tmp/codex ', ' INVALID ': 'ignored', '': 'ignored' },
          executable: ' /opt/bin/codex '
        }
      },
      version: 1
    })

    const snapshot = preferences.toSnapshot()
    expect(snapshot).toEqual({
      defaultCleancodeMcpEnabled: false,
      defaultProviderId: 'codex',
      disabledProviderIds: ['opencode', 'missing'],
      permissionMode: 'manual',
      providerOverrides: {
        codex: {
          argumentsText: '--model gpt-5',
          environment: { CODEX_HOME: ' /tmp/codex ' },
          executable: '/opt/bin/codex'
        }
      },
      version: 1
    })

    snapshot.disabledProviderIds.push('claude-code')
    snapshot.providerOverrides.codex!.environment.CODEX_HOME = 'changed'
    expect(preferences.toSnapshot().disabledProviderIds).toEqual(['opencode', 'missing'])
    expect(preferences.toSnapshot().providerOverrides.codex!.environment.CODEX_HOME).toBe(
      ' /tmp/codex '
    )
  })
})
