import { useState } from 'react'
import type { WorkspaceDefaults } from '../../../../src/contexts/project/application/dto/WorkspaceInitializationDetails'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { WorkspaceDefaultsEditor } from '../../../../src/contexts/project/presentation/components/WorkspaceDefaultsEditor'

describe('workspace defaults editor', () => {
  it.each(['idle', 'saving', 'saved'])('keeps normal autosave feedback quiet (%s)', (status) => {
    render(
      <WorkspaceDefaultsEditor
        defaults={{ templates: [], agents: [{ providerId: 'test-agent', count: 2 }] }}
        templates={[]}
        providers={[{ id: 'test-agent', name: 'Test Agent', icon: null }]}
        autosave={{ status, error: null, onChange: vi.fn(), onRetry: vi.fn() }}
      />
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/这些 Agent 共享/)).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Test Agent 数量' })).toBeEnabled()
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', `${status === 'saving'}`)
  })

  it('keeps failed autosave actionable and removes the feedback after retry succeeds', () => {
    const retry = vi.fn()
    const props = {
      defaults: { templates: [], agents: [] },
      templates: [],
      providers: []
    }
    const { rerender } = render(
      <WorkspaceDefaultsEditor
        {...props}
        autosave={{
          status: 'failed',
          error: new Error('save failed'),
          onChange: vi.fn(),
          onRetry: retry
        }}
      />
    )
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledOnce()
    rerender(
      <WorkspaceDefaultsEditor
        {...props}
        autosave={{ status: 'saved', error: null, onChange: vi.fn(), onRetry: retry }}
      />
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('autosaves added providers, quantities and templates immediately', () => {
    const change = vi.fn()
    function SettingsEditor() {
      const [defaults, setDefaults] = useState<WorkspaceDefaults>({ templates: [], agents: [] })
      return (
        <WorkspaceDefaultsEditor
          defaults={defaults}
          templates={[{ id: 'dev', name: 'Dev server', source: 'project' }]}
          providers={[
            { id: 'test-agent', name: 'Test Agent', icon: <svg data-testid="provider-icon" /> }
          ]}
          autosave={{
            status: 'saved',
            error: null,
            onChange: (value) => {
              change(value)
              setDefaults(value)
            },
            onRetry: vi.fn()
          }}
        />
      )
    }
    render(<SettingsEditor />)
    fireEvent.click(screen.getByRole('button', { name: '添加 Agent' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Test Agent' }))
    expect(
      within(screen.getByRole('region', { name: 'Agent' })).getByTestId('provider-icon')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '减少 Test Agent 数量' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '增加 Test Agent 数量' }))
    expect(screen.getByRole('spinbutton', { name: 'Test Agent 数量' })).toHaveValue(2)
    fireEvent.click(screen.getByRole('button', { name: '添加模板' }))
    expect(screen.getByRole('group', { name: '当前项目' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '全局' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dev server' }))
    expect(screen.getByRole('switch', { name: '自动运行 Dev server' })).not.toBeChecked()
    expect(change).toHaveBeenLastCalledWith({
      templates: [{ templateId: 'dev', runAfterPlacement: false }],
      agents: [{ providerId: 'test-agent', count: 2 }]
    })
    expect(screen.queryByRole('button', { name: '保存默认内容' })).not.toBeInTheDocument()
  })
  it('keeps missing selections removable and autosaves each edit without a save button', () => {
    const change = vi.fn()
    render(
      <WorkspaceDefaultsEditor
        defaults={{
          templates: [{ templateId: 'missing', runAfterPlacement: true }],
          agents: [{ providerId: 'offline', count: 2 }]
        }}
        templates={[]}
        providers={[]}
        autosave={{ status: 'saving', error: null, onChange: change, onRetry: vi.fn() }}
      />
    )
    expect(screen.getByText('missing（不可用）')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存默认内容' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    expect(change).toHaveBeenLastCalledWith(
      expect.objectContaining({ agents: [{ providerId: 'offline', count: 3 }] })
    )
    fireEvent.click(screen.getByRole('button', { name: '移除 offline（不可用）' }))
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ agents: [] }))
  })
})
