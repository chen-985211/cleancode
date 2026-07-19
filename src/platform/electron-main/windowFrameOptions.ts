export function resolveWindowFrameOptions(platform: NodeJS.Platform): {
  readonly acceptFirstMouse?: true
  readonly titleBarStyle?: 'hiddenInset'
  readonly trafficLightPosition?: { readonly x: number; readonly y: number }
} {
  return platform === 'darwin'
    ? {
        acceptFirstMouse: true,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 12 }
      }
    : {}
}
