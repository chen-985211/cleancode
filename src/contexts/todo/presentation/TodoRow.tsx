import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent } from 'react'
import { TooltipLabel } from '../../../presentation/shared/components/Tooltip'
import { WorkbenchIcon } from '../../../presentation/shared/components/WorkbenchIcons'
import { ContextMenu } from 'radix-ui'
import { useI18n } from '../../../presentation/i18n/useI18n'
import {
  hasTodoContent,
  todoStates,
  type TodoDraft,
  type TodoState
} from '../domain/ProjectTodoList'
import type { TodoImage } from '../application/ProjectTodos'
import { TodoAttachments } from './TodoAttachments'
import type { TodoSession } from './TodoSession'
import { classifyTodoPaste, numberedTodoLines } from './todoPaste'

export function TodoRow({
  editing,
  expanded,
  onExpand,
  onEdit,
  onStatus,
  item,
  session,
  saved,
  capture,
  onChange,
  onSplit,
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
  saved: boolean
  capture: boolean
  onChange: (item: TodoDraft, images?: TodoImage[]) => void
  onSplit: (lines: string[]) => void
  onFinish: (itemId: string) => void
  onNext: () => void
}) {
  const { t } = useI18n()
  const title = useRef<HTMLTextAreaElement>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [offer, setOffer] = useState<{ id: string; lines: string[] } | null>(null)
  const liveEditor = useRef<TodoDraft | null>(null)
  useLayoutEffect(() => {
    liveEditor.current = editing ? item : null
    return () => {
      liveEditor.current = null
    }
  }, [item, editing])
  function change(next: TodoDraft, images?: TodoImage[]) {
    setOffer(null)
    onChange(next, images)
  }
  useEffect(() => {
    if (!editing) return
    title.current?.focus({ preventScroll: true })
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
      data.getData('text/plain').replace(/\r\n?/g, '\n'),
      data.getData('text/uri-list'),
      anchors
    )
    const control = event.currentTarget
    const splitPastedTitle =
      field === 'text' && !control.value.includes('\n') && text.includes('\n')
    if (!links.length && !files.length && !splitPastedTitle) return
    event.preventDefault()
    const start = control.selectionStart ?? control.value.length
    const end = control.selectionEnd ?? start
    const next = { ...item, links: [...new Set([...item.links, ...links])] }
    if (text) {
      const combined = control.value.slice(0, start) + text + control.value.slice(end)
      if (splitPastedTitle) {
        const [first, ...lines] = combined.split('\n')
        next.text = first
        next.note = [lines.join('\n'), next.note].filter(Boolean).join('\n')
      } else next[field] = combined
      requestAnimationFrame(() =>
        control.setSelectionRange(start + text.length, start + text.length)
      )
    }
    change(next)
    if (capture && field === 'text' && !hasTodoContent(item) && !files.length) {
      const lines = numberedTodoLines(text)
      const referenced = new Set(lines.flatMap((line) => classifyTodoPaste(line, '').links))
      if (lines.length && links.every((link) => referenced.has(link)))
        setOffer({ id: item.id, lines })
    }
    const savedAtPaste = Boolean(session.find(item.id))
    if (files.length) {
      setPasteError(null)
      void Promise.all(files.map(readImage))
        .then((images) => {
          const live = session.find(item.id)
          if (removed.current || (savedAtPaste && !live)) return
          const current = liveEditor.current?.id === item.id ? liveEditor.current : (live ?? next)
          change(
            { ...current, images: [...current.images, ...images.map((image) => image.id)] },
            images
          )
        })
        .catch(() => setPasteError(item.id))
    }
  }
  function remove() {
    removed.current = true
    session.change({ ...item, text: '', note: '', links: [], images: [] })
    onFinish(item.id)
  }
  const gestureHint = t(expanded ? 'todo.collapseGesture' : 'todo.itemGesture')
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
          data-editing={editing || undefined}
          data-todo-position={item.id}
          onClick={(e) => {
            if (editing || !isRowSurface(e.target)) return
            if (expanded) onFinish(item.id)
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
              onFinish(item.id)
            }
            if (
              editing &&
              e.key === 'Enter' &&
              ((e.target === title.current && !e.shiftKey) || e.metaKey || e.ctrlKey)
            ) {
              e.preventDefault()
              if (capture) onNext()
              else onFinish(item.id)
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
            <div className="todo-title-slot">
              <textarea
                rows={1}
                className="todo-edit-title"
                inert={!editing}
                aria-hidden={!editing}
                ref={title}
                aria-label={t('todo.content')}
                aria-description={t('todo.pasteHint')}
                placeholder={saved ? name : t('todo.quick')}
                value={item.text}
                onContextMenu={(e) => e.stopPropagation()}
                onPaste={(e) => paste(e, 'text')}
                onChange={(e) => change({ ...item, text: e.target.value })}
              />
              <div className="todo-heading" inert={editing} aria-hidden={editing}>
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
            </div>
            <div
              id={'todo-details-' + item.id}
              className="todo-detail"
              inert={!expanded}
              aria-hidden={!expanded}
            >
              <div className="todo-detail-clip">
                <TodoAttachments
                  item={item}
                  session={session}
                  expanded={expanded}
                  onChange={editing ? change : undefined}
                />
                <div className="todo-note-slot" data-empty={!item.note.trim() || undefined}>
                  <p className="todo-note" inert={editing} aria-hidden={editing}>
                    {item.note.trim() ? item.note : t('todo.pasteHint')}
                  </p>
                  {expanded && (
                    <textarea
                      rows={1}
                      inert={!editing}
                      aria-hidden={!editing}
                      aria-label={t('todo.note')}
                      placeholder={t('todo.pasteHint')}
                      value={item.note}
                      onContextMenu={(e) => e.stopPropagation()}
                      onPaste={(e) => paste(e, 'note')}
                      onChange={(e) => change({ ...item, note: e.target.value })}
                    />
                  )}
                </div>
                {editing && capture && offer?.id === item.id && (
                  <button className="todo-split" type="button" onClick={() => onSplit(offer.lines)}>
                    {t('todo.split', { count: offer.lines.length })}
                  </button>
                )}
                {editing && pasteError === item.id && (
                  <span role="alert">{t('todo.pasteFailed')}</span>
                )}
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
          {item.status !== 'done' && (
            <ContextMenu.Item onSelect={() => onStatus('done')}>
              {t('todo.complete')}
            </ContextMenu.Item>
          )}
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
