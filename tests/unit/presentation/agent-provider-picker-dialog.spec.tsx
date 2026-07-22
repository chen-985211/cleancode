import { fireEvent, render, screen } from '@testing-library/react'

import { AgentProviderPickerDialog } from '../../../src/presentation/app-shell/AgentProviderPickerDialog'
import type { AgentProviderDescriptor } from '../../../src/contexts/agent/application/ports/AgentProviderContribution'
import { createRuntimeApi } from '../../fixtures/presentation/appShellFixtures'

const providers: readonly AgentProviderDescriptor[] = [
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
        <AgentProviderPickerDialog providers={providers} onCancel={onCancel} onSelect={vi.fn()} />
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
      <AgentProviderPickerDialog providers={providers} onCancel={vi.fn()} onSelect={vi.fn()} />
    )

    expect(screen.getByTitle('A Very Long Future Provider Name')).toHaveTextContent(
      'A Very Long Future Provider Name'
    )
  })
})

function createProvider(id: string, displayName: string): AgentProviderDescriptor {
  return {
    capabilities: {
      activityTracking: false,
      cleancodeMcp: 'unsupported',
      launchInstructions: true,
      resume: false,
      sessionIdentityCapture: false,
      sessionRefCodec: false
    },
    displayName,
    id
  }
}
