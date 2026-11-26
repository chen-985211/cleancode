import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { Dialog, VisuallyHidden } from 'radix-ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../presentation/i18n/useI18n'
import type { TodoSession } from './TodoSession'

export function TodoImageGallery({
  ids,
  session,
  expanded,
  onRemove
}: {
  ids: string[]
  session: TodoSession
  expanded: boolean
  onRemove?: (id: string) => void
}) {
  const { t } = useI18n()
  const [activeId, setActiveId] = useState<string | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const [sources, setSources] = useState<Record<string, string | null>>({})
  const requests = useRef(new Map<string, Promise<string>>())

  // Thumbnails and the dialog share one read, including when navigation reaches an offscreen image.
  const load = useCallback(
    (id: string) => {
      if (requests.current.has(id)) return
      const request = session.image(id)
      requests.current.set(id, request)
      function finish(src: string | null) {
        if (requests.current.get(id) !== request) return
        setSources((current) => ({ ...current, [id]: src }))
        if (src === null) requests.current.delete(id)
      }
      void request.then(finish, () => finish(null))
    },
    [session]
  )

  const release = useCallback((id: string) => {
    requests.current.delete(id)
    setSources((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])
  function imageFailed(id: string) {
    requests.current.delete(id)
    setSources((current) => ({ ...current, [id]: null }))
  }
  const index = activeId === null ? -1 : ids.indexOf(activeId)
  const multiple = ids.length > 1
  const source = activeId === null ? undefined : sources[activeId]

  function move(step: number) {
    if (!multiple || index < 0) return
    const id = ids[(index + step + ids.length) % ids.length]!
    load(id)
    setActiveId(id)
  }
  return (
    <Dialog.Root
      open={expanded && index >= 0}
      onOpenChange={(open) => {
        if (!open) setActiveId(null)
      }}
    >
      {ids.map((id, position) => (
        <div className="todo-image-preview" key={id}>
          <Thumbnail
            id={id}
            source={sources[id]}
            description={
              multiple
                ? t('todo.imagePosition', { current: position + 1, total: ids.length })
                : undefined
            }
            expanded={expanded}
            load={load}
            release={release}
            onError={() => imageFailed(id)}
            onOpen={(button) => {
              opener.current = button
              setActiveId(id)
            }}
          />
          {onRemove && (
            <button
              className="todo-asset-remove"
              type="button"
              aria-label={t('todo.removeImage')}
              onClick={() => onRemove(id)}
            >
              <XIcon aria-hidden="true" size={12} />
            </button>
          )}
        </div>
      ))}
      <Dialog.Portal>
        <Dialog.Overlay className="todo-image-backdrop" />
        <Dialog.Content
          className="todo-image-dialog"
          data-multiple={multiple || undefined}
          aria-modal="true"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            opener.current?.focus({ preventScroll: true })
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (multiple && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
              event.preventDefault()
              move(event.key === 'ArrowLeft' ? -1 : 1)
            }
          }}
          onContextMenu={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            if (event.target === event.currentTarget) setActiveId(null)
          }}
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>{t('todo.imagePreview')}</Dialog.Title>
          </VisuallyHidden.Root>
          {source ? (
            <img
              key={activeId}
              src={source}
              alt={t('todo.image')}
              onError={() => {
                if (activeId) imageFailed(activeId)
              }}
            />
          ) : (
            <span role="status">
              {t(source === null ? 'todo.imageUnavailable' : 'todo.loadingImage')}
            </span>
          )}
          <Dialog.Close className="todo-image-dialog-close" aria-label={t('todo.closePreview')}>
            <XIcon size={18} aria-hidden="true" />
          </Dialog.Close>
          {multiple && (
            <>
              <button
                type="button"
                className="todo-image-previous"
                aria-label={t('todo.previousImage')}
                onClick={() => move(-1)}
              >
                <CaretLeftIcon size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="todo-image-next"
                aria-label={t('todo.nextImage')}
                onClick={() => move(1)}
              >
                <CaretRightIcon size={20} aria-hidden="true" />
              </button>
              <span className="todo-image-position" role="status">
                {t('todo.imagePosition', { current: index + 1, total: ids.length })}
              </span>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Thumbnail({
  id,
  source,
  description,
  expanded,
  load,
  release,
  onOpen,
  onError
}: {
  id: string
  source: string | null | undefined
  description?: string
  expanded: boolean
  load: (id: string) => void
  release: (id: string) => void
  onError: () => void
  onOpen: (button: HTMLButtonElement) => void
}) {
  const { t } = useI18n()
  const frame = useRef<HTMLSpanElement>(null)
  useEffect(() => () => release(id), [id, release])
  useEffect(() => {
    if (!expanded) return
    let observing = true
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (observing && entry.isIntersecting) {
          observing = false
          observer.disconnect()
          load(id)
        }
      },
      { rootMargin: '120px' }
    )
    observer.observe(frame.current!)
    return () => {
      observing = false
      observer.disconnect()
    }
  }, [id, expanded, load])
  return (
    <span className="todo-thumbnail" ref={frame}>
      {source === null ? (
        <span role="status">{t('todo.imageUnavailable')}</span>
      ) : (
        source && (
          <button
            type="button"
            aria-haspopup="dialog"
            className="todo-thumbnail-trigger"
            aria-label={t('todo.enlargeImage')}
            aria-description={description}
            onClick={(event) => onOpen(event.currentTarget)}
          >
            <img src={source} alt={t('todo.image')} onError={onError} />
          </button>
        )
      )}
    </span>
  )
}
