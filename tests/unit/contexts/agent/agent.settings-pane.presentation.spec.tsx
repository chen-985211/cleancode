import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import { AgentProviderStateProvider } from '../../../../src/contexts/agent/presentation/components/AgentProviderStateProvider'
import { AgentSettingsPane } from '../../../../src/contexts/agent/presentation/components/AgentSettingsPane'
import type { AgentProviderDescriptor } from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentProviderPreferencesSnapshot } from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'
import { createRuntimeApi } from '../../../fixtures/presentation/appShellFixtures'

const codex = createProvider('codex', 'Codex')
const claude = createProvider('claude-code', 'Claude Code')
const openCode = createProvider('opencode', 'OpenCode', 'https://opencode.ai/docs/cli/')

describe('Agent settings pane', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        inspectAgentProvider: vi.fn(async ({ providerId }) =>
          providerId === 'opencode'
            ? {
                providerId,
                reason: 'not_found',
                status: 'missing',
                version: null
              }
            : {
                providerId,
                status: 'installed',
                version: 'hidden-version'
              }
        ),
        listAgentProviders: vi.fn(async () => [codex, claude, openCode])
      })
    })
  })

  afterEach(() => Reflect.deleteProperty(window, 'cleancode'))

  it('shows the full catalog, changes the default, and guides missing Providers', async () => {
    render(<AgentSettingsHarness />)

    await waitFor(() => expect(screen.getAllByText('启用')).toHaveLength(2))
    expect(screen.getByText('Codex')).toBeVisible()
    expect(screen.getByText('已安装')).toBeVisible()
    expect(screen.getByText('可安装')).toBeVisible()
    expect(await screen.findByText('未安装')).toBeVisible()
    expect(screen.queryByText('hidden-version')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '打开 OpenCode 文档' })).toHaveAttribute(
      'href',
      'https://opencode.ai/docs/cli/'
    )
    expect(screen.getByRole('button', { name: 'Yolo' })).toHaveAttribute('aria-pressed', 'true')
    const permissionSelection = document.querySelector('.agent-settings-segmented__selection')
    expect(permissionSelection).toHaveAttribute('data-selection-motion-target', 'yolo')
    const defaultMcpSwitch = screen.getByRole('switch', {
      name: '新 Agent 默认启用 CleanCode MCP'
    })
    expect(defaultMcpSwitch).toHaveAttribute('aria-checked', 'true')
    expect(defaultMcpSwitch).toHaveAttribute('data-selection-motion-state', 'open')
    expect(defaultMcpSwitch.style.getPropertyValue('--cc-selection-motion-progress')).toBe('1')
    expect(screen.queryByText('选择默认 Agent，并检查本机可用的 CLI。')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Yolo 会在启动时加入该 Agent 支持的免确认参数。')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('只影响之后新建的 Agent，不会改动已有 Agent。')
    ).not.toBeInTheDocument()

    const claudeRow = screen.getByText('Claude Code').closest('.agent-settings-row')!
    const codexRow = screen.getByText('Codex').closest('.agent-settings-row')!
    expect(codexRow).toHaveAttribute('data-selection-motion-state', 'open')
    expect((codexRow as HTMLElement).style.getPropertyValue('--cc-selection-motion-progress')).toBe(
      '1'
    )
    expect(within(codexRow as HTMLElement).getByRole('switch')).toHaveAttribute(
      'data-selection-motion-state',
      'open'
    )
    fireEvent.click(within(claudeRow as HTMLElement).getByRole('button', { name: '设为默认' }))
    await waitFor(() => expect(claudeRow).toHaveAttribute('data-default', 'true'))
    expect(within(claudeRow as HTMLElement).getByRole('button', { name: '默认' })).toBeDisabled()
  })
})

function AgentSettingsHarness() {
  const [preferences, setPreferences] = useState<AgentProviderPreferencesSnapshot>({
    defaultCleancodeMcpEnabled: true,
    defaultProviderId: 'codex',
    disabledProviderIds: [],
    permissionMode: 'yolo',
    providerOverrides: {},
    version: 1
  })
  return (
    <AgentProviderStateProvider>
      <AgentSettingsPane
        defaultProviderId={preferences.defaultProviderId}
        preferences={preferences}
        onPreferencesChange={(command) =>
          setPreferences((current) => ({
            ...current,
            ...command,
            disabledProviderIds: [...(command.disabledProviderIds ?? current.disabledProviderIds)],
            providerOverrides: {
              ...(command.providerOverrides ?? current.providerOverrides)
            },
            version: 1
          }))
        }
        onRefresh={vi.fn()}
      />
    </AgentProviderStateProvider>
  )
}

function createProvider(
  id: string,
  displayName: string,
  documentationUrl?: string
): AgentProviderDescriptor {
  return {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: false,
      launchInstructions: false,
      resume: false,
      sessionIdentityCapture: false,
      sessionRefCodec: false
    },
    displayName,
    ...(documentationUrl ? { documentationUrl } : undefined),
    icon: {
      paths: [{ d: 'M2 2H22V22H2Z' }],
      viewBox: '0 0 24 24'
    },
    id
  }
}
