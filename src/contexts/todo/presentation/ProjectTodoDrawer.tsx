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
import type { TodoApi, TodoImage } from '../application/ProjectTodos'
import {
  hasTodoContent,
  todosInStatus,
  todoStates,
  type TodoDraft,
  type TodoItem
} from '../domain/ProjectTodoList'
import { blankTodo, TodoSession } from './TodoSession'
import { TodoRow } from './TodoRow'
import { useTodoReorderMotion } from './useTodoReorderMotion'
import { useTodoCaptureMotion } from './useTodoCaptureMotion'
import { useTodoReadingPosition } from './useTodoReadingPosition'
import { classifyTodoPaste } from './todoPaste'
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
          <TodoRows
            session={session}
            key={projectId}
            items={state.items}
            expandedIds={state.expanded}
          />
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

function TodoRows({
  session,
  items,
  expandedIds
}: {
  session: TodoSession
  items: TodoItem[]
  expandedIds: ReadonlySet<string>
}) {
  const { t } = useI18n()
  const [editor, setEditor] = useState<{ item: TodoDraft; capture: boolean } | null>(null)
  const draft = editor?.item
  const scroll = useRef<HTMLDivElement>(null),
    groups = useRef<HTMLDivElement>(null)
  const capture = useRef<HTMLDivElement>(null)
  const prepareCapture = useTodoCaptureMotion(capture, scroll)
  const capturePositions = useTodoReorderMotion(scroll)
  const focusAfterEdit = useRef<string | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const newLine = editor?.capture
  const listed = newLine ? items.filter((item) => item.id !== draft?.id) : items
  const sections = todoStates
    .map((status) => ({ status, rows: todosInStatus(listed, status) }))
    .filter(({ rows }) => rows.length > 0)
  useTodoReadingPosition(scroll, groups, session.reading)
  useOutsidePointerDismiss({
    active: Boolean(draft),
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
  function edit(item: TodoDraft | null, continuing = false) {
    if (draft) {
      const saved = session.find(draft.id)
      if (newLine) prepareCapture(saved ? [draft.id] : [], continuing)
      session.setExpanded(draft.id, Boolean(saved) && !continuing)
    }
    setEditor(item ? { item, capture: !('createdAt' in item) } : null)
  }
  function change(next: TodoDraft, images?: TodoImage[]) {
    setEditor((current) => (current?.item.id === next.id ? { ...current, item: next } : current))
    // A temporarily empty existing editor still owns its saved row. Only the menu removes it.
    if (newLine || hasTodoContent(next)) session.change(next, images)
  }
  function split(lines: string[]) {
    if (!newLine || !draft) return
    const parts = lines.map((line) => {
      const { text, links } = classifyTodoPaste(line, '')
      return { ...blankTodo(), text, links }
    })
    // The captured draft already occupies the oldest insertion slot in this batch.
    parts[parts.length - 1].id = draft.id
    prepareCapture(
      parts.map((part) => part.id),
      false
    )
    focusAfterEdit.current = `[data-todo-edit="${parts[0].id}"]`
    session.change(parts.reverse())
    setEditor(null)
  }
  function finish(itemId: string) {
    focusAfterEdit.current = `[data-todo-edit="${itemId}"]`
    if (draft?.id === itemId) edit(null)
    else session.setExpanded(itemId, false)
  }
  function startNew() {
    if (scroll.current) scroll.current.scrollTop = 0
    edit(blankTodo(), Boolean(newLine))
  }
  function row(source: TodoDraft, captureRow = false) {
    const item = draft?.id === source.id ? draft : source
    return (
      <TodoRow
        item={item}
        session={session}
        saved={!captureRow || Boolean(session.find(item.id))}
        capture={captureRow}
        onChange={change}
        onSplit={split}
        expanded={draft?.id === item.id || expandedIds.has(item.id)}
        editing={draft?.id === item.id}
        onExpand={() => {
          edit(null)
          session.setExpanded(item.id, true)
        }}
        onEdit={() => edit(item)}
        onFinish={finish}
        onNext={startNew}
        onStatus={(status) => {
          if (captureRow) {
            change({ ...item, status })
            return
          }
          capturePositions(item.id)
          if (editor?.item.id === item.id) {
            setEditor({ ...editor, item: { ...editor.item, status } })
          } else if (editor) {
            edit(null)
          }
          focusAfterEdit.current = `[data-todo-status="${item.id}"]`
          const saved = session.find(item.id)
          if (saved) session.change({ ...saved, status })
        }}
      />
    )
  }
  return (
    <>
      <div className="todo-capture" ref={capture}>
        {newLine && draft ? (
          row(draft, true)
        ) : (
          <button type="button" className="todo-new" ref={newButton} onClick={startNew}>
            <Plus aria-hidden="true" size={15} />
            {t('todo.quick')}
          </button>
        )}
      </div>
      <div className="todo-scroll" ref={scroll}>
        <div className="todo-groups" ref={groups}>
          {/* Named regions own their rows in the accessibility tree. The shared DOM
              parent keeps each row, its focus and its loaded previews alive on regroup. */}
          {sections.map(({ status, rows }) => (
            <section
              key={status}
              aria-label={t(`todo.${status}`)}
              aria-owns={rows.map((item) => 'todo-entry-' + item.id).join(' ')}
            />
          ))}
          {sections.flatMap(({ rows }) =>
            rows.map((item) => (
              <div
                className="todo-list-entry"
                id={'todo-entry-' + item.id}
                data-todo-entry={item.id}
                key={item.id}
              >
                {row(item)}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
