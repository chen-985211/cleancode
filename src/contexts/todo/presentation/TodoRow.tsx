import {
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { TooltipLabel } from '../../../presentation/shared/components/Tooltip'
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
  const note = useRef<HTMLTextAreaElement>(null)
  const editFocus = useRef<{ field: 'text' | 'note'; offset: number } | null>(null)
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
  useLayoutEffect(() => {
    if (!editing) return
    const initial = editFocus.current
    editFocus.current = null
    const field = initial?.field === 'note' ? note.current : title.current
    if (!field) return
    field.focus({ preventScroll: true })
    const offset = initial?.offset ?? field.value.length
    field.setSelectionRange(offset, offset)
  }, [item.id, editing])
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
    const multilineTitle = field === 'text' && text.includes('\n')
    if (!links.length && !files.length && !multilineTitle) return
    event.preventDefault()
    const start = control.selectionStart ?? control.value.length
    const end = control.selectionEnd ?? start
    const next = { ...item, links: [...new Set([...item.links, ...links])] }
    if (text) {
      const combined = control.value.slice(0, start) + text + control.value.slice(end)
      if (multilineTitle && capture && !hasTodoContent(item)) {
        const [first, ...lines] = combined.split('\n')
        next.text = first
        next.note = [lines.join('\n'), next.note].filter(Boolean).join('\n')
      } else next[field] = combined
      const caret = Math.min(start + text.length, next[field].length)
      requestAnimationFrame(() => control.setSelectionRange(caret, caret))
    }
    change(next)
    if (capture && field === 'text' && !hasTodoContent(item) && !files.length) {
      const lines = numberedTodoLines(text)
      const referenced = new Set(lines.flatMap((line) => classifyTodoPaste(line, '').links))
      if (lines.length && links.every((link) => referenced.has(link)))
        setOffer({ id: item.id, lines })
    }
    if (files.length) {
      setPasteError(null)
      void session
        .pasteImages(item.id, Promise.all(files.map(readImage)), (images) => {
          const live = session.find(item.id)
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
    session.change({ ...item, text: '', note: '', links: [], images: [] })
    onFinish(item.id)
  }
  const gestureHint = t(expanded ? 'todo.editGesture' : 'todo.itemGesture')
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
          data-status={item.status}
          data-editing={editing || undefined}
          data-todo-position={item.id}
          onClick={(e) => {
            if (editing || !isRowSurface(e.target)) return
            const noteSlot = e.target.closest('.todo-note-slot')
            const field = noteSlot ? 'note' : 'text'
            const preview = noteSlot
              ? noteSlot.querySelector('.todo-note')
              : e.target.closest('.todo-title')?.querySelector('.todo-caption')
            editFocus.current = { field, offset: clickedTextOffset(e, preview, item[field]) }
            onEdit()
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
                      ref={note}
                      rows={1}
                      inert={!editing}
                      aria-hidden={!editing}
                      aria-label={t('todo.note')}
                      placeholder={t('todo.pasteHint')}
                      value={item.note}
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
          <ContextMenu.Item onSelect={remove}>{t('todo.remove')}</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function isRowSurface(target: EventTarget): target is Element {
  return (
    target instanceof Element &&
    !target.closest('textarea, a[href], button:not(.todo-title), [role="menu"]')
  )
}

function clickedTextOffset(
  event: ReactMouseEvent,
  preview: Element | null | undefined,
  value: string
) {
  if (!preview || event.detail === 0) return value.length
  const caret = preview.ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY)
  const text = preview.firstChild
  if (!text || caret?.offsetNode !== text) return value.length
  // A title preview can trim whitespace or show a link or note in place of an empty title.
  const start = value.indexOf(text.textContent ?? '')
  return start < 0 ? value.length : start + caret.offset
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
