interface NormalElectronWindowPolicy {
  readonly backgroundThrottling: true
  readonly mode: 'normal'
  /**
   * Keep the native window hidden until Electron has a first composited frame.
   * Showing it immediately can expose an uninitialised renderer surface on
   * Windows while the restored canvas is still being painted.
   */
  readonly show: false
}

interface OffscreenElectronWindowPolicy {
  readonly backgroundThrottling: false
  readonly enableLargerThanScreen: true
  readonly mode: 'offscreen-inactive'
  readonly position: {
    readonly x: number
    readonly y: number
  }
  readonly show: false
}

export type ElectronWindowPolicy = NormalElectronWindowPolicy | OffscreenElectronWindowPolicy

const electronE2eOffscreenCoordinate = -50_000

export function resolveElectronWindowPolicy(input: {
  readonly backgroundE2eMarker: string | undefined
}): ElectronWindowPolicy {
  if (input.backgroundE2eMarker !== '1') {
    return {
      backgroundThrottling: true,
      mode: 'normal',
      show: false
    }
  }

  return {
    backgroundThrottling: false,
    enableLargerThanScreen: true,
    mode: 'offscreen-inactive',
    position: {
      x: electronE2eOffscreenCoordinate,
      y: electronE2eOffscreenCoordinate
    },
    show: false
  }
}
