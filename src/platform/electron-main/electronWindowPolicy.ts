interface NormalElectronWindowPolicy {
  readonly backgroundThrottling: true
  readonly mode: 'normal'
  readonly show: true
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
      show: true
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
