import { useEffect, useState } from 'react'
import { useI18n } from '../../../presentation/i18n/useI18n'
import type { TodoDraft } from '../domain/ProjectTodoList'
import type { TodoSession } from './TodoSession'
export function TodoAttachments({
  item,
  session,
  onChange
}: {
  item: TodoDraft
  session: TodoSession
  onChange: (item: TodoDraft) => void
}) {
  const { t } = useI18n()
  return (
    <div className="todo-attachments">
      {item.images.map((id) => (
        <div className="todo-attachment" key={id}>
          <Thumbnail session={session} id={id} />
          <button
            type="button"
            aria-label={t('todo.removeImage')}
            onClick={() => onChange({ ...item, images: item.images.filter((v) => v !== id) })}
          >
            ×
          </button>
        </div>
      ))}
      {item.links.map((link) => (
        <div className="todo-attachment" key={link}>
          <a href={link} target="_blank" rel="noreferrer">
            {link.replace(/^https?:\/\//i, '')}
          </a>
          <button
            type="button"
            aria-label={t('todo.removeLink')}
            onClick={() => onChange({ ...item, links: item.links.filter((v) => v !== link) })}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
function Thumbnail({ id, session }: { id: string; session: TodoSession }) {
  const { t } = useI18n()
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    void session.image(id).then(
      (data) => {
        if (current) setSrc(data)
      },
      () => {
        if (current) setFailed(true)
      }
    )
    return () => {
      current = false
    }
  }, [id, session])
  if (failed) return <span role="status">{t('todo.imageUnavailable')}</span>
  return src ? <img src={src} alt={t('todo.image')} onError={() => setFailed(true)} /> : null
}
