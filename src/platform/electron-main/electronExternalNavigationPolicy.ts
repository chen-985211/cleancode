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
  readonly rendererUrl: string
  readonly onOpenError: (error: unknown) => void
  readonly openExternal: (address: string) => Promise<unknown>
  readonly webContents: ExternalNavigationWebContents
}): void {
  const rendererDocumentAddress = readRendererDocumentAddress(input.rendererUrl)
  const isRendererDocument = (rawTarget: string): boolean =>
    rendererDocumentAddress !== null &&
    readRendererDocumentAddress(rawTarget) === rendererDocumentAddress

  const openAllowedTarget = (rawTarget: string): void => {
    const address = readExternalHttpAddress(rawTarget)
    if (!address) return

    void input.openExternal(address).catch(input.onOpenError)
  }

  input.webContents.setWindowOpenHandler(({ url }) => {
    if (!isRendererDocument(url)) openAllowedTarget(url)
    return { action: 'deny' }
  })
  input.webContents.on('will-navigate', (event, url) => {
    // Vite full reloads originate in the renderer and also emit will-navigate.
    if (isRendererDocument(url)) return
    event.preventDefault()
    openAllowedTarget(url)
  })
}

function readRendererDocumentAddress(rawTarget: string): string | null {
  try {
    const address = new URL(rawTarget)
    if (!['http:', 'https:', 'file:'].includes(address.protocol)) return null
    address.hash = ''
    return address.href
  } catch {
    return null
  }
}

function readExternalHttpAddress(rawTarget: string): string | null {
  try {
    const address = new URL(rawTarget)
    return address.protocol === 'http:' || address.protocol === 'https:' ? address.toString() : null
  } catch {
    return null
  }
}
