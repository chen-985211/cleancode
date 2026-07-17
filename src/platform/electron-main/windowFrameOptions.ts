export function resolveWindowFrameOptions(platform: NodeJS.Platform): {
  readonly titleBarOverlay?: true
  readonly titleBarStyle?: 'hiddenInset'
} {
  return platform === 'darwin' ? { titleBarStyle: 'hiddenInset', titleBarOverlay: true } : {}
}
