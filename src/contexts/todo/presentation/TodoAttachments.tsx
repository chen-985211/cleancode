import { GlobeSimple, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../presentation/i18n/useI18n'
import { GitHubMarkIcon } from '../../../presentation/shared/components/GitHubMarkIcon'
import type { TodoDraft } from '../domain/ProjectTodoList'
import type { TodoSession } from './TodoSession'

export function TodoAttachments({
  item,
  session,
  expanded,
  onChange
}: {
  item: TodoDraft
  session: TodoSession
  expanded: boolean
  onChange?: (item: TodoDraft) => void
}) {
  const { t } = useI18n()
  if (!item.images.length && !item.links.length) return null

  return (
    <div className="todo-attachments">
      {item.images.map((id) => (
        <div className="todo-image-preview" key={id}>
          <Thumbnail session={session} id={id} expanded={expanded} />
          {onChange && (
            <button
              className="todo-asset-remove"
              type="button"
              aria-label={t('todo.removeImage')}
              onClick={() => onChange({ ...item, images: item.images.filter((v) => v !== id) })}
            >
              <X aria-hidden="true" size={12} />
            </button>
          )}
        </div>
      ))}
      {item.links.map((link) => {
        const url = new URL(link)
        return (
          <div className="todo-link-row" key={link}>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              aria-label={link}
              title={link}
              onClick={(event) => event.stopPropagation()}
            >
              <SiteIcon hostname={url.hostname} />
              <span className="todo-link-address">{url.host}</span>
            </a>
            {onChange && (
              <button
                className="todo-asset-remove"
                type="button"
                aria-label={t('todo.removeLink')}
                onClick={() => onChange({ ...item, links: item.links.filter((v) => v !== link) })}
              >
                <X aria-hidden="true" size={12} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SiteIcon({ hostname }: { hostname: string }) {
  const site = hostname.replace(/^www\./, '').replace(/\.$/, '')
  const isGitHub = site === 'github.com' || site.endsWith('.github.com')
  const initial = site.match(/^[a-z]/i)?.[0].toUpperCase()
  return (
    <span className="todo-link-icon" aria-hidden="true">
      {isGitHub ? <GitHubMarkIcon size={14} /> : (initial ?? <GlobeSimple size={13} />)}
    </span>
  )
}

function Thumbnail({
  id,
  session,
  expanded
}: {
  id: string
  session: TodoSession
  expanded: boolean
}) {
  const { t } = useI18n()
  const frame = useRef<HTMLSpanElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!expanded || src) return
    let current = true
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!current || !entry.isIntersecting) return
        observer.disconnect()
        void session.image(id).then(
          (data) => {
            if (current) setSrc(data)
          },
          () => {
            if (current) setFailed(true)
          }
        )
      },
      { rootMargin: '120px' }
    )
    observer.observe(frame.current!)
    return () => {
      current = false
      observer.disconnect()
    }
  }, [id, session, expanded, src])
  return (
    <span className="todo-thumbnail" ref={frame}>
      {failed ? (
        <span role="status">{t('todo.imageUnavailable')}</span>
      ) : (
        src && <img src={src} alt={t('todo.image')} onError={() => setFailed(true)} />
      )}
    </span>
  )
}
