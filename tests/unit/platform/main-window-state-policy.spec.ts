import {
  decodeMainWindowState,
  resolveMainWindowFullScreenOptions,
  resolveMainWindowStartupState
} from '../../../src/platform/electron-main/mainWindowStatePolicy'

const primaryDisplay = {
  isPrimary: true,
  workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
}

describe('main window state policy', () => {
  it.each([
    ['normal', {}],
    ['maximized', {}],
    ['fullscreen', { fullscreen: true }]
  ] as const)('maps %s mode to native fullscreen constructor options', (displayMode, expected) => {
    expect(resolveMainWindowFullScreenOptions(displayMode)).toEqual(expected)
  })

  it.each([
    ['missing state', undefined],
    ['wrong schema version', { version: 2, normalBounds: {}, displayMode: 'normal' }],
    [
      'unsupported display mode',
      {
        version: 1,
        normalBounds: { x: 10, y: 20, width: 1_200, height: 800 },
        displayMode: 'minimized'
      }
    ],
    [
      'undersized bounds',
      {
        version: 1,
        normalBounds: { x: 10, y: 20, width: 959, height: 640 },
        displayMode: 'normal'
      }
    ],
    [
      'non-integer bounds',
      {
        version: 1,
        normalBounds: { x: 10.5, y: 20, width: 1_200, height: 800 },
        displayMode: 'normal'
      }
    ]
  ])('rejects %s', (_name, value) => {
    expect(decodeMainWindowState(value)).toBeNull()
  })

  it('centers the current default size in the primary work area without saved state', () => {
    expect(
      resolveMainWindowStartupState({
        displays: [primaryDisplay],
        persistedState: null,
        policy: { mode: 'normal' }
      })
    ).toEqual({
      displayMode: 'normal',
      normalBounds: { x: 360, y: 140, width: 1_200, height: 800 }
    })
  })

  it.each(['normal', 'maximized', 'fullscreen'] as const)(
    'preserves valid normal bounds and the %s display mode',
    (displayMode) => {
      const normalBounds = { x: 140, y: 90, width: 1_360, height: 860 }

      expect(
        resolveMainWindowStartupState({
          displays: [primaryDisplay],
          persistedState: {
            version: 1,
            displayMode,
            normalBounds
          },
          policy: { mode: 'normal' }
        })
      ).toEqual({ displayMode, normalBounds })
    }
  )

  it('keeps a saved window on the matching negative-coordinate display', () => {
    const normalBounds = { x: -1_500, y: 80, width: 1_200, height: 760 }

    expect(
      resolveMainWindowStartupState({
        displays: [
          primaryDisplay,
          {
            isPrimary: false,
            workArea: { x: -1_600, y: 0, width: 1_600, height: 900 }
          }
        ],
        persistedState: { version: 1, displayMode: 'normal', normalBounds },
        policy: { mode: 'normal' }
      })
    ).toEqual({ displayMode: 'normal', normalBounds })
  })

  it('preserves bounds fully covered by adjacent displays when the layout is unchanged', () => {
    const normalBounds = { x: 1_600, y: 100, width: 1_200, height: 800 }

    expect(
      resolveMainWindowStartupState({
        displays: [
          primaryDisplay,
          {
            isPrimary: false,
            workArea: { x: 1_920, y: 0, width: 1_920, height: 1_080 }
          }
        ],
        persistedState: { version: 1, displayMode: 'normal', normalBounds },
        policy: { mode: 'normal' }
      })
    ).toEqual({ displayMode: 'normal', normalBounds })
  })

  it('normalizes spanning bounds when the current displays leave an uncovered gap', () => {
    expect(
      resolveMainWindowStartupState({
        displays: [
          primaryDisplay,
          {
            isPrimary: false,
            workArea: { x: 2_000, y: 0, width: 1_920, height: 1_080 }
          }
        ],
        persistedState: {
          version: 1,
          displayMode: 'normal',
          normalBounds: { x: 1_600, y: 100, width: 1_200, height: 800 }
        },
        policy: { mode: 'normal' }
      })
    ).toEqual({
      displayMode: 'normal',
      normalBounds: { x: 2_000, y: 100, width: 1_200, height: 800 }
    })
  })

  it('fits an offscreen saved window into the primary work area after displays change', () => {
    expect(
      resolveMainWindowStartupState({
        displays: [
          {
            isPrimary: true,
            workArea: { x: 0, y: 0, width: 1_280, height: 720 }
          }
        ],
        persistedState: {
          version: 1,
          displayMode: 'maximized',
          normalBounds: { x: -1_600, y: 60, width: 1_440, height: 900 }
        },
        policy: { mode: 'normal' }
      })
    ).toEqual({
      displayMode: 'maximized',
      normalBounds: { x: 0, y: 0, width: 1_280, height: 720 }
    })
  })

  it('restores only size for the isolated offscreen E2E policy', () => {
    expect(
      resolveMainWindowStartupState({
        displays: [primaryDisplay],
        persistedState: {
          version: 1,
          displayMode: 'fullscreen',
          normalBounds: { x: 140, y: 90, width: 1_360, height: 860 }
        },
        policy: { mode: 'offscreen-inactive', position: { x: -50_000, y: -50_000 } }
      })
    ).toEqual({
      displayMode: 'normal',
      normalBounds: { x: -50_000, y: -50_000, width: 1_360, height: 860 }
    })
  })
})
