import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties
} from 'react'
import { Paperclip, Plus } from '@phosphor-icons/react'
import { useI18n } from '../../../presentation/i18n/useI18n'
import { TooltipLabel } from '../../../presentation/shared/components/Tooltip'
import type { TodoApi } from '../application/ProjectTodos'
import {
  todoStates,
  type TodoDraft,
  type TodoItem,
  type TodoState
} from '../domain/ProjectTodoList'
import { blankTodo, TodoSession } from './TodoSession'
import { TodoEditor } from './TodoEditor'
import './project-todos.css'

const widthKey = 'cleancode.todo.drawerWidth'
export function ProjectTodoDrawer({ projectId, api }: { projectId: string; api: TodoApi }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(() => Number(window.localStorage.getItem(widthKey)) || 336)
  const [sessions] = useState(() => new Map<string, TodoSession>())
  const session = useMemo(() => {
    let found = sessions.get(projectId)
    if (!found) {
      found = new TodoSession(api, projectId)
      sessions.set(projectId, found)
    }
    return found
  }, [api, projectId, sessions])
  const state = useSyncExternalStore(session.subscribe, session.snapshot)
  useEffect(() => {
    session.start()
  }, [session])
  const toggle = useRef<HTMLButtonElement>(null)
  const completed = state.items.filter((item) => item.status === 'done').length
  const label = t(open ? 'todo.close' : 'todo.open')
  return (
    <>
      <TooltipLabel content={label}>
        <button
          ref={toggle}
          type="button"
          className="todo-opener"
          aria-label={label}
          aria-expanded={open}
          aria-controls="project-todo-drawer"
          aria-description={t('todo.count', { completed, total: state.items.length })}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation()
              setOpen(false)
            }
          }}
        >
          {state.loading || state.loadFailed
            ? '…'
            : [completed, state.items.length].map((n) => String(n).padStart(2, '0')).join('/')}
        </button>
      </TooltipLabel>
      {open && (
        <aside
          id="project-todo-drawer"
          className="project-todo-drawer"
          aria-label={t('todo.list')}
          style={{ '--todo-width': width + 'px' } as CSSProperties}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.defaultPrevented) {
              setOpen(false)
              toggle.current?.focus()
            }
          }}
        >
          <ResizeHandle width={width} onWidth={setWidth} />
          {state.loading && !state.loadFailed ? (
            <span role="status" className="todo-feedback">
              {t('todo.loading')}
            </span>
          ) : null}
          {!state.loading && !state.loadFailed && (
            <TodoRows session={session} key={projectId} items={state.items} />
          )}
          {(state.loadFailed || state.saveFailed) && (
            <div role="alert" className="todo-feedback">
              {t(state.loadFailed ? 'todo.loadFailed' : 'todo.saveFailed')}{' '}
              <button onClick={() => session.retry()}>{t('todo.retry')}</button>
            </div>
          )}
        </aside>
      )}
    </>
  )
}
function ResizeHandle({ width, onWidth }: { width: number; onWidth: (n: number) => void }) {
  const { t } = useI18n()
  const start = useRef<{ x: number; width: number } | null>(null)
  const handle = useRef<HTMLDivElement>(null)
  function resize(value: number) {
    const host = handle.current?.parentElement?.parentElement
    const max = Math.max(160, (host?.clientWidth ?? innerWidth) * 0.64)
    const next = Math.round(Math.min(max, Math.max(Math.min(220, max), value)))
    onWidth(next)
    window.localStorage.setItem(widthKey, String(next))
  }
  return (
    <div
      role="separator"
      ref={handle}
      className="todo-resize"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t('todo.resize')}
      aria-valuenow={width}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        start.current = {
          x: e.clientX,
          width: e.currentTarget.parentElement!.getBoundingClientRect().width
        }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (start.current) resize(start.current.width + start.current.x - e.clientX)
      }}
      onLostPointerCapture={() => {
        start.current = null
      }}
      onDoubleClick={() => resize(336)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          resize(width + (e.key === 'ArrowLeft' ? 16 : -16))
        }
      }}
    />
  )
}

