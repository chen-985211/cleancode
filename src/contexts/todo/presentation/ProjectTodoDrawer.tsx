import {
  useEffect,
  useImperativeHandle,
  type Ref,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import { createPortal } from 'react-dom'
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
const minDrawerWidth = 284
const defaultDrawerWidth = 428
export interface ProjectTodoDrawerHandle {
  readonly open: boolean
  close: () => void
}

export function ProjectTodoDrawer({
  projectId,
  api,
  canvasWidth = window.innerWidth,
  onCoverCanvas,
  ref
}: {
  projectId: string
  api: TodoApi
  canvasWidth?: number
  onCoverCanvas?: (dock: HTMLElement) => () => void
  ref?: Ref<ProjectTodoDrawerHandle>
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  useImperativeHandle(ref, () => ({ open, close: () => setOpen(false) }), [open])
  const [preferredWidth, setWidth] = useState(() =>
    Math.max(minDrawerWidth, Number(window.localStorage.getItem(widthKey)) || defaultDrawerWidth)
  )
  const maxWidth = Math.max(1, Math.floor(canvasWidth * 0.64))
  const width = Math.min(Math.max(minDrawerWidth, preferredWidth), maxWidth)
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
  useEffect(() => {
    const flush = () => sessions.forEach((project) => project.flushOnPageHide())
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [sessions])
  const dock = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [header, setHeader] = useState<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (open) closeButton.current?.focus({ preventScroll: true })
  }, [open])
  useLayoutEffect(() => {
    if (open && dock.current) return onCoverCanvas?.(dock.current)
  }, [open, onCoverCanvas])
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
      <div
        ref={dock}
        className="project-todo-dock"
        style={{ width }}
        data-workbench-canvas-obstruction={open || undefined}
      >
        <AnchoredSurfaceMotion
          open={open}
          springPreset="sliding-panel-right"
          role="complementary"
          id="project-todo-drawer"
          className="project-todo-drawer anchored-surface-motion"
          aria-label={t('todo.list')}
          onKeyDown={(e) => {
            if (
              e.key === 'Escape' &&
              !e.defaultPrevented &&
              !e.nativeEvent.isComposing &&
              e.nativeEvent.keyCode !== 229
            ) {
              e.stopPropagation()
              closeFromDrawer()
            }
          }}
        >
          <div className="todo-drawer-header" ref={setHeader}>
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
          <ResizeHandle width={width} maxWidth={maxWidth} onWidth={setWidth} />
          {state.loading && !state.loadFailed ? (
            <span role="status" className="todo-feedback">
              {t('todo.loading')}
            </span>
          ) : null}
          {!state.loading && !state.loadFailed && (
            <TodoRows
              session={session}
              key={projectId}
              header={header}
              items={state.items}
              showCompleted={state.showCompleted}
              expandedId={state.expandedId}
            />
          )}
          {(state.loadFailed || state.saveFailed) && (
            <div role="alert" className="todo-feedback">
              {t(state.loadFailed ? 'todo.loadFailed' : 'todo.saveFailed')}{' '}
              <button onClick={() => session.retry()}>{t('todo.retry')}</button>
            </div>
          )}
        </AnchoredSurfaceMotion>
      </div>
    </>
  )
}
function ResizeHandle({
  width,
  maxWidth,
  onWidth
}: {
  width: number
  maxWidth: number
  onWidth: (n: number) => void
}) {
  const { t } = useI18n()
  const start = useRef<{ x: number; width: number } | null>(null)
  function resize(value: number) {
    const next = Math.round(Math.min(maxWidth, Math.max(minDrawerWidth, value)))
    onWidth(next)
    window.localStorage.setItem(widthKey, String(next))
  }
  return (
    <div
      role="separator"
      className="todo-resize"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t('todo.resize')}
      aria-valuemin={Math.min(minDrawerWidth, maxWidth)}
      aria-valuemax={maxWidth}
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
  header,
  items,
  showCompleted,
  expandedId
}: {
  session: TodoSession
  header: HTMLDivElement | null
  items: TodoItem[]
  showCompleted: boolean
  expandedId: string | null
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
    .filter((status) => showCompleted || status !== 'done')
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
  }, [draft, items, expandedId])
  function edit(item: TodoDraft | null, continuing = false) {
    const saved = draft && session.find(draft.id)
    if (newLine) prepareCapture(saved ? [saved.id] : [], continuing)
    session.setExpanded(item?.id ?? saved?.id ?? null)
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
    session.setExpanded(null)
    setEditor(null)
  }
  function finish(itemId: string) {
    focusAfterEdit.current = `[data-todo-edit="${itemId}"]`
    if (draft?.id === itemId) edit(null)
    else if (expandedId === itemId) session.setExpanded(null)
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
        expanded={expandedId === item.id}
        editing={draft?.id === item.id}
        onEdit={() => edit(item)}
        onFinish={finish}
        onNext={startNew}
        onStatus={(status) => {
          const willHide = status === 'done' && !showCompleted
          if (captureRow) {
            change({ ...item, status })
            if (!willHide) return
            edit(null)
          } else {
            capturePositions(item.id)
            if (editor?.item.id === item.id) {
              if (willHide) edit(null)
              else setEditor({ ...editor, item: { ...editor.item, status } })
            }
            const saved = session.find(item.id)
            if (saved) session.change({ ...saved, status })
          }
          focusAfterEdit.current = `[data-todo-status="${item.id}"]`
        }}
      />
    )
  }
  return (
    <>
      {header &&
        !newLine &&
        items.some((item) => item.status === 'done') &&
        createPortal(
          <button
            type="button"
            className="todo-completed-toggle"
            aria-label={t(showCompleted ? 'todo.hideCompleted' : 'todo.showCompleted')}
            aria-expanded={showCompleted}
            onClick={() => {
              if (draft) edit(null)
              session.setShowCompleted(!showCompleted)
            }}
          >
            {t(showCompleted ? 'todo.hide' : 'todo.show')}
          </button>,
          header
        )}
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
