interface SurfaceIsolationLease {
  count: number
  readonly hadAriaHidden: boolean
  readonly previousAriaHidden: string | null
  readonly previousInert: boolean
}

const isolationLeases = new WeakMap<HTMLElement, SurfaceIsolationLease>()

export function acquireSurfaceIsolationLease(targets: readonly HTMLElement[]): () => void {
  const leasedTargets = [...new Set(targets)]
  for (const target of leasedTargets) acquireTargetLease(target)

  let released = false
  return () => {
    if (released) return
    released = true
    for (const target of leasedTargets) releaseTargetLease(target)
  }
}

function acquireTargetLease(target: HTMLElement): void {
  const existingLease = isolationLeases.get(target)
  if (existingLease) {
    existingLease.count += 1
    return
  }

  isolationLeases.set(target, {
    count: 1,
    hadAriaHidden: target.hasAttribute('aria-hidden'),
    previousAriaHidden: target.getAttribute('aria-hidden'),
    previousInert: Boolean(target.inert)
  })
  target.inert = true
  target.setAttribute('aria-hidden', 'true')
}

function releaseTargetLease(target: HTMLElement): void {
  const lease = isolationLeases.get(target)
  if (!lease) return
  lease.count -= 1
  if (lease.count > 0) return

  isolationLeases.delete(target)
  target.inert = lease.previousInert
  if (lease.hadAriaHidden) {
    target.setAttribute('aria-hidden', lease.previousAriaHidden ?? '')
  } else {
    target.removeAttribute('aria-hidden')
  }
}
