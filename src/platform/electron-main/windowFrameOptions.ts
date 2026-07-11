export function resolveWindowFrameOptions(platform: NodeJS.Platform): {
  readonly titleBarStyle?: 'hiddenInset'
} {
  return platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}
}
