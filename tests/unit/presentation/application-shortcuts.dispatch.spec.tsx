import { fireEvent, render, screen } from '@testing-library/react'

import {
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBindings
} from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcuts'
import {
  useApplicationShortcuts,
  type ApplicationShortcutActions
} from '../../../src/presentation/app-shell/app-features/shortcuts/useApplicationShortcuts'

describe('application shortcut dispatch', () => {
  it.each([
    ['openSettings', ',', false],
    ['toggleSidebar', 'b', false],
    ['addProject', 'o', false],
    ['createBranchWorkspace', 'n', false],
    ['previousWorkspace', 'ArrowUp', true],
    ['nextWorkspace', 'ArrowDown', true],
    ['createTerminal', 't', false],
    ['createAgent', 'a', true],
    ['groupTerminals', 'g', false],
    ['zoomCanvasIn', ']', false],
    ['zoomCanvasOut', '[', false],
    ['fitCanvas', '\\', false],
    ['selectCanvasNodeLeft', 'ArrowLeft', false],
    ['selectCanvasNodeRight', 'ArrowRight', false],
    ['selectCanvasNodeUp', 'ArrowUp', false],
    ['selectCanvasNodeDown', 'ArrowDown', false],
    ['toggleMinimap', 'm', true],
    ['quickExecution1', '1', false],
    ['quickExecution2', '2', false],
    ['quickExecution3', '3', false],
    ['quickExecution4', '4', false],
    ['quickExecution5', '5', false]
  ] as const)(
    'dispatches the %s default shortcut and cancels the native event',
    (command, key, shiftKey) => {
      const actions = createActions()
      render(<ShortcutHarness actions={actions} />)

      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
        metaKey: true,
        shiftKey
      })
      document.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(actions[command].run).toHaveBeenCalledTimes(1)
      for (const [otherCommand, action] of Object.entries(actions)) {
        if (otherCommand !== command) {
          expect(action.run).not.toHaveBeenCalled()
        }
      }
    }
  )

  it.each([
    ['selectCanvasNodeLeft', 'ArrowLeft'],
    ['selectCanvasNodeRight', 'ArrowRight'],
    ['selectCanvasNodeUp', 'ArrowUp'],
    ['selectCanvasNodeDown', 'ArrowDown']
  ] as const)('dispatches %s once and ignores keyboard auto-repeat', (command, key) => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key, metaKey: true })
    fireEvent.keyDown(document, { key, metaKey: true, repeat: true })
    fireEvent.keyUp(document, { key, metaKey: true })

    expect(actions[command].run).toHaveBeenCalledTimes(1)
  })

  it('consumes a directional shortcut before a focused canvas node can move itself', () => {
    const actions = createActions()
    const moveFocusedNode = vi.fn()
    render(<ShortcutHarness actions={actions} onCanvasNodeArrowKey={moveFocusedNode} />)

    fireEvent.keyDown(screen.getByLabelText('已选中画布节点'), {
      key: 'ArrowRight',
      metaKey: true
    })

    expect(actions.selectCanvasNodeRight.run).toHaveBeenCalledOnce()
    expect(moveFocusedNode).not.toHaveBeenCalled()
  })

  it('ignores keyboard auto-repeat for non-pan actions', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'a', metaKey: true, repeat: true, shiftKey: true })

    expect(actions.createAgent.run).not.toHaveBeenCalled()
  })

  it('ignores keyboard auto-repeat through a customized directional selection binding', () => {
    const actions = createActions()
    const bindings: ApplicationShortcutBindings = {
      ...defaultApplicationShortcutBindings,
      selectCanvasNodeLeft: { alt: false, key: 'H', primary: true, shift: false }
    }
    render(<ShortcutHarness actions={actions} bindings={bindings} />)

    fireEvent.keyDown(document, { key: 'h', metaKey: true })
    fireEvent.keyDown(document, { key: 'h', metaKey: true, repeat: true })
    fireEvent.keyUp(document, { key: 'h', metaKey: true })

    expect(actions.selectCanvasNodeLeft.run).toHaveBeenCalledTimes(1)
  })

  it('captures directional selection shortcuts from xterm without forwarding them to terminal input', () => {
    const actions = createActions()
    const handleTerminalArrowKey = vi.fn()
    render(<ShortcutHarness actions={actions} onTerminalArrowKey={handleTerminalArrowKey} />)

    fireEvent.keyDown(screen.getByLabelText('快捷键测试终端'), {
      key: 'ArrowLeft',
      metaKey: true
    })

    expect(actions.selectCanvasNodeLeft.run).toHaveBeenCalledOnce()
    expect(handleTerminalArrowKey).not.toHaveBeenCalled()
  })

  it('does not dispatch disabled actions or partial modifier matches', () => {
    const actions = createActions({ groupTerminals: false })
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'g', metaKey: true })
    fireEvent.keyDown(document, { key: 't', metaKey: true, shiftKey: true })

    expect(actions.groupTerminals.run).not.toHaveBeenCalled()
    expect(actions.createTerminal.run).not.toHaveBeenCalled()
  })

  it('does not create an Agent without the Shift modifier', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'a', metaKey: true })

    expect(actions.createAgent.run).not.toHaveBeenCalled()
  })

  it.each([
    ['text input', '快捷键测试输入'],
    ['content editable region', '快捷键测试编辑区'],
    ['xterm surface', '快捷键测试终端']
  ])('protects the %s from application shortcuts', (_name, label) => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(screen.getByLabelText(label), {
      key: 't',
      metaKey: true
    })

    expect(actions.createTerminal.run).not.toHaveBeenCalled()
  })

  it('does not execute a quick slot while terminal input has focus', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(screen.getByLabelText('快捷键测试终端'), {
      key: '1',
      metaKey: true
    })

    expect(actions.quickExecution1.run).not.toHaveBeenCalled()
  })

  it('suspends global actions while a modal dialog is open', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} showDialog />)

    fireEvent.keyDown(document, { key: 't', metaKey: true })
    fireEvent.keyDown(document, { key: ',', metaKey: true })

    expect(actions.createTerminal.run).not.toHaveBeenCalled()
    expect(actions.openSettings.run).not.toHaveBeenCalled()
  })

  it('suspends directional selection while a shortcut recorder owns the key event', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(screen.getByLabelText('快捷键录制器'), {
      key: 'ArrowRight',
      metaKey: true
    })

    expect(actions.selectCanvasNodeRight.run).not.toHaveBeenCalled()
  })
})

