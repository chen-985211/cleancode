import { useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { Trash } from '@phosphor-icons/react'
import { useI18n } from '../../../presentation/i18n/useI18n'
import type { TodoDraft } from '../domain/ProjectTodoList'
import { TodoAttachments } from './TodoAttachments'
import type { TodoSession } from './TodoSession'
import { classifyTodoPaste } from './todoPaste'

export function TodoEditor({
  item,
  session,
  onFinish,
  onNext
}: {
  item: TodoDraft
  session: TodoSession
  onFinish: () => void
  onNext: () => void
}) {
  const { t } = useI18n()
  const title = useRef<HTMLTextAreaElement>(null)
  const [pasteError, setPasteError] = useState(false)
  useEffect(() => {
    title.current?.focus()
    const end = title.current?.value.length ?? 0
    title.current?.setSelectionRange(end, end)
  }, [item.id])
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
    if (files.length) {
      setPasteError(false)
      void Promise.all(files.map(readImage))
        .then((images) => {
          if (removed.current) return
          const current = session.find(item.id) ?? next
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
  return (
    <div
      className="todo-edit"
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
        if (e.key === 'Escape') {
          e.stopPropagation()
          onFinish()
        }
        if (e.key === 'Enter' && (e.target === title.current || e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onNext()
        }
      }}
    >
      <span aria-hidden="true" className={'todo-dot todo-dot--' + item.status}>
        {item.status === 'done' ? '✓' : ''}
      </span>
      <div className="todo-fields">
        <textarea
          rows={1}
          className="todo-edit-title"
          ref={title}
          aria-label={t('todo.content')}
          placeholder={t('todo.quick')}
          value={item.text}
          onPaste={(e) => paste(e, 'text')}
          onChange={(e) => session.change({ ...item, text: e.target.value })}
        />
        <textarea
          rows={1}
          aria-label={t('todo.note')}
          placeholder={t('todo.pasteHint')}
          value={item.note}
          onPaste={(e) => paste(e, 'note')}
          onChange={(e) => session.change({ ...item, note: e.target.value })}
        />
        <TodoAttachments item={item} session={session} onChange={(d) => session.change(d)} />
        {pasteError && <span role="alert">{t('todo.pasteFailed')}</span>}
      </div>
      {session.find(item.id) && (
        <button
          className="todo-remove"
          type="button"
          aria-label={t('todo.remove')}
          onClick={remove}
        >
          <Trash size={15} />
        </button>
      )}
    </div>
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
