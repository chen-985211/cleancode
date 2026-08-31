import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent
} from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import { TerminalThemeProjection } from '../../contexts/run/presentation/components/TerminalThemeProjection'
import {
  TerminalPasteController,
  analyzeTerminalPaste,
  quoteTerminalFilePaths,
  type TerminalPasteState
} from '../../contexts/run/presentation/terminal-surface/terminalPaste'
import { bindTerminalSurfaceAttachmentIdentity } from '../../contexts/run/presentation/terminal-surface/terminalSurfaceAttachmentIdentity'
import {
  createTerminalSurfaceKey,
  type TerminalSearchResults,
  type TerminalSurface
} from '../../contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import { readTerminalSourceTheme } from '../../contexts/run/presentation/terminal-surface/terminalTheme'
import {
  attachTerminalViewWithRetry,
  restoreTerminalViewWithRetry
} from '../../contexts/run/presentation/terminal-surface/terminalViewAttachment'
import { createTerminalXtermSurface } from '../../contexts/run/presentation/terminal-surface/terminalXtermSurface'
import { useTerminalSurfaceRegistry } from '../../contexts/run/presentation/terminal-surface/useTerminalSurfaceRegistry'
import { appendTerminalOutputTail } from './terminalOutputTail'
import type { TerminalDimensions, TerminalRunIdentity, TerminalViewState } from './types'
import { useI18n } from '../i18n/useI18n'
import { WorkbenchIcon } from './WorkbenchIcons'

interface TerminalViewportProps {
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly focusRequestId: number
  readonly isResizeSuspended?: boolean
  readonly isInputDisabled?: boolean
  readonly onViewIdentityStale?: (identity: TerminalRunIdentity) => void
  readonly onRestart: () => void
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onPaste?: (block: TerminalBlockSnapshot, input: string) => Promise<void>
}

type PendingPasteConfirmation =
  | { readonly kind: 'controls'; readonly text: string }
  | { readonly kind: 'files'; readonly text: string; readonly fileCount: number }

type PasteNotice = 'cancelled' | 'failed' | 'imageUnsupported' | 'pathUnavailable' | 'tooLarge'

const pasteNoticeMessages = {
  cancelled: 'terminal.paste.cancelled',
  failed: 'terminal.paste.failed',
  imageUnsupported: 'terminal.paste.imageUnsupported',
  pathUnavailable: 'terminal.paste.pathUnavailable',
  tooLarge: 'terminal.paste.tooLarge'
} as const

