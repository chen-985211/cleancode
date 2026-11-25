import {
  useEffect,
  useImperativeHandle,
  type Ref,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties
} from 'react'
import { ArrowRight, Plus } from '@phosphor-icons/react'
import { useI18n } from '../../../presentation/i18n/useI18n'
import { AnchoredSurfaceMotion } from '../../../presentation/shared/components/SurfaceMotion'
import { useOutsidePointerDismiss } from '../../../presentation/shared/hooks/useOutsidePointerDismiss'
import { TooltipLabel } from '../../../presentation/shared/components/Tooltip'
import type { TodoApi } from '../application/ProjectTodos'
import { todoStates, type TodoDraft, type TodoItem } from '../domain/ProjectTodoList'
import { blankTodo, TodoSession } from './TodoSession'
import { TodoRow } from './TodoRow'
import { useTodoReorderMotion } from './useTodoReorderMotion'
import './project-todos.css'

const widthKey = 'cleancode.todo.drawerWidth'
const defaultDrawerWidth = 428
export interface ProjectTodoDrawerHandle {
  readonly open: boolean
  close: () => void
}

export function ProjectTodoDrawer({
  projectId,
  api,
  ref
}: {
  projectId: string
  api: TodoApi
  ref?: Ref<ProjectTodoDrawerHandle>
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  useImperativeHandle(ref, () => ({ open, close: () => setOpen(false) }), [open])
  const [width, setWidth] = useState(
    () => Number(window.localStorage.getItem(widthKey)) || defaultDrawerWidth
  )
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
  const closeButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (open) closeButton.current?.focus({ preventScroll: true })
  }, [open])
  function closeFromDrawer() {
    setOpen(false)
    toggle.current?.focus({ preventScroll: true })
  }
  const completed = state.items.filter((item) => item.status === 'done').length
  const label = t(open ? 'todo.close' : 'todo.open')
  return (
    <>
      <TooltipLabel content={label} disabled={open}>
        <button
          ref={toggle}
          type="button"
          className="todo-opener"
          aria-label={label}
          aria-expanded={open}
          aria-controls="project-todo-drawer"
          tabIndex={open ? -1 : 0}
          aria-description={t('todo.count', { completed, total: state.items.length })}
          onClick={() => setOpen((v) => !v)}
        >
          {state.loading || state.loadFailed ? (
            '…'
          ) : (
            <>
              <span className="todo-count" key={`done-${completed}`}>
                {String(completed).padStart(2, '0')}
              </span>
              <span className="todo-count-divider">/</span>
              <span className="todo-count" key={`total-${state.items.length}`}>
                {String(state.items.length).padStart(2, '0')}
              </span>
            </>
          )}
        </button>
      </TooltipLabel>
      <AnchoredSurfaceMotion
        open={open}
        springPreset="sliding-panel-right"
        role="complementary"
        id="project-todo-drawer"
        className="project-todo-drawer anchored-surface-motion"
        aria-label={t('todo.list')}
        style={{ '--todo-width': width + 'px' } as CSSProperties}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.defaultPrevented) {
            e.stopPropagation()
            closeFromDrawer()
          }
        }}
      >
        <div className="todo-drawer-header">
          <button
            type="button"
            className="todo-close"
            aria-label={t('todo.close')}
            ref={closeButton}
            onClick={closeFromDrawer}
          >
            <ArrowRight aria-hidden="true" size={16} weight="bold" />
          </button>
        </div>
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
      </AnchoredSurfaceMotion>
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
      onDoubleClick={() => resize(defaultDrawerWidth)}
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
  const [expandedIds, setExpandedIds] = useState(() => new Set<string>())
  const scroll = useRef<HTMLDivElement>(null),
    groups = useRef<HTMLDivElement>(null)
  const capturePositions = useTodoReorderMotion(scroll)
  const focusAfterEdit = useRef<string | null>(null)
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
      const fourth = content.querySelector<HTMLElement>('[data-todo-history] > :nth-child(4)')
      body.style.maxHeight = fourth ? fourth.offsetTop + 'px' : ''
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [items, draft])
  useOutsidePointerDismiss({
    active: draft !== null,
    isInside: (target) =>
      target instanceof Element &&
      (!target.closest('#project-todo-drawer') ||
        Boolean(target.closest('.todo-row, .todo-resize, .todo-new, .todo-close'))),
    onDismiss: () => edit(null),
    pointerPolicy: 'passthrough'
  })
  useLayoutEffect(() => {
    const selector = focusAfterEdit.current
    if (!selector) return
    focusAfterEdit.current = null
    const target = groups.current?.querySelector<HTMLButtonElement>(selector) ?? newButton.current
    target?.focus({ preventScroll: true })
  }, [draft, items, expandedIds])
  function setExpanded(itemId: string, expanded: boolean) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (expanded) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }
  function edit(item: TodoDraft | null) {
    if (draft && session.find(draft.id)) setExpanded(draft.id, true)
    setDraft(item)
  }
  function finish(itemId: string) {
    focusAfterEdit.current = `[data-todo-edit="${itemId}"]`
    setExpanded(itemId, draft?.id === itemId && !!session.find(itemId))
    if (draft?.id === itemId) setDraft(null)
  }
  function startNew() {
    if (scroll.current) scroll.current.scrollTop = 0
    edit(blankTodo())
  }
  function row(item: TodoDraft) {
    return (
      <TodoRow
        key={item.id}
        item={item}
        session={session}
        expanded={draft?.id === item.id || expandedIds.has(item.id)}
        editing={draft?.id === item.id}
        onExpand={() => {
          edit(null)
          setExpanded(item.id, true)
        }}
        onEdit={() => edit(item)}
        onFinish={finish}
        onNext={startNew}
        onStatus={(status) => {
          capturePositions()
          edit(null)
          setExpanded(item.id, false)
          focusAfterEdit.current = `[data-todo-status="${item.id}"]`
          session.change({ ...item, status })
        }}
      />
    )
  }
  return (
    <>
      <div className="todo-capture">
        {newLine && editing ? (
          row(editing)
        ) : (
          <button type="button" className="todo-new" ref={newButton} onClick={startNew}>
            <Plus aria-hidden="true" size={15} />
            {t('todo.quick')}
          </button>
        )}
      </div>
      <div className="todo-scroll" ref={scroll}>
        <div className="todo-groups" ref={groups}>
          {todoStates.map((status) => {
            const rows = items.filter(
              (item) => item.status === status && !(newLine && item.id === draft?.id)
            )
            const draftRow =
              status === 'todo' &&
              editing &&
              !newLine &&
              !items.some((item) => item.id === editing.id)
                ? editing
                : null
            // The list retains insertion order when an existing item is edited.
            if (status === 'todo') rows.reverse()
            if (status === 'done') rows.sort((a, b) => b.completedAt! - a.completedAt!)
            if (!rows.length && !draftRow) return null
            return (
              <section
                key={status}
                aria-label={t(`todo.${status}`)}
                data-todo-history={status === 'done' ? '' : undefined}
              >
                {(draftRow ? [draftRow, ...rows] : rows).map(row)}
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}
