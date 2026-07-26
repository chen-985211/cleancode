interface ExternalNavigationEvent {
  preventDefault(): void
}

interface ExternalNavigationWebContents {
  on(
    event: 'will-navigate',
    listener: (event: ExternalNavigationEvent, url: string) => void
  ): unknown
  setWindowOpenHandler(
    handler: (details: { readonly url: string }) => { readonly action: 'deny' }
  ): void
}

export function bindElectronExternalNavigationPolicy(input: {
  readonly onOpenError: (error: unknown) => void
  readonly openExternal: (address: string) => Promise<unknown>
  readonly webContents: ExternalNavigationWebContents
}): void {
  const openAllowedTarget = (rawTarget: string): void => {
    const address = readExternalHttpAddress(rawTarget)
    if (!address) return

    void input.openExternal(address).catch(input.onOpenError)
  }

  input.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedTarget(url)
    return { action: 'deny' }
  })
  input.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    openAllowedTarget(url)
  })
}

function readExternalHttpAddress(rawTarget: string): string | null {
  try {
    const address = new URL(rawTarget)
    return address.protocol === 'http:' || address.protocol === 'https:' ? address.toString() : null
  } catch {
    return null
  }
}
