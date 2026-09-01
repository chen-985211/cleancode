import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { BlockTemplateSaveDialog } from '../../../../src/contexts/block-graph/presentation/components/BlockTemplateSaveDialog'
import type { SaveBlockTemplateAction } from '../../../../src/contexts/block-graph/presentation/view-models/BlockTemplatePresentationActions'
import { I18nProvider } from '../../../../src/presentation/i18n/I18nProvider'

let saveTemplate: SaveBlockTemplateAction

describe('block template save dialog', () => {
  beforeEach(() => {
    const save: SaveBlockTemplateAction = async (command) => ({
      id: 'template-1',
      type: 'workflow',
      name: command.name,
      description: command.description,
      scope: command.scope,
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
      nodes: [],
      connections: []
    })
    saveTemplate = vi.fn(save)
  })

  it('shows the automatically recognized type and saves to the current project by default', async () => {
    const onSaved = vi.fn()
    render(
      <I18nProvider initialLocale="zh-CN">
        <BlockTemplateSaveDialog
          graph={createGraph()}
          projectDirectory="/repo"
          selectedBlockIds={['terminal-a', 'terminal-b']}
          workspaceId="main"
          onCancel={vi.fn()}
          onSave={saveTemplate}
          onSaved={onSaved}
        />
      </I18nProvider>
    )

    expect(screen.getByText('流程模板')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '当前项目' })).toBeChecked()

    fireEvent.change(screen.getByRole('textbox', { name: '模板名称' }), {
      target: { value: '构建流程' }
    })
    fireEvent.click(screen.getByRole('button', { name: '收藏' }))

    await waitFor(() =>
      expect(saveTemplate).toHaveBeenCalledWith({
        projectDirectory: '/repo',
        workspaceId: 'main',
        selectedBlockIds: ['terminal-a', 'terminal-b'],
        name: '构建流程',
        description: '',
        scope: { type: 'project', projectId: 'project-1' }
      })
    )
    expect(onSaved).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('retains an inert modal surface while a controlled close exits', () => {
    const props = {
      graph: createGraph(),
      projectDirectory: '/repo',
      selectedBlockIds: ['terminal-a', 'terminal-b'],
      workspaceId: 'main',
      onCancel: vi.fn(),
      onSave: saveTemplate,
      onSaved: vi.fn()
    }
    const { rerender } = render(
      <I18nProvider initialLocale="zh-CN">
        <BlockTemplateSaveDialog {...props} open />
      </I18nProvider>
    )
    const dialog = screen.getByRole('dialog', { name: '收藏当前配置' })

    rerender(
      <I18nProvider initialLocale="zh-CN">
        <BlockTemplateSaveDialog {...props} open={false} />
      </I18nProvider>
    )

    expect(screen.queryByRole('dialog', { name: '收藏当前配置' })).toBeNull()
    expect(dialog).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(dialog).toHaveAttribute('inert')
  })
})

function createGraph() {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      {
        id: 'terminal-a',
        type: 'terminal' as const,
        name: 'Build',
        description: '',
        launchCommand: 'pnpm build',
        position: { x: 0, y: 0 },
        size: { width: 420, height: 300 }
      },
      {
        id: 'terminal-b',
        type: 'terminal' as const,
        name: 'Test',
        description: '',
        launchCommand: 'pnpm test',
        position: { x: 520, y: 0 },
        size: { width: 420, height: 300 }
      }
    ],
    connections: [
      {
        id: 'connection-1',
        sourceBlockId: 'terminal-a',
        targetBlockId: 'terminal-b'
      }
    ],
    terminalGroups: []
  }
}
