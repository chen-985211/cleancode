import { useId, type CSSProperties, type ReactNode } from 'react'

import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { readTerminalThemeProjectionMatrix } from '../terminal-surface/terminalTheme'

export function TerminalThemeProjection({
  children,
  className,
  sourceTheme
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly sourceTheme?: TerminalSourceTheme
}) {
  const filterId = `terminal-theme-${useId()}`
  const filterStyle = sourceTheme
    ? ({ '--cc-terminal-theme-mismatch-filter': `url("#${filterId}")` } as CSSProperties)
    : undefined

  return (
    <div
      className={['terminal-theme-projection', className].filter(Boolean).join(' ')}
      data-terminal-source-theme={sourceTheme}
      style={filterStyle}
    >
      {children}
      {sourceTheme ? (
        <svg className="terminal-theme-projection__filter" aria-hidden="true" focusable="false">
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values={readTerminalThemeProjectionMatrix(sourceTheme).join(' ')}
              />
            </filter>
          </defs>
        </svg>
      ) : null}
    </div>
  )
}
