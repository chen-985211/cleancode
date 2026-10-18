import { AgentProviderPreferences } from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'

describe('Agent Provider preferences', () => {
  it('restores missing categories as enabled without changing the saved Agent default', () => {
    expect(
      AgentProviderPreferences.restore({
        version: 1,
        defaultCleancodeMcpEnabled: false
      }).toSnapshot()
    ).toMatchObject({
      defaultCleancodeMcpEnabled: false,
      mcpToolCategories: { canvas: true, collaboration: true }
    })
  })

  it.each([
    { canvas: false, collaboration: true },
    { canvas: true, collaboration: false },
    { canvas: false, collaboration: false },
    { canvas: true, collaboration: true }
  ])(
    'preserves the category selection %j independently of the Agent default',
    (mcpToolCategories) => {
      const preferences = AgentProviderPreferences.restore({
        version: 1,
        mcpToolCategories,
        defaultCleancodeMcpEnabled: false
      })
      expect(preferences.toSnapshot()).toMatchObject({
        mcpToolCategories,
        defaultCleancodeMcpEnabled: false
      })
      const snapshot = preferences.toSnapshot()
      Object.assign(snapshot.mcpToolCategories, { canvas: !mcpToolCategories.canvas })
      expect(preferences.toSnapshot().mcpToolCategories).toEqual(mcpToolCategories)
    }
  )

  it('normalizes malformed category values individually', () => {
    expect(
      AgentProviderPreferences.restore({
        version: 1,
        mcpToolCategories: { canvas: false, collaboration: 'false' }
      }).toSnapshot()
    ).toMatchObject({ mcpToolCategories: { canvas: false, collaboration: true } })
  })

  it('defaults new and migrated profiles to Yolo with CleanCode MCP enabled', () => {
    expect(AgentProviderPreferences.create().toSnapshot()).toEqual({
      defaultCleancodeMcpEnabled: true,
      defaultProviderId: null,
      mcpToolCategories: { canvas: true, collaboration: true },
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
      mcpToolCategories: { canvas: true, collaboration: true },
      disabledProviderIds: ['codex']
    })
  })

  it('normalizes persisted overrides without sharing mutable state', () => {
    const preferences = AgentProviderPreferences.restore({
      defaultCleancodeMcpEnabled: false,
      defaultProviderId: 'codex',
      mcpToolCategories: { canvas: true, collaboration: true },
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
      mcpToolCategories: { canvas: true, collaboration: true },
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
