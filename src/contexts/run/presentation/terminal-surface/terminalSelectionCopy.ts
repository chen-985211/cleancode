import type { Terminal as XTerm } from '@xterm/xterm'

interface TerminalKeyboardShortcutOptions {
  readonly onOpenSearch?: () => void
}

export function installTerminalSelectionCopy(
  terminal: XTerm,
  options: TerminalKeyboardShortcutOptions = {}
): void {
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.isComposing || event.keyCode === 229) return true

    if (isSearchShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      options.onOpenSearch?.()
      return false
    }

    if (!isCopyShortcut(event) || !terminal.hasSelection()) {
      return true
    }

    event.preventDefault()
    event.stopPropagation()
    copySelection(terminal)
    return false
  })
}

function isSearchShortcut(event: KeyboardEvent): boolean {
  return (
    event.type === 'keydown' && event.key.toLowerCase() === 'f' && (event.metaKey || event.ctrlKey)
  )
}

function isCopyShortcut(event: KeyboardEvent): boolean {
  return (
    event.type === 'keydown' && event.key.toLowerCase() === 'c' && (event.metaKey || event.ctrlKey)
  )
}

function copySelection(terminal: XTerm): void {
  if (document.execCommand?.('copy')) {
    return
  }

  void navigator.clipboard?.writeText(terminal.getSelection()).catch(() => undefined)
}
