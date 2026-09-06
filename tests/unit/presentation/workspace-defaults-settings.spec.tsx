import { WorkspaceDefaultsDialogLoader } from '../../../src/presentation/app-shell/coordinators/WorkspaceDefaultsControls'
import { WorkspaceDefaultsAutosave } from '../../../src/presentation/app-shell/coordinators/WorkspaceDefaultsAutosave'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WorkspaceDefaultsSettingsPane } from '../../../src/presentation/app-shell/coordinators/WorkspaceDefaultsSettingsPane'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

describe('workspace defaults in application settings', () => {
  afterEach(() => {
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it('loads the latest unsaved settings draft instead of overwriting it with persisted data', async () => {
    const workbench = createWorkbenchSnapshot('/project', 'Project')
    const store = new WorkspaceDefaultsAutosave(async () => undefined)
    store.edit('/project', { templates: [], agents: [{ providerId: 'test-agent', count: 2 }] })
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        getWorkspaceDefaults: vi.fn(async () => ({ templates: [], agents: [] })),
        listBlockTemplates: vi.fn(async () => []),
        discoverCreatableAgentProviders: vi.fn(async () => [
          { descriptor: { id: 'test-agent', displayName: 'Test Agent', icon: null } }
        ]),
        getAgentProviderPreferences: vi.fn(async () => ({ disabledProviderIds: [] })),
        listWorkspaceInitializations: vi.fn(async () => [])
      }
    })
    render(
      <WorkspaceDefaultsDialogLoader
        workbench={workbench}
        autosaveStore={store}
        onResume={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(await screen.findByRole('spinbutton', { name: 'Test Agent 数量' })).toHaveValue(2)
  })

  it('loads and saves the selected project without applying content to its existing canvas', async () => {
    const first = createWorkbenchSnapshot('/first', 'First')
    const second = createWorkbenchSnapshot('/second', 'Second')
    const save = vi.fn<(input: unknown) => Promise<void>>().mockResolvedValue(undefined)
    const apply = vi.fn()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        getWorkspaceDefaults: vi.fn(async () => ({ templates: [], agents: [] })),
        listBlockTemplates: vi.fn(async () => []),
        discoverCreatableAgentProviders: vi.fn(async () => [
          { descriptor: { id: 'test-agent', displayName: 'Test Agent', icon: null } }
        ]),
        getAgentProviderPreferences: vi.fn(async () => ({ disabledProviderIds: [] })),
        listWorkspaceInitializations: vi.fn(async () => []),
        saveWorkspaceDefaults: save,
        applyWorkspaceInitialization: apply
      }
    })
    const store = new WorkspaceDefaultsAutosave(async (projectDirectory, defaults) =>
      save({ projectDirectory, defaults })
    )
    render(
      <WorkspaceDefaultsSettingsPane
        autosaveStore={store}
        workbenches={[first, second]}
        currentProjectId={second.project.id}
        onResume={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const switcher = screen.getByRole('button', { name: '切换项目：Second' })
    fireEvent.click(switcher)
    expect(screen.getByRole('menuitemradio', { name: 'Second' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('menuitemradio', { name: 'Second' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(switcher).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(switcher).toHaveTextContent('Second')
    fireEvent.click(await screen.findByRole('button', { name: '添加 Agent' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Test Agent' }))
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        projectDirectory: '/second',
        defaults: { templates: [], agents: [{ providerId: 'test-agent', count: 1 }] }
      })
    )
    fireEvent.click(switcher)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'First' }))
    expect(screen.getByRole('button', { name: '切换项目：First' })).toHaveFocus()
    fireEvent.click(await screen.findByRole('button', { name: '添加 Agent' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Test Agent' }))
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith({
        projectDirectory: '/first',
        defaults: { templates: [], agents: [{ providerId: 'test-agent', count: 1 }] }
      })
    )
    fireEvent.keyDown(screen.getByRole('button', { name: '切换项目：First' }), { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(screen.getByRole('menuitemradio', { name: 'Second' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(await screen.findByRole('spinbutton', { name: 'Test Agent 数量' })).toHaveValue(1)
    expect(screen.queryByRole('button', { name: '保存默认内容' })).not.toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
