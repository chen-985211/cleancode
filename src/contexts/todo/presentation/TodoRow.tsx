import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { TooltipLabel } from '../../../presentation/shared/components/Tooltip'
import { WorkbenchIcon } from '../../../presentation/shared/components/WorkbenchIcons'
import { ContextMenu } from 'radix-ui'
import { useI18n } from '../../../presentation/i18n/useI18n'
import { todoStates, type TodoDraft, type TodoState } from '../domain/ProjectTodoList'
import { TodoAttachments } from './TodoAttachments'
import type { TodoSession } from './TodoSession'
import { classifyTodoPaste } from './todoPaste'

export function TodoRow({
  editing,
  expanded,
  onExpand,
  onEdit,
  onStatus,
  item,
  session,
  onFinish,
  onNext
}: {
  editing: boolean
  expanded: boolean
  onExpand: () => void
  onEdit: () => void
  onStatus: (status: TodoState) => void
  item: TodoDraft
  session: TodoSession
  onFinish: () => void
  onNext: () => void
}) {
  const { t } = useI18n()
  const title = useRef<HTMLTextAreaElement>(null)
  const [pasteError, setPasteError] = useState(false)
  useEffect(() => {
    if (!editing) return
    title.current?.focus()
    const end = title.current?.value.length ?? 0
    title.current?.setSelectionRange(end, end)
  }, [item.id, editing])
  const removed = useRef(false)
  function paste(
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: 'text' | 'note'
  ) {
    const data = event.clipboardData
    const files = Array.from(data.files).filter((file) => file.type.startsWith('image/'))
    const anchors: string[] = []
    const html = data.getData('text/html')
    if (html) {
      const template = document.createElement('template')
      template.innerHTML = html
      template.content
        .querySelectorAll('a[href]')
        .forEach((a) => anchors.push(a.getAttribute('href')!))
    }
    const { links, text } = classifyTodoPaste(
      data.getData('text/plain'),
      data.getData('text/uri-list'),
      anchors
    )
    if (!links.length && !files.length && !(field === 'text' && /[\r\n]/.test(text))) return
    event.preventDefault()
    const control = event.currentTarget
    const start = control.selectionStart ?? control.value.length
    const end = control.selectionEnd ?? start
    const next = { ...item, links: [...new Set([...item.links, ...links])] }
    if (text) {
      const combined = control.value.slice(0, start) + text + control.value.slice(end)
      if (field === 'text') {
        const [first, ...lines] = combined.replace(/\r\n?/g, '\n').split('\n')
        next.text = first
        next.note = [lines.join('\n'), next.note].filter(Boolean).join('\n')
      } else next.note = combined
      requestAnimationFrame(() =>
        control.setSelectionRange(start + text.length, start + text.length)
      )
    }
    session.change(next)
    const savedAtPaste = Boolean(session.find(item.id))
    if (files.length) {
      setPasteError(false)
      void Promise.all(files.map(readImage))
        .then((images) => {
          const live = session.find(item.id)
          if (removed.current || (savedAtPaste && !live)) return
          const current = live ?? next
          session.change(
            { ...current, images: [...current.images, ...images.map((image) => image.id)] },
            images
          )
        })
        .catch(() => setPasteError(true))
    }
  }
  function remove() {
    removed.current = true
    session.change({ ...item, text: '', note: '', links: [], images: [] })
    onFinish()
  }
  const gestureHint = t(expanded ? 'todo.collapseGesture' : 'todo.itemGesture')
  const saved = 'createdAt' in item
  const caption = item.text.trim() || item.note.trim().split('\n')[0]
  const name = caption || (item.links[0] && new URL(item.links[0]).host) || t('todo.image')
  const next = todoStates[(todoStates.indexOf(item.status) + 1) % todoStates.length]
  const dot = (
    <span aria-hidden="true" className={'todo-dot todo-dot--' + item.status}>
      {item.status === 'done' ? '✓' : ''}
    </span>
  )
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild disabled={!saved}>
        <div
          className={expanded ? 'todo-row todo-expanded' : 'todo-row'}
          data-todo-position={item.id}
          onClick={(e) => {
            if (editing || !isRowSurface(e.target)) return
            if (expanded) onFinish()
            else onExpand()
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
            if (e.key === 'F10' && e.shiftKey && saved) {
              e.preventDefault()
              const bounds = e.currentTarget.getBoundingClientRect()
              e.currentTarget.dispatchEvent(
                new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  clientX: bounds.left + 20,
                  clientY: bounds.bottom
                })
              )
              return
            }
            if (e.key === 'F2' && !editing && isRowSurface(e.target)) {
              e.preventDefault()
              onEdit()
              return
            }
            if (expanded && e.key === 'Escape') {
              e.stopPropagation()
              onFinish()
            }
            if (
              editing &&
              e.key === 'Enter' &&
              (e.target === title.current || e.metaKey || e.ctrlKey)
            ) {
              e.preventDefault()
              onNext()
            }
          }}
        >
          {saved ? (
            <button
              type="button"
              className="todo-status"
              data-todo-status={item.id}
              aria-label={t('todo.changeState', {
                name,
                from: t(`todo.${item.status}`),
                to: t(`todo.${next}`)
              })}
              onClick={() => onStatus(next)}
            >
              {dot}
            </button>
          ) : (
            <span className="todo-status">{dot}</span>
          )}
          <div className="todo-fields">
            {editing ? (
              <textarea
                rows={1}
                className="todo-edit-title"
                ref={title}
                aria-label={t('todo.content')}
                aria-description={t('todo.pasteHint')}
                placeholder={saved ? name : t('todo.quick')}
                value={item.text}
                onContextMenu={(e) => e.stopPropagation()}
                onPaste={(e) => paste(e, 'text')}
                onChange={(e) => session.change({ ...item, text: e.target.value })}
              />
            ) : (
              <div className="todo-heading">
                <TooltipLabel content={gestureHint}>
                  <button
                    type="button"
                    className="todo-title"
                    aria-keyshortcuts="F2"
                    aria-description={gestureHint}
                    aria-expanded={expanded}
                    aria-controls={'todo-details-' + item.id}
                    data-todo-edit={item.id}
                  >
                    <span className="todo-caption">{name}</span>
                  </button>
                </TooltipLabel>
                <TooltipLabel content={t('todo.edit', { name })}>
                  <button
                    type="button"
                    className="todo-edit-action"
                    aria-label={t('todo.edit', { name })}
                    onClick={onEdit}
                  >
                    <WorkbenchIcon role="edit" size={14} aria-hidden="true" />
                  </button>
                </TooltipLabel>
              </div>
            )}
            <div
              id={'todo-details-' + item.id}
              className="todo-detail"
              inert={!expanded}
              aria-hidden={!expanded}
            >
              <div className="todo-detail-clip">
                {editing ? (
                  <textarea
                    rows={1}
                    aria-label={t('todo.note')}
                    placeholder={t('todo.note')}
                    value={item.note}
                    onContextMenu={(e) => e.stopPropagation()}
                    onPaste={(e) => paste(e, 'note')}
                    onChange={(e) => session.change({ ...item, note: e.target.value })}
                  />
                ) : (
                  item.note && <p className="todo-note">{item.note}</p>
                )}
                <TodoAttachments
                  item={item}
                  session={session}
                  expanded={expanded}
                  onChange={editing ? (next) => session.change(next) : undefined}
                />
                {editing && pasteError && <span role="alert">{t('todo.pasteFailed')}</span>}
              </div>
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="todo-item-menu"
          collisionPadding={8}
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <ContextMenu.Item onSelect={remove}>{t('todo.remove')}</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function isRowSurface(target: EventTarget) {
  return (
    target instanceof Element && !target.closest('textarea, button:not(.todo-title), [role="menu"]')
  )
}

function readImage(file: File): Promise<{ id: string; data: string }> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(?:png|jpeg|webp|gif|avif|bmp)$/i.test(file.type)) {
      reject(new Error('Unsupported clipboard image.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve({ id: crypto.randomUUID(), data: String(reader.result) })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
