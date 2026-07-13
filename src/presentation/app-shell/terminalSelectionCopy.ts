import type { Terminal as XTerm } from '@xterm/xterm'

export function installTerminalSelectionCopy(terminal: XTerm): void {
  terminal.attachCustomKeyEventHandler((event) => {
    if (!isCopyShortcut(event) || !terminal.hasSelection()) {
      return true
    }

    event.preventDefault()
    event.stopPropagation()
    copySelection(terminal)
    return false
  })
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