export function TerminalViewport({
  block,
  session,
  focusRequestId,
  isResizeSuspended = false,
  isInputDisabled = false,
  onViewIdentityStale = () => undefined,
  onRestart,
  onDimensionsChange,
  onInput,
  onPaste = async () => undefined
}: TerminalViewportProps) {
  const { t } = useI18n()
  const surfaceRegistry = useTerminalSurfaceRegistry()
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const outputTailElementRef = useRef<HTMLPreElement | null>(null)
  const surfaceRef = useRef<TerminalSurface | null>(null)
  const requestRestoreRef = useRef<() => void>(() => undefined)
  const outputTailRef = useRef(appendTerminalOutputTail('', session.output))
  const blockRef = useRef(block)
  const runIdentityRef = useRef(session.runIdentity ?? null)
  const onDimensionsChangeRef = useRef(onDimensionsChange)
  const onViewIdentityStaleRef = useRef(onViewIdentityStale)
  const onInputRef = useRef(onInput)
  const onPasteRef = useRef(onPaste)
  const isResizeSuspendedRef = useRef(isResizeSuspended)
  const isInputDisabledRef = useRef(isInputDisabled)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [hasLinkError, setHasLinkError] = useState(false)
  const [pasteState, setPasteState] = useState<TerminalPasteState>({ status: 'idle' })
  const [pendingPaste, setPendingPaste] = useState<PendingPasteConfirmation | null>(null)
  const [pasteNotice, setPasteNotice] = useState<PasteNotice | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TerminalSearchResults>({
    resultCount: 0,
    resultIndex: 0
  })
  const [restoreStatus, setRestoreStatus] = useState<'failed' | 'ready' | 'restoring'>('restoring')
  const terminalSourceTheme = session.terminalSourceTheme ?? readTerminalSourceTheme()
  const attachedSessionId = session.sessionId
  const surfaceIdentityKey = session.runIdentity
    ? createTerminalSurfaceKey(session.runIdentity)
    : null

  useLayoutEffect(() => {
    blockRef.current = block
    runIdentityRef.current = session.runIdentity ?? null
    onInputRef.current = onInput
    onPasteRef.current = onPaste
    onDimensionsChangeRef.current = onDimensionsChange
    onViewIdentityStaleRef.current = onViewIdentityStale
    isResizeSuspendedRef.current = isResizeSuspended
    isInputDisabledRef.current = isInputDisabled
  }, [
    block,
    isInputDisabled,
    isResizeSuspended,
    onDimensionsChange,
    onInput,
    onPaste,
    onViewIdentityStale,
    session
  ])

  const pasteControllerRef = useRef<TerminalPasteController | null>(null)
  useEffect(() => {
    const controller = new TerminalPasteController({
      write: (chunk) =>
        isInputDisabledRef.current
          ? Promise.resolve()
          : onPasteRef.current(blockRef.current, chunk),
      onStateChange: (state) => {
        setPasteState(state)
        if (state.status === 'cancelled') setPasteNotice('cancelled')
        if (state.status === 'failed') setPasteNotice('failed')
      }
    })
    pasteControllerRef.current = controller
    return () => {
      controller.cancel()
      pasteControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    outputTailRef.current = appendTerminalOutputTail('', session.output)

    if (outputTailElementRef.current) {
      outputTailElementRef.current.textContent = outputTailRef.current
    }
  }, [session.output])

  useEffect(() => surfaceRef.current?.setResizeSuspended(isResizeSuspended), [isResizeSuspended])

  useEffect(() => {
    if (outputTailElementRef.current) {
      outputTailElementRef.current.textContent = outputTailRef.current
    }
  })

  const focusTerminal = useCallback(() => {
    surfaceRef.current?.focus()
  }, [])
  const openSearch = useCallback(() => setIsSearchOpen(true), [])
  const closeSearch = useCallback(() => {
    surfaceRef.current?.clearSearch()
    setIsSearchOpen(false)
    focusTerminal()
  }, [focusTerminal])

  useEffect(() => {
    if (!isSearchOpen) return
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [isSearchOpen])

  const changeSearchQuery = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value
    setSearchQuery(query)
    surfaceRef.current?.find(query, 'incremental')
  }, [])

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSearch()
        return
      }
      if (event.key !== 'Enter') return
      event.preventDefault()
      surfaceRef.current?.find(searchQuery, event.shiftKey ? 'previous' : 'next')
    },
    [closeSearch, searchQuery]
  )

  const startPaste = useCallback((text: string) => {
    setPendingPaste(null)
    setPasteNotice(null)
    void pasteControllerRef.current
      ?.paste(text, {
        bracketedPasteMode: surfaceRef.current?.isBracketedPasteMode() ?? false
      })
      .catch(() => setPasteNotice('failed'))
  }, [])

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (isInputDisabled) return
      const files = Array.from(event.clipboardData.files)
      if (files.some((file) => file.type.startsWith('image/'))) {
        setPasteNotice('imageUnsupported')
        return
      }
      if (files.length > 0) {
        const paths = files.flatMap((file) => {
          try {
            const path = window.cleancode?.getPathForFile?.(file)
            return path ? [path] : []
          } catch {
            return []
          }
        })
        if (paths.length !== files.length) {
          setPasteNotice('pathUnavailable')
          return
        }
        setPasteNotice(null)
        setPendingPaste({
          kind: 'files',
          text: quoteTerminalFilePaths(paths),
          fileCount: paths.length
        })
        return
      }

      const text = event.clipboardData.getData('text/plain')
      if (!text) return
      const analysis = analyzeTerminalPaste(text)
      if (!analysis.accepted) {
        setPasteNotice('tooLarge')
        return
      }
      if (analysis.highRisk) {
        setPasteNotice(null)
        setPendingPaste({ kind: 'controls', text })
        return
      }
      startPaste(text)
    },
    [isInputDisabled, startPaste]
  )

  const focusTerminalFromViewportFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (event.target === terminalElementRef.current) {
        focusTerminal()
      }
    },
    [focusTerminal]
  )

  useEffect(() => {
    if (isTestRuntime() || !terminalElementRef.current) {
      return undefined
    }

    const element = terminalElementRef.current
    const runIdentity = runIdentityRef.current
    const createSurface = () => createTerminalXtermSurface(terminalSourceTheme)
    const lease =
      runIdentity && surfaceRegistry ? surfaceRegistry.create(runIdentity, createSurface) : null
    const surface = lease?.surface ?? createSurface()
    const api = window.cleancode
    let isReleased = false
    let restoreTail = Promise.resolve()

    surfaceRef.current = surface
    surface.attach({
      element,
      isResizeSuspended: isResizeSuspendedRef.current,
      onDimensionsChange: (dimensions) => onDimensionsChangeRef.current(dimensions),
      onInput: (input) => {
        if (!isInputDisabledRef.current) onInputRef.current(blockRef.current, input)
      },
      onOpenLink: (rawTarget) => {
        setHasLinkError(false)
        if (!runIdentity || !lease || !api?.openTerminalLink) return
        void api
          .openTerminalLink({ ...runIdentity, viewId: lease.viewId, rawTarget })
          .catch(() => setHasLinkError(true))
      },
      onOpenSearch: openSearch,
      onRestoreRequired: () => requestRestore(),
      onSearchResultsChange: setSearchResults
    })
    const releaseAttachmentIdentity = bindTerminalSurfaceAttachmentIdentity(
      element,
      attachedSessionId
    )

    const requestRestore = (): void => {
      setRestoreStatus('restoring')
      restoreTail = restoreTail
        .catch(() => undefined)
        .then(async () => {
          if (isReleased) return
          try {
            const result = await restoreTerminalViewWithRetry({
              isCancelled: () => isReleased,
              loadSnapshot: async () => {
                const snapshot =
                  runIdentity && lease && api?.attachTerminalView
                    ? await attachTerminalViewWithRetry({
                        attach: () =>
                          api.attachTerminalView!({ ...runIdentity, viewId: lease.viewId }),
                        isCancelled: () => isReleased,
                        onStale: () => onViewIdentityStaleRef.current(runIdentity)
                      })
                    : createFallbackSnapshot(runIdentity, outputTailRef.current)

                if (
                  snapshot &&
                  lease &&
                  api?.attachTerminalView &&
                  snapshot.restoreMarker.viewId !== lease.viewId
                ) {
                  return null
                }
                return snapshot
              },
              restore: async (snapshot) => {
                const restoreResult = await surface.restore(snapshot)
                if (isReleased) return restoreResult
                outputTailRef.current = appendTerminalOutputTail(
                  '',
                  outputTailRef.current || snapshot.transcript
                )
                if (outputTailElementRef.current) {
                  outputTailElementRef.current.textContent = outputTailRef.current
                }
                return restoreResult
              }
            })
            if (!isReleased) setRestoreStatus(result === 'ready' ? 'ready' : 'failed')
          } catch {
            if (!isReleased) setRestoreStatus('failed')
          }
        })
      void restoreTail.catch(() => undefined)
    }

    requestRestoreRef.current = requestRestore
    requestRestore()

    return () => {
      isReleased = true
      if (requestRestoreRef.current === requestRestore) {
        requestRestoreRef.current = () => undefined
      }
      releaseAttachmentIdentity()
      surface.detach(element)
      if (runIdentity && lease && api?.detachTerminalView) {
        void api
          .detachTerminalView({ ...runIdentity, viewId: lease.viewId })
          .catch(() => undefined)
          .finally(() => surfaceRegistry?.release(lease.viewId))
      } else if (lease) surfaceRegistry?.release(lease.viewId)
      else surface.dispose()
      if (surfaceRef.current === surface) {
        surfaceRef.current = null
      }
    }
  }, [attachedSessionId, openSearch, surfaceIdentityKey, surfaceRegistry, terminalSourceTheme])

  useEffect(() => {
    if (focusRequestId > 0) {
      focusTerminal()
    }
  }, [focusRequestId, focusTerminal])

  if (isTestRuntime()) {
    return (
      <pre
        className="terminal-fallback"
        ref={outputTailElementRef}
        aria-label={t('terminal.output', { blockName: block.name })}
        data-terminal-session-id={session.sessionId ?? ''}
      />
    )
  }

  return (
    <div
      className="terminal-output-shell nodrag nopan nowheel"
      onPointerDownCapture={focusTerminal}
      onPasteCapture={handlePaste}
    >
      {isSearchOpen ? (
        <div
          className="terminal-search"
          role="group"
          aria-label={t('terminal.search.controls')}
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            aria-label={t('terminal.search.input')}
            placeholder={t('terminal.search.placeholder')}
            onChange={changeSearchQuery}
            onKeyDown={handleSearchKeyDown}
          />
          <span className="terminal-search__results" aria-live="polite">
            {searchResults.resultCount > 0 ? searchResults.resultIndex + 1 : 0} /{' '}
            {searchResults.resultCount}
          </span>
          <button
            type="button"
            aria-label={t('terminal.search.previous')}
            onClick={() => surfaceRef.current?.find(searchQuery, 'previous')}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={t('terminal.search.next')}
            onClick={() => surfaceRef.current?.find(searchQuery, 'next')}
          >
            ↓
          </button>
          <button type="button" aria-label={t('terminal.search.close')} onClick={closeSearch}>
            ×
          </button>
        </div>
      ) : null}
      {hasLinkError ? (
        <div className="terminal-link-feedback" role="status">
          {t('terminal.link.openFailed')}
        </div>
      ) : null}
      {restoreStatus === 'failed' ? (
        <div role="alert">
          <button
            className="terminal-restore-failure"
            type="button"
            aria-label={t('terminal.action.restartEmpty')}
            title={t('terminal.action.restartEmptyDescription')}
            onClick={onRestart}
          >
            <span className="terminal-restore-failure__copy">
              {t('terminal.view.restoreFailed')}
            </span>
            <span className="terminal-restore-failure__icon" aria-hidden="true">
              <WorkbenchIcon role="restart" size={14} />
            </span>
          </button>
        </div>
      ) : null}
      {pendingPaste ? (
        <div
          className="terminal-paste-confirmation"
          role="alertdialog"
          aria-label={t('terminal.paste.confirmTitle')}
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <p>
            {pendingPaste.kind === 'files'
              ? t('terminal.paste.confirmFiles', { count: pendingPaste.fileCount })
              : t('terminal.paste.confirmControls')}
          </p>
          <div>
            <button type="button" onClick={() => setPendingPaste(null)}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => startPaste(pendingPaste.text)}>
              {t('terminal.paste.confirmAction')}
            </button>
          </div>
        </div>
      ) : null}
      {pasteState.status === 'pasting' ? (
        <div
          className="terminal-paste-progress"
          role="status"
          onPointerDownCapture={(event) => event.stopPropagation()}
        >
          <span>
            {t('terminal.paste.progress', {
              completed: pasteState.completedBytes,
              total: pasteState.totalBytes
            })}
          </span>
          <button type="button" onClick={() => pasteControllerRef.current?.cancel()}>
            {t('common.cancel')}
          </button>
        </div>
      ) : null}
      {pasteNotice ? (
        <div className="terminal-paste-notice" role="status">
          {t(pasteNoticeMessages[pasteNotice])}
        </div>
      ) : null}
      <TerminalThemeProjection sourceTheme={terminalSourceTheme}>
        <div
          className="terminal-viewport nodrag nopan nowheel"
          ref={terminalElementRef}
          tabIndex={0}
          onFocus={focusTerminalFromViewportFocus}
        />
      </TerminalThemeProjection>
      <pre
        className="terminal-output-tail"
        ref={outputTailElementRef}
        aria-label={t('terminal.output', { blockName: block.name })}
        data-terminal-output-tail="true"
        data-terminal-session-id={session.sessionId ?? ''}
      />
    </div>
  )
}

function isTestRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
}

function createFallbackSnapshot(
  identity: NonNullable<TerminalViewState['runIdentity']> | null,
  output: string
): TerminalSnapshot {
  return {
    identity: identity
      ? {
          ...identity,
          projectDirectory: '',
          workspaceDirectory: '',
          gitBranch: null
        }
      : ({
          projectId: '',
          projectDirectory: '',
          workspaceId: '',
          workspaceDirectory: '',
          gitBranch: null,
          blockId: '',
          sessionId: '',
          runId: '',
          generation: 0
        } satisfies TerminalSnapshot['identity']),
    sequence: 0,
    scrollbackRows: 1000,
    unicodeVersion: '11',
    restoreMarker: { viewId: '', sequence: 0 },
    content: output,
    transcript: output,
    dimensions: { columns: 80, rows: 24 },
    title: '',
    workingDirectory: '',
    terminalSourceTheme: 'dark',
    modes: {
      applicationCursorKeysMode: false,
      applicationKeypadMode: false,
      bracketedPasteMode: false,
      insertMode: false,
      mouseTrackingMode: 'none',
      originMode: false,
      reverseWraparoundMode: false,
      sendFocusMode: false,
      synchronizedOutputMode: false,
      wraparoundMode: true
    }
  }
}
