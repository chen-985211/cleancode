import type { WebContents } from 'electron'

export interface ApplicationQuitShortcutInput {
  readonly alt: boolean
  readonly control: boolean
  readonly isAutoRepeat: boolean
  readonly isComposing: boolean
  readonly key: string
  readonly meta: boolean
  readonly shift: boolean
  readonly type: string
}

interface ApplicationQuitShortcutEvent {
  preventDefault(): void
}

export type ApplicationQuitShortcutTarget = Pick<WebContents, 'on' | 'removeListener'>

export function matchesApplicationQuitShortcut(
  input: ApplicationQuitShortcutInput,
  platform: NodeJS.Platform
): boolean {
  if (
    input.type !== 'keyDown' ||
    input.alt ||
    input.shift ||
    input.key.toLocaleLowerCase('en-US') !== 'q'
  ) {
    return false
  }

  return platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
}

export function bindApplicationQuitShortcut(input: {
  readonly platform: NodeJS.Platform
  readonly requestConfirmation: () => void
  readonly target: ApplicationQuitShortcutTarget
}): () => void {
  const onBeforeInput = (
    event: ApplicationQuitShortcutEvent,
    shortcut: ApplicationQuitShortcutInput
  ): void => {
    if (!matchesApplicationQuitShortcut(shortcut, input.platform)) return

    event.preventDefault()
    input.requestConfirmation()
  }

  input.target.on('before-input-event', onBeforeInput)
  return () => input.target.removeListener('before-input-event', onBeforeInput)
}
