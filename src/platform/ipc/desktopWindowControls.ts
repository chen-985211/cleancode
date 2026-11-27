export const desktopWindowChannels = {
  perform: 'cleancode:perform-desktop-window-action',
  isMaximized: 'cleancode:is-window-maximized',
  maximizedChanged: 'cleancode:window-maximized-changed',
  setSnapBounds: 'cleancode:set-snap-button-bounds',
  snapHoverChanged: 'cleancode:snap-button-hover-changed'
} as const

export type DesktopWindowAction = 'close' | 'minimize' | 'toggle-maximize'

/** Physical pixels relative to the renderer's client area. */
export interface SnapButtonBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface DesktopWindowControlsApi {
  perform(action: DesktopWindowAction): Promise<void>
  isMaximized(): Promise<boolean>
  onMaximizedChange(listener: (maximized: boolean) => void): () => void
  readonly snap?: {
    setBounds(bounds: SnapButtonBounds | null): Promise<void>
    onHoverChange(listener: (hovered: boolean) => void): () => void
  }
}

export function supportsSnapLayouts(platform: NodeJS.Platform, release: string): boolean {
  return platform === 'win32' && Number(release.split('.')[2]) >= 22000
}
