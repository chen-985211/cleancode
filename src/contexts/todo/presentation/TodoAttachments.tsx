import { GlobeSimpleIcon } from '@phosphor-icons/react/dist/csr/GlobeSimple'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { TodoImageGallery } from './TodoImageGallery'
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
      {item.images.length > 0 && (
        <TodoImageGallery
          ids={item.images}
          session={session}
          expanded={expanded}
          onRemove={
            onChange && ((id) => onChange({ ...item, images: item.images.filter((v) => v !== id) }))
          }
        />
      )}
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
                <XIcon aria-hidden="true" size={12} />
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
      {isGitHub ? <GitHubMarkIcon size={14} /> : (initial ?? <GlobeSimpleIcon size={13} />)}
    </span>
  )
}
