import { acquireSurfaceIsolationLease } from '../../shared/motion/surfaceIsolation'

export function isolateCoveredWorkbenchControls(dock: HTMLElement): () => void {
  const shell = dock.closest<HTMLElement>('.app-shell') ?? dock.parentElement!
  const chrome = shell.querySelectorAll<HTMLElement>(
    '.workbench-navigation-layer, .app-shell__toolbar, .app-shell__settings, .app-shell__statusbar'
  )
  const leases = new Map<HTMLElement, () => void>()

  function update() {
    const left = dock.getBoundingClientRect().left
    const covered = new Set<HTMLElement>()
    for (const region of chrome) {
      const candidates = region.querySelectorAll<HTMLElement>(
        '.canvas-minimap, button, a[href], input, select, textarea, [tabindex]'
      )
      for (const control of candidates) {
        const box = control.getBoundingClientRect()
        if (box.width > 0 && box.left >= left) covered.add(control)
      }
    }
    for (const [control, release] of leases) {
      if (!covered.has(control)) {
        release()
        leases.delete(control)
      }
    }
    for (const control of covered) {
      if (!leases.has(control)) leases.set(control, acquireSurfaceIsolationLease([control]))
    }
  }

  const resize = new ResizeObserver(update)
  resize.observe(dock)
  resize.observe(shell)
  const mutations = new MutationObserver(update)
  for (const region of chrome) {
    resize.observe(region)
    mutations.observe(region, { childList: true, subtree: true })
  }
  update()
  return () => {
    resize.disconnect()
    mutations.disconnect()
    for (const release of leases.values()) release()
  }
}
