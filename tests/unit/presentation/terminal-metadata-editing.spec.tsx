import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalNode } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import { I18nProvider } from '../../../src/presentation/i18n/I18nProvider'
import { supportedLocales, type Locale } from '../../../src/presentation/i18n/locale'
import { translate } from '../../../src/presentation/i18n/messages'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  NodeResizeControl: () => null,
  Position: { Left: 'left', Right: 'right' }
}))

describe('terminal metadata editing', () => {
  it.each(supportedLocales)('describes the current edit or cancel action in %s', async (locale) => {
    const cancelLabels = { 'zh-CN': '取消编辑', en: 'Cancel editing' } satisfies Record<
      Locale,
      string
    >
    render(
      <I18nProvider initialLocale={locale}>
        <TerminalNode
          id="terminal-1"
          type="terminal"
          data={createTerminalNodeData()}
          dragging={false}
          zIndex={0}
          selectable
          deletable
          selected={false}
          draggable
          isConnectable={false}
          positionAbsoluteX={240}
          positionAbsoluteY={180}
        />
      </I18nProvider>
    )
    const namedAction = (action: string) =>
      translate(locale, 'terminal.namedAction', {
        blockName: 'Terminal',
        action
      })
    const editLabel = namedAction(translate(locale, 'terminal.action.edit'))
    const trigger = screen.getByRole('button', { name: editLabel })
    fireEvent.click(trigger)
    expect(trigger).toHaveAccessibleName(namedAction(cancelLabels[locale]))
    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focus(trigger)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(cancelLabels[locale])
    fireEvent.click(trigger)
    expect(trigger).toHaveAccessibleName(editLabel)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('submits metadata and execution configuration through one definition update', async () => {
    const onUpdateDefinition = vi.fn(async () => undefined)
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...createTerminalNodeData(), onUpdateDefinition }}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    const editButton = screen.getByRole('button', { name: 'Terminal 编辑终端信息' })

    fireEvent.click(editButton)

    expect(editButton).toHaveAttribute('aria-expanded', 'true')
    expect(editButton).toHaveAttribute('aria-pressed', 'true')
    expect(editButton).toHaveAttribute('aria-controls', 'terminal-metadata-form-terminal-1')
    expect(screen.getByRole('form', { name: '编辑终端信息' })).toHaveAttribute(
      'id',
      'terminal-metadata-form-terminal-1'
    )
    fireEvent.change(screen.getByLabelText('启动命令'), { target: { value: ' pnpm dev ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存终端信息' }))

    await waitFor(() =>
      expect(onUpdateDefinition).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'terminal-1' }),
        {
          name: 'Terminal',
          description: 'Local shell',
          launchCommand: 'pnpm dev',
          executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
        }
      )
    )
    expect(onUpdateDefinition).toHaveBeenCalledTimes(1)
    expect(editButton).toHaveAttribute('aria-expanded', 'false')
    expect(editButton).toHaveFocus()
  })

  it.each(['edit button', 'cancel button', 'Escape'])(
    'cancels via %s during opening and reopens with saved values during exit',
    (cancelAction) => {
      const onUpdateDefinition = vi.fn(async () => undefined)
      render(
        <TerminalNode
          id="terminal-1"
          type="terminal"
          data={{ ...createTerminalNodeData(), onUpdateDefinition }}
          dragging={false}
          zIndex={0}
          selectable
          deletable
          selected={false}
          draggable
          isConnectable={false}
          positionAbsoluteX={240}
          positionAbsoluteY={180}
        />
      )
      const trigger = screen.getByRole('button', { name: 'Terminal 编辑终端信息' })
      fireEvent.click(trigger)
      const form = screen.getByRole('form', { name: '编辑终端信息' })
      const surface = form.closest('.terminal-metadata-surface')!
      const positioner = form.closest('.terminal-metadata-positioner')!
      expect(surface).toHaveAttribute('data-surface-motion-state', 'opening')
      expect(positioner).not.toHaveAttribute('inert')
      fireEvent.change(screen.getByLabelText('终端名称'), { target: { value: 'Unsaved name' } })
      fireEvent.change(screen.getByLabelText('启动命令'), { target: { value: 'unsaved command' } })
      fireEvent.change(screen.getByLabelText('任务超时'), { target: { value: 'invalid timeout' } })
      if (cancelAction === 'edit button') fireEvent.click(trigger)
      else if (cancelAction === 'cancel button') {
        fireEvent.click(screen.getByRole('button', { name: '取消编辑终端信息' }))
      } else fireEvent.keyDown(screen.getByLabelText('终端名称'), { key: 'Escape' })
      expect(trigger).toHaveFocus()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).toHaveAttribute('aria-pressed', 'false')
      expect(surface).toHaveAttribute('data-surface-motion-state', 'closing')
      expect(form).toBeInTheDocument()
      expect(form.closest('[inert]')).not.toBeNull()
      // The positioning wrapper can overlap other nodes even after the surface stops receiving input.
      expect(positioner).toHaveAttribute('inert')
      expect(screen.queryByRole('form')).not.toBeInTheDocument()
      fireEvent.click(trigger)
      expect(screen.getByRole('form').closest('.terminal-metadata-surface')).toBe(surface)
      expect(surface).toHaveAttribute('data-surface-motion-state', 'opening')
      expect(positioner).not.toHaveAttribute('inert')
      expect(screen.getByLabelText('终端名称')).toHaveValue('Terminal')
      expect(screen.getByLabelText('启动命令')).toHaveValue('')
      expect(screen.getByLabelText('任务超时')).toHaveValue('')
      expect(screen.getByLabelText('终端名称')).toHaveFocus()
      expect(onUpdateDefinition).not.toHaveBeenCalled()
    }
  )

  it('does not cancel an in-flight save through the edit toggle and permits cancellation after failure', async () => {
    let rejectSave!: (reason: Error) => void
    const onUpdateDefinition = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        })
    )
    render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...createTerminalNodeData(), onUpdateDefinition }}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )
    const trigger = screen.getByRole('button', { name: 'Terminal 编辑终端信息' })
    fireEvent.click(trigger)
    fireEvent.change(screen.getByLabelText('终端名称'), { target: { value: 'Unsaved name' } })
    fireEvent.click(screen.getByRole('button', { name: '保存终端信息' }))
    expect(trigger).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true')
    await act(async () => rejectSave(new Error('save failed')))
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByLabelText('终端名称')).toHaveValue('Unsaved name')
    fireEvent.click(trigger)
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(onUpdateDefinition).toHaveBeenCalledTimes(1)
  })

  it('opens the existing launch-command editor for an external quick-execution request', async () => {
    const data = createTerminalNodeData()
    const { rerender } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={data}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    expect(screen.queryByLabelText('启动命令')).not.toBeInTheDocument()

    rerender(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{ ...data, launchCommandEditRequestId: 1 }}
        dragging={false}
        zIndex={0}
        selectable
        deletable
        selected={false}
        draggable
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )

    await waitFor(() => expect(screen.getByLabelText('启动命令')).toHaveFocus())
  })
})

function createTerminalNodeData(): TerminalFlowNode['data'] {
  const block = {
    id: 'terminal-1',
    type: 'terminal' as const,
    name: 'Terminal',
    description: 'Local shell',
    launchCommand: '',
    position: { x: 240, y: 180 },
    size: defaultTerminalBlockSize
  }

  return {
    identity: {
      projectId: 'project-1',
      workspaceId: 'main',
      objectKind: 'terminal',
      objectId: 'terminal-1'
    },
    block,
    session: { sessionId: null, status: 'idle', output: '' },
    isSelected: false,
    isTerminalGroupSelectionMode: false,
    canSelectForTerminalGroup: true,
    isNavigationHighlighted: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onQuickLaunch: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateDefinition: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(),
    onSelect: vi.fn(),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}
