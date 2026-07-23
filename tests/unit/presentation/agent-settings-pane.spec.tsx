import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import { AgentProviderStateProvider } from '../../../src/presentation/app-shell/AgentProviderStateProvider'
import { AgentSettingsPane } from '../../../src/presentation/app-shell/AgentSettingsPane'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

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

    expect(await screen.findByText('Codex')).toBeVisible()
    await waitFor(() => expect(screen.getAllByText('可用')).toHaveLength(2))
    expect(await screen.findByText('未安装')).toBeVisible()
    expect(screen.queryByText('hidden-version')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '配置' })).toHaveAttribute(
      'href',
      'https://opencode.ai/docs/cli/'
    )

    const claudeRow = screen.getByText('Claude Code').closest('.agent-settings-row')!
    fireEvent.click(within(claudeRow as HTMLElement).getByRole('button', { name: '设为默认' }))
    expect(claudeRow).toHaveAttribute('data-default', 'true')
    expect(screen.getByRole('button', { name: '默认' })).toBeDisabled()
  })
})

function AgentSettingsHarness() {
  const [defaultProviderId, setDefaultProviderId] = useState('codex')
  return (
    <AgentProviderStateProvider>
      <AgentSettingsPane
        defaultProviderId={defaultProviderId}
        onDefaultProviderChange={setDefaultProviderId}
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
      cleancodeMcp: 'unsupported',
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
