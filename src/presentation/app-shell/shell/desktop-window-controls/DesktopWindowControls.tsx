import { useLayoutEffect, useRef, useState } from 'react'
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer'
import { createPortal } from 'react-dom'
import { useI18n } from '../../../i18n/useI18n'
import { useNativeWindowState } from '../lifecycle/useWindowFullScreenState'
import type {
  DesktopWindowControlsApi,
  SnapButtonBounds,
  SnapPointerState
} from '../../../../platform/ipc/desktopWindowControls'

const initialState = { focused: false, maximized: false }

export function DesktopWindowControls({ api }: { readonly api: DesktopWindowControlsApi }) {
  const { t } = useI18n()
  const { focused, maximized } = useNativeWindowState(
    initialState,
    api.readState,
    api.onStateChange
  )
  const maximizeButton = useRef<HTMLButtonElement>(null)
  const [nativePointer, setNativePointer] = useState<SnapPointerState>('idle')
  const snap = api.snap
  useLayoutEffect(() => {
    const button = maximizeButton.current
    if (!snap || !button) return
    const unsubscribe = snap.onPointerChange(setNativePointer)
    const publish = (): void => {
      const { x, y, width, height } = button.getBoundingClientRect()
      const scale = window.devicePixelRatio
      const bounds: SnapButtonBounds | null =
        width && height
          ? {
              x: Math.round(x * scale),
              y: Math.round(y * scale),
              width: Math.round((x + width) * scale) - Math.round(x * scale),
              height: Math.round((y + height) * scale) - Math.round(y * scale)
            }
          : null
      void snap.setBounds(bounds)
    }
    const observer = new ResizeObserver(publish)
    observer.observe(button, { box: 'device-pixel-content-box' })
    window.addEventListener('resize', publish)
    publish()
    return () => {
      unsubscribe()
      observer.disconnect()
      window.removeEventListener('resize', publish)
      void snap.setBounds(null)
    }
  }, [snap])

  // Window chrome remains interactive outside the app root and any open modal.
  return createPortal(
    <DismissableLayerBranch
      className="desktop-window-controls"
      role="group"
      aria-label={t('app.windowControls')}
      data-inactive={!focused || undefined}
      data-snap-pointer={nativePointer === 'idle' ? undefined : nativePointer}
    >
      <button
        type="button"
        className="desktop-caption-close"
        aria-label={t('app.closeWindow')}
        onClick={() => void api.perform('close')}
      >
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M4.4 4.4L9.6 9.6M9.6 4.4L4.4 9.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="desktop-caption-minimize"
        aria-label={t('app.minimizeWindow')}
        onClick={() => void api.perform('minimize')}
      >
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <rect x="3" y="6" width="8" height="2" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        ref={maximizeButton}
        className="desktop-caption-maximize"
        aria-label={t(maximized ? 'app.restoreWindow' : 'app.maximizeWindow')}
        onClick={() => void api.perform('toggle-maximize')}
      >
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <path
            d={
              maximized
                ? 'M3 6.25 6.25 3v3.25ZM11 7.75 7.75 11V7.75Z'
                : 'M4 9.1V5.6Q4 4 5.6 4h3.5ZM10 4.9v3.5Q10 10 8.4 10H4.9Z'
            }
          />
        </svg>
      </button>
    </DismissableLayerBranch>,
    document.body
  )
}
