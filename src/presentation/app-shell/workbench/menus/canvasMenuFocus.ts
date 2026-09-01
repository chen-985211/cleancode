export function restoreCanvasMenuFocus(preferredTarget: HTMLElement | null): void {
  const target =
    preferredTarget && preferredTarget !== document.body && preferredTarget.isConnected
      ? preferredTarget
      : document.querySelector<HTMLElement>('.canvas-surface')
  target?.focus({ preventScroll: true })
}
