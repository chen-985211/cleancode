import { fireEvent, render, screen } from '@testing-library/react'

import { AgentProviderPickerDialog } from '../../../src/presentation/app-shell/AgentProviderPickerDialog'
import type { CreatableAgentProviderSnapshot } from '../../../src/contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

const providers: readonly CreatableAgentProviderSnapshot[] = [
  createProvider('future-provider', 'A Very Long Future Provider Name'),
  createProvider('another-provider', 'Another Provider')
]

describe('Agent provider picker dialog', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi()
    })
  })

  afterEach(() => Reflect.deleteProperty(window, 'cleancode'))

  it('traps focus, restores the trigger, and keeps background siblings inert', () => {
    const onCancel = vi.fn()
    const { rerender } = render(
      <>
        <button type="button">新建 Agent</button>
        <AgentProviderPickerDialog
          error={null}
          pendingProviderId={null}
          providers={providers}
          onCancel={onCancel}
          onRefresh={vi.fn()}
          onSelect={vi.fn()}
        />
      </>
    )
    const trigger = screen.getByRole('button', { name: '新建 Agent' })
    const first = screen.getByRole('button', { name: /A Very Long Future Provider Name/ })
    const cancel = screen.getByRole('button', { name: '取消' })
    expect(first).toHaveFocus()
    expect(trigger).toHaveProperty('inert', true)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()

    rerender(<button type="button">新建 Agent</button>)
    expect(screen.getByRole('button', { name: '新建 Agent' }).inert).not.toBe(true)
  })

  it('preserves the complete provider name for truncated visual copy', () => {
    render(
      <AgentProviderPickerDialog
        error={null}
        pendingProviderId={null}
        providers={providers}
        onCancel={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByTitle('A Very Long Future Provider Name')).toHaveTextContent(
      'A Very Long Future Provider Name'
    )
  })

  it('renders every registered provider icon through the descriptor', () => {
    render(
      <AgentProviderPickerDialog
        error={null}
        pendingProviderId={null}
        providers={providers}
        onCancel={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    const option = screen.getByRole('button', { name: /A Very Long Future Provider Name/ })
    expect(option.querySelector('.agent-provider-icon path')).toHaveAttribute(
      'd',
      providers[0]?.descriptor.icon.paths[0]?.d
    )
  })

  it('cannot dismiss the picker while Agent creation is pending', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <AgentProviderPickerDialog
        error={null}
        pendingProviderId="future-provider"
        providers={providers}
        onCancel={onCancel}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.mouseDown(container.querySelector('.agent-provider-picker__backdrop')!)

    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /A Very Long Future Provider Name/ })).toBeDisabled()
  })
})

function createProvider(id: string, displayName: string): CreatableAgentProviderSnapshot {
  const descriptor: AgentProviderDescriptor = {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: 'unsupported',
      launchInstructions: true,
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
      version: 'test'
    },
    descriptor
  }
}
