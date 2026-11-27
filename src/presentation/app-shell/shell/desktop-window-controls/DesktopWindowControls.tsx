import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus'
import { ArrowsInSimpleIcon } from '@phosphor-icons/react/dist/csr/ArrowsInSimple'
import { ArrowsOutSimpleIcon } from '@phosphor-icons/react/dist/csr/ArrowsOutSimple'
import { useI18n } from '../../../i18n/useI18n'
import { useNativeWindowFlag } from '../lifecycle/useWindowFullScreenState'
import type {
  DesktopWindowControlsApi,
  SnapButtonBounds
} from '../../../../platform/ipc/desktopWindowControls'

export function DesktopWindowControls({ api }: { readonly api: DesktopWindowControlsApi }) {
  const { t } = useI18n()
  const maximized = useNativeWindowFlag(api.isMaximized, api.onMaximizedChange)
  const maximizeButton = useRef<HTMLButtonElement>(null)
  const [nativeHover, setNativeHover] = useState(false)
  const snap = api.snap
  useLayoutEffect(() => {
    const button = maximizeButton.current
    if (!snap || !button) return
    const unsubscribe = snap.onHoverChange(setNativeHover)
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

  const MaximizeIcon = maximized ? ArrowsInSimpleIcon : ArrowsOutSimpleIcon
  // Window controls must remain above the settings surface and outside its inert app root.
  return createPortal(
    <div
      className="desktop-window-controls"
      role="group"
      aria-label={t('app.windowControls')}
      data-snap-hover={nativeHover || undefined}
    >
      <button
        type="button"
        className="desktop-caption-close"
        aria-label={t('app.closeWindow')}
        onClick={() => void api.perform('close')}
      >
        <XIcon aria-hidden="true" weight="bold" />
      </button>
      <button
        type="button"
        className="desktop-caption-minimize"
        aria-label={t('app.minimizeWindow')}
        onClick={() => void api.perform('minimize')}
      >
        <MinusIcon aria-hidden="true" weight="bold" />
      </button>
      <button
        type="button"
        ref={maximizeButton}
        className="desktop-caption-maximize"
        aria-label={t(maximized ? 'app.restoreWindow' : 'app.maximizeWindow')}
        onClick={() => void api.perform('toggle-maximize')}
      >
        <MaximizeIcon aria-hidden="true" weight="bold" />
      </button>
    </div>,
    document.body
  )
}
