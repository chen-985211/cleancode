import { fireEvent, render, screen } from '@testing-library/react'

import { defaultApplicationShortcutBindings } from '../../../src/presentation/app-shell/applicationShortcuts'
import {
  useApplicationShortcuts,
  type ApplicationShortcutActions
} from '../../../src/presentation/app-shell/useApplicationShortcuts'

describe('application shortcut dispatch', () => {
  it.each([
    ['openSettings', ',', false],
    ['createTerminal', 't', false],
    ['createAgent', 'a', true],
    ['groupTerminals', 'g', false]
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

  it('ignores keyboard auto-repeat', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} />)

    fireEvent.keyDown(document, { key: 'a', metaKey: true, repeat: true, shiftKey: true })

    expect(actions.createAgent.run).not.toHaveBeenCalled()
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

  it('suspends global actions while a modal dialog is open', () => {
    const actions = createActions()
    render(<ShortcutHarness actions={actions} showDialog />)

    fireEvent.keyDown(document, { key: 't', metaKey: true })
    fireEvent.keyDown(document, { key: ',', metaKey: true })

    expect(actions.createTerminal.run).not.toHaveBeenCalled()
    expect(actions.openSettings.run).not.toHaveBeenCalled()
  })
})

function ShortcutHarness({
  actions,
  showDialog = false
}: {
  readonly actions: ApplicationShortcutActions
  readonly showDialog?: boolean
}) {
  useApplicationShortcuts({
    actions,
    bindings: defaultApplicationShortcutBindings,
    platform: 'mac'
  })

  return (
    <>
      <input aria-label="快捷键测试输入" />
      <div aria-label="快捷键测试编辑区" contentEditable suppressContentEditableWarning>
        编辑
      </div>
      <div className="xterm" aria-label="快捷键测试终端" tabIndex={0} />
      {showDialog ? <div role="dialog" aria-modal="true" aria-label="测试对话框" /> : null}
    </>
  )
}

function createActions(
  enabled: Partial<Record<keyof ApplicationShortcutActions, boolean>> = {}
): ApplicationShortcutActions {
  return {
    openSettings: { enabled: enabled.openSettings ?? true, run: vi.fn() },
    createTerminal: { enabled: enabled.createTerminal ?? true, run: vi.fn() },
    createAgent: { enabled: enabled.createAgent ?? true, run: vi.fn() },
    groupTerminals: { enabled: enabled.groupTerminals ?? true, run: vi.fn() }
  }
}
