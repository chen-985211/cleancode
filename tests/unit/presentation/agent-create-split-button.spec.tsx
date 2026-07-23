import { fireEvent, render, screen } from '@testing-library/react'

import { AgentCreateSplitButton } from '../../../src/presentation/app-shell/AgentCreateSplitButton'
import type { CreatableAgentProviderSnapshot } from '../../../src/contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'

const providers = [
  createProvider('codex', 'Codex', 'codex-cli 9.9.9'),
  createProvider('claude-code', 'Claude Code', '2.1.0')
] as const

describe('Agent create split button', () => {
  it('creates immediately from the main segment and changes the default from the menu', () => {
    const onCreate = vi.fn()
    const onSelectDefault = vi.fn()

    render(
      <AgentCreateSplitButton
        defaultProviderId="codex"
        disabled={false}
        isCreating={false}
        providers={providers}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={onCreate}
        onOpenAgentSettings={vi.fn()}
        onSelectDefault={onSelectDefault}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建 Agent' }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onSelectDefault).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '选择默认 Agent' }))
    const codex = screen.getByRole('menuitemradio', { name: 'Codex' })
    const claude = screen.getByRole('menuitemradio', { name: 'Claude Code' })
    expect(codex).toHaveAttribute('aria-checked', 'true')
    expect(claude).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText('codex-cli 9.9.9')).not.toBeInTheDocument()
    expect(screen.queryByText('2.1.0')).not.toBeInTheDocument()

    fireEvent.click(claude)
    expect(onSelectDefault).toHaveBeenCalledWith('claude-code')
    expect(onCreate).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('supports roving keyboard focus and restores focus when the menu closes', () => {
    const onSelectDefault = vi.fn()
    render(
      <AgentCreateSplitButton
        defaultProviderId="codex"
        disabled={false}
        isCreating={false}
        providers={providers}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={vi.fn()}
        onOpenAgentSettings={vi.fn()}
        onSelectDefault={onSelectDefault}
      />
    )

    const trigger = screen.getByRole('button', { name: '选择默认 Agent' })
    fireEvent.click(trigger)
    const codex = screen.getByRole('menuitemradio', { name: 'Codex' })
    const claude = screen.getByRole('menuitemradio', { name: 'Claude Code' })
    expect(codex).toHaveFocus()

    fireEvent.keyDown(codex, { key: 'ArrowDown' })
    expect(claude).toHaveFocus()
    fireEvent.keyDown(claude, { key: 'Enter' })

    expect(onSelectDefault).toHaveBeenCalledWith('claude-code')
    expect(trigger).toHaveFocus()
  })

  it('opens Agent settings from the main segment when no Provider is available', () => {
    const onOpenAgentSettings = vi.fn()
    render(
      <AgentCreateSplitButton
        defaultProviderId={null}
        disabled={false}
        isCreating={false}
        providers={[]}
        shortcutTooltip="新建 Agent (⌘⇧A)"
        onCreate={vi.fn()}
        onOpenAgentSettings={onOpenAgentSettings}
        onSelectDefault={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建 Agent' }))
    expect(onOpenAgentSettings).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '选择默认 Agent' }))
    expect(screen.getByText('没有可用的 Agent')).toBeVisible()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Agent 设置…' }))
    expect(onOpenAgentSettings).toHaveBeenCalledTimes(2)
  })
})

function createProvider(
  id: string,
  displayName: string,
  version: string
): CreatableAgentProviderSnapshot {
  const descriptor: AgentProviderDescriptor = {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: 'unsupported',
      launchInstructions: false,
      resume: false,
      sessionIdentityCapture: false,
      sessionRefCodec: false
    },
    displayName,
    icon: {
      paths: [{ d: `M2 2h20v20H2z M${id.length} 4v16` }],
      viewBox: '0 0 24 24'
    },
    id
  }
  return {
    availability: {
      providerId: id,
      status: 'installed',
      version
    },
    descriptor
  }
}