function ShortcutHarness({
  actions,
  bindings = defaultApplicationShortcutBindings,
  onCanvasNodeArrowKey,
  onTerminalArrowKey,
  showDialog = false
}: {
  readonly actions: ApplicationShortcutActions
  readonly bindings?: ApplicationShortcutBindings
  readonly onCanvasNodeArrowKey?: () => void
  readonly onTerminalArrowKey?: () => void
  readonly showDialog?: boolean
}) {
  useApplicationShortcuts({
    actions,
    bindings,
    platform: 'mac'
  })

  return (
    <>
      <input aria-label="快捷键测试输入" />
      <div aria-label="快捷键测试编辑区" contentEditable suppressContentEditableWarning>
        编辑
      </div>
      <div
        className="xterm"
        aria-label="快捷键测试终端"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow')) onTerminalArrowKey?.()
        }}
      />
      <div
        aria-label="已选中画布节点"
        role="group"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow')) onCanvasNodeArrowKey?.()
        }}
      />
      <button type="button" aria-label="快捷键录制器" data-shortcut-capture />
      {showDialog ? <div role="dialog" aria-modal="true" aria-label="测试对话框" /> : null}
    </>
  )
}

function createActions(
  enabled: Partial<Record<keyof ApplicationShortcutActions, boolean>> = {}
): ApplicationShortcutActions {
  return {
    openSettings: { enabled: enabled.openSettings ?? true, run: vi.fn() },
    toggleSidebar: { enabled: enabled.toggleSidebar ?? true, run: vi.fn() },
    addProject: { enabled: enabled.addProject ?? true, run: vi.fn() },
    createBranchWorkspace: {
      enabled: enabled.createBranchWorkspace ?? true,
      run: vi.fn()
    },
    previousWorkspace: { enabled: enabled.previousWorkspace ?? true, run: vi.fn() },
    nextWorkspace: { enabled: enabled.nextWorkspace ?? true, run: vi.fn() },
    createTerminal: { enabled: enabled.createTerminal ?? true, run: vi.fn() },
    createAgent: { enabled: enabled.createAgent ?? true, run: vi.fn() },
    groupTerminals: { enabled: enabled.groupTerminals ?? true, run: vi.fn() },
    zoomCanvasIn: { enabled: enabled.zoomCanvasIn ?? true, run: vi.fn() },
    zoomCanvasOut: { enabled: enabled.zoomCanvasOut ?? true, run: vi.fn() },
    fitCanvas: { enabled: enabled.fitCanvas ?? true, run: vi.fn() },
    selectCanvasNodeLeft: { enabled: enabled.selectCanvasNodeLeft ?? true, run: vi.fn() },
    selectCanvasNodeRight: { enabled: enabled.selectCanvasNodeRight ?? true, run: vi.fn() },
    selectCanvasNodeUp: { enabled: enabled.selectCanvasNodeUp ?? true, run: vi.fn() },
    selectCanvasNodeDown: { enabled: enabled.selectCanvasNodeDown ?? true, run: vi.fn() },
    toggleMinimap: { enabled: enabled.toggleMinimap ?? true, run: vi.fn() },
    quickExecution1: { enabled: enabled.quickExecution1 ?? true, run: vi.fn() },
    quickExecution2: { enabled: enabled.quickExecution2 ?? true, run: vi.fn() },
    quickExecution3: { enabled: enabled.quickExecution3 ?? true, run: vi.fn() },
    quickExecution4: { enabled: enabled.quickExecution4 ?? true, run: vi.fn() },
    quickExecution5: { enabled: enabled.quickExecution5 ?? true, run: vi.fn() }
  }
}
