import { useId, useLayoutEffect, useRef } from 'react'

import { createCanvasStatusbarLensMap } from './canvasStatusbarGlassLens'

export function CanvasStatusbarGlass() {
  const filterId = `canvas-statusbar-glass-${useId()}`
  const surfaceRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<SVGFEImageElement>(null)

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    const map = mapRef.current
    if (!surface || !map || !globalThis.CSS?.supports?.('backdrop-filter', 'url("#lens")')) {
      return undefined
    }

    let frame: number | null = null
    let lastSize = ''
    const update = (): void => {
      frame = null
      const width = Math.round(surface.clientWidth)
      const height = Math.round(surface.clientHeight)
      if (width <= 0 || height <= 0) return

      const radius = Number.parseFloat(getComputedStyle(surface).borderTopLeftRadius) || 0
      const size = `${width}:${height}:${radius}`
      if (size === lastSize) return

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return

      const image = context.createImageData(width, height)
      image.data.set(createCanvasStatusbarLensMap(width, height, radius))
      context.putImageData(image, 0, 0)
      map.setAttribute('href', canvas.toDataURL())
      const filterUrl = new URL(`#${filterId}`, document.baseURI).href
      surface.style.setProperty('--cc-statusbar-glass-filter', `url("${filterUrl}")`)
      lastSize = size
    }

    update()
    const observer = new ResizeObserver(() => {
      if (frame === null) frame = requestAnimationFrame(update)
    })
    observer.observe(surface)

    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [filterId])

  return (
    <div ref={surfaceRef} className="canvas-statusbar-glass" aria-hidden="true">
      <svg className="canvas-statusbar-glass__filters" focusable="false" aria-hidden="true">
        <defs>
          <filter
            id={filterId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              ref={mapRef}
              href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
              x="0"
              y="0"
              width="100%"
              height="100%"
              preserveAspectRatio="none"
              result="lensMap"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="lensMap"
              scale="26"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
    </div>
  )
}
