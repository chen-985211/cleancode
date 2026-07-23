import type { ReactNode } from 'react'

import type { TerminalSourceTheme } from '../../contexts/run/domain/aggregates/TerminalSession'

export function TerminalThemeProjection({
  children,
  className,
  sourceTheme
}: {
  readonly children: ReactNode
  readonly className?: string
  readonly sourceTheme?: TerminalSourceTheme
}) {
  return (
    <div
      className={['terminal-theme-projection', className].filter(Boolean).join(' ')}
      data-terminal-source-theme={sourceTheme}
    >
      {children}
    </div>
  )
}
