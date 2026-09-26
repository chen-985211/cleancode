import { useRef, useState } from 'react'
import { AnchoredSurfaceMotion } from '../../../../presentation/shared/components/SurfaceMotion'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { GitBranchIcon } from '@phosphor-icons/react/dist/csr/GitBranch'
import type {
  ProjectIssueSnapshot,
  StartIssueWorkspaceCommand
} from '../../application/dto/ProjectIssues'
import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'
import { useI18n } from '../../../../presentation/i18n/useI18n'

export function ProjectIssueDetails({
  issue,
  detail,
  loading,
  defaultBranch,
  workspace,
  busy,
  onStart,
  onOpenWorkspace
}: {
  readonly issue: ProjectIssueSnapshot
  readonly detail?: ProjectIssueSnapshot
  readonly loading: boolean
  readonly defaultBranch: string
  readonly workspace?: ProjectSnapshot['workspaces'][number]
  readonly busy: boolean
  readonly onStart: (command: Pick<StartIssueWorkspaceCommand, 'branchName' | 'baseBranch'>) => void
  readonly onOpenWorkspace: (id: string) => void
}) {
  const { t } = useI18n()
  const [preparing, setPreparing] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  function dismiss(restoreFocus: boolean) {
    if (busy) return
    setPreparing(false)
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }
  useOutsidePointerDismiss({
    active: preparing && !busy,
    pointerPolicy: 'passthrough',
    isInside: (target) =>
      Boolean(popupRef.current?.contains(target) || triggerRef.current?.contains(target)),
    onDismiss: () => dismiss(false)
  })
  const [branchName, setBranchName] = useState(() => {
    const slug = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
      .replace(/-$/, '')
    return `issue/${issue.number}${slug ? `-${slug}` : ''}`
  })
  const [baseBranch, setBaseBranch] = useState(defaultBranch)
  const current = detail ?? issue
  return (
    <section className="project-issues__detail" aria-label={t('issues.details')}>
      <div className="project-issues__detail-kicker">
        <span className="project-issues__status">
          {t(current.state === 'OPEN' ? 'issues.openState' : 'issues.closedState')}
        </span>
        <span className="project-issues__muted">#{issue.number}</span>
      </div>
      <div className="project-issues__detail-heading">
        <h2 className="project-issues__title">{current.title}</h2>
        <div className="project-issues__detail-actions">
          <a
            className="icon-button"
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            aria-label={t('issues.viewGitHub')}
            title={t('issues.viewGitHub')}
          >
            <ArrowSquareOutIcon size={17} />
          </a>
          <button
            ref={triggerRef}
            aria-expanded={workspace ? undefined : preparing}
            aria-haspopup={workspace ? undefined : 'dialog'}
            className="toolbar-button toolbar-button--primary"
            type="button"
            disabled={busy}
            onClick={() =>
              workspace
                ? onOpenWorkspace(workspace.workspaceId)
                : preparing
                  ? dismiss(true)
                  : setPreparing(true)
            }
          >
            <GitBranchIcon size={15} aria-hidden="true" />
            {t(workspace ? 'issues.openWorkspace' : 'issues.start')}
          </button>
          <AnchoredSurfaceMotion
            ref={popupRef}
            open={preparing && !workspace}
            springPreset="directional-menu"
            className="project-issues__start-popover anchored-surface-motion directional-menu-surface"
            data-side="bottom"
            role="dialog"
            aria-label={t('issues.start')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                dismiss(true)
              }
            }}
          >
            <form
              className="project-issues__start"
              onSubmit={(event) => {
                event.preventDefault()
                onStart({ branchName, baseBranch })
              }}
            >
              <label>
                {t('branchWorkspace.branchName')}
                <input
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <label>
                {t('issues.baseBranch')}
                <input
                  value={baseBranch}
                  onChange={(event) => setBaseBranch(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <div className="project-issues__start-actions">
                <button
                  className="toolbar-button"
                  type="button"
                  disabled={busy}
                  onClick={() => dismiss(true)}
                >
                  {t('issues.cancelStart')}
                </button>
                <button
                  className="toolbar-button toolbar-button--primary"
                  type="submit"
                  disabled={busy || !branchName.trim() || !baseBranch.trim()}
                >
                  {t(busy ? 'issues.creating' : 'issues.confirmStart')}
                </button>
              </div>
            </form>
          </AnchoredSurfaceMotion>
        </div>
      </div>
      <div className="project-issues__metadata">
        {current.labels.map((label) => (
          <span key={label} className="project-issues__label">
            {label}
          </span>
        ))}
        {current.assignees.map((login) => (
          <span key={login}>@{login}</span>
        ))}
        {workspace ? (
          <span className="project-issues__workspace">
            <GitBranchIcon size={14} />
            {workspace.displayName}
          </span>
        ) : null}
      </div>
      <div className="project-issues__body" aria-busy={loading}>
        {loading ? (
          t('issues.loading')
        ) : (
          <Markdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            urlTransform={(value) => {
              try {
                const url = new URL(value, issue.url)
                return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
              } catch {
                return ''
              }
            }}
            components={{
              a: ({ href, children }) =>
                href ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ) : (
                  <span>{children}</span>
                ),
              img: ({ src, alt }) => (src ? <img src={src} alt={alt ?? ''} loading="lazy" /> : null)
            }}
          >
            {current.body || t('issues.noDescription')}
          </Markdown>
        )}
      </div>
    </section>
  )
}
