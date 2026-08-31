import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { BlockTemplateSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { BlockTemplateLibraryRoot } from '../../../src/presentation/app-shell/BlockTemplateLibraryRoot'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'

describe('block template library', () => {
  const projectTemplate = createTemplate({
    id: 'project-template',
    name: '本地构建',
    scope: { type: 'project', projectId: 'project-1' }
  })
  const globalTemplate = createTemplate({
    id: 'global-template',
    name: '共享发布',
    scope: { type: 'global' }
  })

  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        listBlockTemplates: vi.fn(async ({ scope }) =>
          scope.type === 'project' ? [projectTemplate] : [globalTemplate]
        ),
        updateBlockTemplate: vi.fn(async (command) => ({
          ...projectTemplate,
          name: command.name,
          description: command.description
        })),
        moveBlockTemplate: vi.fn(async (command) => ({
          ...projectTemplate,
          scope: command.scope
        })),
        deleteBlockTemplate: vi.fn(async () => undefined)
      }
    })
  })

  it('opens on the current project scope, supports search, and begins quiet placement', async () => {
    const onBeginPlacement = vi.fn()
    renderLibrary(onBeginPlacement)

    const trigger = screen.getByRole('button', { name: '收藏模板' })
    expect(trigger).toHaveClass('app-shell-utility-button')
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: '收藏模板' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-surface-spring-preset', 'drawer-right')
    expect(screen.queryByText('保存并复用终端、流程和组合。')).not.toBeInTheDocument()
    expect(window.cleancode?.listBlockTemplates).toHaveBeenCalledWith({
      scope: { type: 'project', projectId: 'project-1' }
    })
    expect(screen.getByText('本地构建')).toBeInTheDocument()
    const selectionIndicator = document.querySelector('.block-template-library-tabs__selection')
    expect(selectionIndicator).toHaveAttribute('data-selection-motion-target', 'project')

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索收藏模板' }), {
      target: { value: '不存在' }
    })
    expect(screen.queryByText('本地构建')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索收藏模板' }), {
      target: { value: '本地' }
    })
    fireEvent.click(screen.getByRole('button', { name: '放置“本地构建”' }))

    expect(onBeginPlacement).toHaveBeenCalledWith(projectTemplate, false)
    expect(screen.queryByRole('dialog', { name: '收藏模板' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('switches to global templates and supports place-and-run without changing execution rules', async () => {
    const onBeginPlacement = vi.fn()
    renderLibrary(onBeginPlacement)

    fireEvent.click(screen.getByRole('button', { name: '收藏模板' }))
    await screen.findByText('本地构建')
    fireEvent.click(screen.getByRole('tab', { name: '全局' }))

    expect(await screen.findByText('共享发布')).toBeInTheDocument()
    expect(document.querySelector('.block-template-library-tabs__selection')).toHaveAttribute(
      'data-selection-motion-target',
      'global'
    )
    await waitFor(() =>
      expect(window.cleancode?.listBlockTemplates).toHaveBeenCalledWith({
        scope: { type: 'global' }
      })
    )

    fireEvent.click(screen.getByRole('button', { name: '放置并运行“共享发布”' }))

    expect(onBeginPlacement).toHaveBeenCalledWith(globalTemplate, true)
  })

  it('keeps the closing drawer inert until its overlay exit completes', async () => {
    renderLibrary(vi.fn())
    const trigger = screen.getByRole('button', { name: '收藏模板' })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: '收藏模板' })

    fireEvent.click(screen.getByRole('button', { name: '关闭收藏模板' }))

    expect(screen.queryByRole('dialog', { name: '收藏模板' })).toBeNull()
    expect(dialog).toHaveAttribute('data-surface-motion-state', 'closing')
    expect(dialog).toHaveAttribute('inert')

    fireEvent.transitionEnd(dialog, { propertyName: 'opacity' })

    expect(dialog).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('explains icon-only maintenance actions with tooltips', async () => {
    renderLibrary(vi.fn())
    fireEvent.click(screen.getByRole('button', { name: '收藏模板' }))
    await screen.findByText('本地构建')

    for (const accessibleName of [
      '重命名“本地构建”',
      '移动“本地构建”到全局收藏',
      '删除“本地构建”'
    ]) {
      fireEvent.keyDown(document, { key: 'Tab' })
      const action = screen.getByRole('button', { name: accessibleName })
      fireEvent.focus(action)

      expect(await screen.findByRole('tooltip')).toHaveTextContent(accessibleName)

      fireEvent.blur(action)
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    }
  })

  it('renames, moves, and deletes through the application-level library API', async () => {
    renderLibrary(vi.fn())
    fireEvent.click(screen.getByRole('button', { name: '收藏模板' }))
    await screen.findByText('本地构建')

    fireEvent.click(screen.getByRole('button', { name: '重命名“本地构建”' }))
    fireEvent.change(screen.getByRole('textbox', { name: '模板名称' }), {
      target: { value: '本地测试' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
    await waitFor(() =>
      expect(window.cleancode?.updateBlockTemplate).toHaveBeenCalledWith({
        templateId: 'project-template',
        name: '本地测试',
        description: ''
      })
    )

    fireEvent.click(screen.getByRole('button', { name: '移动“本地测试”到全局收藏' }))
    await waitFor(() =>
      expect(window.cleancode?.moveBlockTemplate).toHaveBeenCalledWith({
        templateId: 'project-template',
        scope: { type: 'global' }
      })
    )
    expect(screen.queryByText('本地测试')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '全局' }))
    await screen.findByText('共享发布')
    fireEvent.click(screen.getByRole('button', { name: '删除“共享发布”' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(window.cleancode?.deleteBlockTemplate).toHaveBeenCalledWith({
        templateId: 'global-template'
      })
    )
  })
})

function renderLibrary(
  onBeginPlacement: (template: BlockTemplateSnapshot, runAfterPlacement: boolean) => void
): void {
  render(
    <I18nProvider initialLocale="zh-CN">
      <BlockTemplateLibraryRoot
        isDesktopRuntime
        currentProjectId="project-1"
        onBeginPlacement={onBeginPlacement}
      />
    </I18nProvider>
  )
}

function createTemplate(
  input: Pick<BlockTemplateSnapshot, 'id' | 'name' | 'scope'>
): BlockTemplateSnapshot {
  return {
    ...input,
    type: 'terminal',
    description: '',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    nodes: [
      {
        templateNodeId: 'node-1',
        name: input.name,
        description: '',
        launchCommand: 'pnpm dev',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        position: { x: 0, y: 0 },
        size: { width: 420, height: 300 }
      }
    ],
    connections: []
  }
}
