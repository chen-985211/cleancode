export const desktopWindowChannels = {
  perform: 'cleancode:perform-desktop-window-action',
  readState: 'cleancode:get-desktop-window-state',
  stateChanged: 'cleancode:desktop-window-state-changed',
  setSnapBounds: 'cleancode:set-snap-button-bounds',
  snapPointerChanged: 'cleancode:snap-button-pointer-changed'
} as const

export type DesktopWindowAction = 'close' | 'minimize' | 'toggle-maximize'
export type SnapPointerState = 'idle' | 'hover' | 'pressed'

/** Physical pixels relative to the renderer's client area. */
export interface SnapButtonBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface DesktopWindowState {
  readonly maximized: boolean
  readonly focused: boolean
}

export interface DesktopWindowControlsApi {
  perform(action: DesktopWindowAction): Promise<void>
  readState(): Promise<DesktopWindowState>
  onStateChange(listener: (state: DesktopWindowState) => void): () => void
  readonly snap?: {
    setBounds(bounds: SnapButtonBounds | null): Promise<void>
    onPointerChange(listener: (state: SnapPointerState) => void): () => void
  }
}

export function supportsSnapLayouts(platform: NodeJS.Platform, release: string): boolean {
  return platform === 'win32' && Number(release.split('.')[2]) >= 22000
}