function TodoRows({ session, items }: { session: TodoSession; items: TodoItem[] }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<TodoDraft | null>(null)
  const scroll = useRef<HTMLDivElement>(null),
    groups = useRef<HTMLDivElement>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const newLine = draft && !('createdAt' in draft)
  const editing =
    draft &&
    (items.find((item) => item.id === draft.id) ?? {
      ...draft,
      text: '',
      note: '',
      links: [],
      images: []
    })
  useLayoutEffect(() => {
    const body = scroll.current!,
      content = groups.current!
    function measure() {
      const fourth = content.querySelector('[data-todo-history] > :nth-child(4)')
      body.style.maxHeight = fourth
        ? Math.ceil(
            fourth.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop
          ) + 'px'
        : ''
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [items, draft])
  useEffect(() => {
    if (!draft) return
    function outside(e: MouseEvent) {
      const target = e.target
      if (
        target instanceof Element &&
        !target.closest('.todo-edit, .todo-resize, .todo-row, .todo-new')
      )
        setDraft(null)
    }
    document.addEventListener('click', outside)
    return () => document.removeEventListener('click', outside)
  }, [draft])
  function finish() {
    const id = draft?.id
    setDraft(null)
    requestAnimationFrame(() => {
      const target =
        groups.current?.querySelector<HTMLButtonElement>('[data-todo-edit="' + id + '"]') ??
        newButton.current
      target?.focus({ preventScroll: true })
    })
  }
  function edit(item: TodoDraft) {
    return (
      <TodoEditor
        key={item.id}
        item={item}
        session={session}
        onFinish={finish}
        onNext={() => setDraft(blankTodo())}
      />
    )
  }
  function row(item: TodoItem) {
    if (editing?.id === item.id) return edit(editing)
    const next: TodoState = todoStates[(todoStates.indexOf(item.status) + 1) % todoStates.length]
    const name =
      item.text.trim() ||
      item.note.trim().split('\n')[0] ||
      (item.links[0] && new URL(item.links[0]).host) ||
      t('todo.image')
    return (
      <div className="todo-row" key={item.id}>
        <button
          type="button"
          className="todo-status"
          aria-label={t('todo.changeState', {
            name,
            from: t(`todo.${item.status}`),
            to: t(`todo.${next}`)
          })}
          onClick={() => {
            setDraft(null)
            session.change({ ...item, status: next })
            requestAnimationFrame(() =>
              groups.current
                ?.querySelector<HTMLButtonElement>('[data-todo-status="' + item.id + '"]')
                ?.focus({ preventScroll: true })
            )
          }}
          data-todo-status={item.id}
        >
          <span aria-hidden="true" className={'todo-dot todo-dot--' + item.status}>
            {item.status === 'done' ? '✓' : ''}
          </span>
        </button>
        <button
          type="button"
          className="todo-title"
          data-todo-edit={item.id}
          onClick={() => setDraft(item)}
        >
          {name}
        </button>
        {(item.links.length > 0 || item.images.length > 0 || item.note) && (
          <button
            className="todo-ref"
            type="button"
            aria-label={t('todo.references', { name })}
            onClick={() => setDraft(item)}
          >
            <Paperclip size={15} />
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="todo-scroll" ref={scroll}>
      <div className="todo-groups" ref={groups}>
        {todoStates.map((status) => {
          const rows = items.filter(
            (item) => item.status === status && !(newLine && item.id === draft?.id)
          )
          if (status === 'done') rows.sort((a, b) => b.completedAt! - a.completedAt!)
          if (!rows.length && status !== 'todo') return null
          return (
            <section
              key={status}
              aria-label={t(`todo.${status}`)}
              data-todo-history={status === 'done' ? '' : undefined}
            >
              {rows.map(row)}
              {status === 'todo' &&
                (editing && (newLine || !items.some((item) => item.id === editing.id)) ? (
                  edit(editing)
                ) : (
                  <button
                    type="button"
                    ref={newButton}
                    className="todo-new"
                    onClick={() => setDraft(blankTodo())}
                  >
                    <Plus aria-hidden="true" size={15} />
                    {t('todo.quick')}
                  </button>
                ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
