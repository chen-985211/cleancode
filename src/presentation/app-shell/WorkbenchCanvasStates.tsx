import type { CSSProperties, Ref } from 'react'

import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import { useI18n } from './i18n/useI18n'
import type { WorkbenchSnapshot } from './types'
import type { InitialWorkbenchLoadPhase } from './useInitialWorkbenchLoad'
import { WorkbenchIcon } from './WorkbenchIcons'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export function CanvasInitialWorkbenchState({
  isDesktopRuntime,
  phase,
  onOpenProject,
  onRetry
}: {
  readonly isDesktopRuntime: boolean
  readonly phase: InitialWorkbenchLoadPhase
  readonly onOpenProject?: () => void
  readonly onRetry?: () => void
}) {
  const { t } = useI18n()

  if (!isDesktopRuntime || phase === 'ready') {
    return <CanvasEmptyState isDesktopRuntime={isDesktopRuntime} onOpenProject={onOpenProject} />
  }

  if (phase === 'loading') {
    const label = t('canvas.restoringProject')

    return (
      <div className="canvas-empty canvas-empty--loading" role="status" aria-label={label}>
        <CanvasLoadingShimmerText>{label}</CanvasLoadingShimmerText>
      </div>
    )
  }

  return (
    <div className="canvas-empty" role="alert" data-tone="danger">
      <div className="canvas-empty__panel">
        <span className="canvas-empty__icon" aria-hidden="true">
          <WorkbenchIcon role="error" size={20} />
        </span>
        <div className="canvas-empty__copy">
          <h2>{t('canvas.restoreFailedTitle')}</h2>
          <p>{t('canvas.restoreFailedDescription')}</p>
        </div>
        <button className="canvas-empty__action" type="button" onClick={onRetry}>
          <WorkbenchIcon role="restart" size={14} />
          {t('canvas.retryRestore')}
        </button>
      </div>
    </div>
  )
}

function CanvasLoadingShimmerText({ children }: { readonly children: string }) {
  const characters = Array.from(children)

  return (
    <p className="canvas-empty__loading-text" aria-hidden="true">
      {characters.map((character, index) => (
        <span
          className="canvas-empty__loading-character"
          key={`${index}-${character}`}
          style={
            {
              '--cc-loading-shimmer-delay': `${Number((index / characters.length).toFixed(3))}s`
            } as CSSProperties
          }
        >
          {character}
        </span>
      ))}
    </p>
  )
}

function CanvasEmptyState({
  isDesktopRuntime,
  onOpenProject
}: {
  readonly isDesktopRuntime: boolean
  readonly onOpenProject?: () => void
}) {
  const { t } = useI18n()

  if (isDesktopRuntime) {
    return (
      <div className="canvas-empty canvas-empty--welcome">
        <div className="canvas-empty__welcome">
          <h1 className="canvas-empty__brand">{t('canvas.emptyBrand')}</h1>
          <button className="canvas-empty__action" type="button" onClick={onOpenProject}>
            <WorkbenchIcon role="open-project" size={14} />
            {t('canvas.openProject')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="canvas-empty">
      <div className="canvas-empty__panel">
        <span className="canvas-empty__icon" aria-hidden="true">
          <WorkbenchIcon role="canvas" size={21} />
        </span>
        <div className="canvas-empty__copy">
          <p>{t('canvas.emptyPreview')}</p>
        </div>
      </div>
    </div>
  )
}

interface CanvasStatusbarProps {
  readonly isDesktopRuntime: boolean
  readonly terminalRuntimeAvailability: TerminalRuntimeAvailabilitySnapshot
  readonly initialWorkbenchLoadPhase: InitialWorkbenchLoadPhase
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly motionRef?: Ref<HTMLElement>
}

export function CanvasStatusbar({
  isDesktopRuntime,
  terminalRuntimeAvailability,
  initialWorkbenchLoadPhase,
  currentWorkbench,
  currentWorkspace,
  motionRef
}: CanvasStatusbarProps) {
  const { t } = useI18n()
  return (
    <footer ref={motionRef} className="app-shell__statusbar">
      <span
        className={`status-dot${terminalRuntimeAvailability.phase === 'ready' ? ' status-dot--running' : ''}`}
      />
      <span>
        {!isDesktopRuntime
          ? t('canvas.statusPreview')
          : initialWorkbenchLoadPhase === 'loading' && !currentWorkbench
            ? t('canvas.statusProjectRestoring')
            : initialWorkbenchLoadPhase === 'error' && !currentWorkbench
              ? t('canvas.statusProjectRestoreFailed')
              : terminalRuntimeAvailability.phase === 'initializing'
                ? t('canvas.statusRuntimeInitializing')
                : terminalRuntimeAvailability.phase === 'unavailable'
                  ? t('canvas.statusRuntimeUnavailable')
                  : currentWorkbench
                    ? t('canvas.statusConnected')
                    : t('canvas.statusWaiting')}
      </span>
      {currentWorkspace ? <span className="status-path">{currentWorkspace.directory}</span> : null}
    </footer>
  )
}
