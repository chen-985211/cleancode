export function resolveWindowFrameOptions(platform: NodeJS.Platform): {
  readonly acceptFirstMouse?: true
  readonly titleBarStyle?: 'hiddenInset'
  readonly trafficLightPosition?: { readonly x: number; readonly y: number }
  readonly frame?: false
  readonly autoHideMenuBar?: true
} {
  if (platform === 'darwin') {
    return {
      acceptFirstMouse: true,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 }
    }
  }
  if (platform === 'win32') return { frame: false }
  if (platform === 'linux') return { frame: false, autoHideMenuBar: true }
  return {}
}

export function shouldRemoveDefaultWindowMenu(platform: NodeJS.Platform): boolean {
  return platform === 'win32'
}
