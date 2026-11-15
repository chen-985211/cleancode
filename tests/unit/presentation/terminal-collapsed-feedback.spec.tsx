import { act, fireEvent, render, screen } from '@testing-library/react'

import { TerminalNode } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import type { WorkflowRunNodeStatus } from '../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import { createTerminalStateStore } from '../../../src/contexts/run/presentation/view-models/terminalStateStore'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('../../../src/presentation/shared/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => motion.reduced
}))
vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => () => undefined,
  Handle: () => null,
  NodeResizeControl: () => null,
  Position: { Left: 'left', Right: 'right' }
}))
vi.mock('../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalViewport', () => ({
  TerminalViewport: () => <div data-testid="terminal-viewport" />
}))

describe('collapsed terminal feedback', () => {
  beforeEach(() => {
    motion.reduced = false
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  })

  it.each(
    (['succeeded', 'failed'] as const).flatMap((previous) => [
      { previous, replacement: 'interactive', visual: 'idle', label: '运行中' },
      { previous, replacement: 'direct', visual: 'idle', label: '运行中' },
      { previous, replacement: 'failed', visual: 'error', label: '失败' },
      { previous, replacement: 'auto-start-failed', visual: 'error', label: '失败' },
      { previous, replacement: 'port-conflict', visual: 'error', label: '失败' },
      { previous, replacement: 'service-ready', visual: 'done', label: '已就绪' }
    ])
  )('shows $replacement after a $previous workflow without reusing its result', (scenario) => {
    const data = createWorkflowData(scenario.previous)
    const store = createTerminalStateStore({ 'terminal-1': data.session })
    render(node({ ...data, terminalStateStore: store }))
    const session: TerminalFlowNode['data']['session'] = {
      ...createData().session,
      sessionId: 'replacement-session',
      sessionKind: scenario.replacement === 'interactive' ? 'interactive' : 'direct',
      status: scenario.replacement === 'failed' ? 'failed' : 'running',
      autoStartStatus: scenario.replacement === 'auto-start-failed' ? 'failed' : 'succeeded',
      runIdentity: {
        ...data.session.runIdentity!,
        sessionId: 'replacement-session',
        runId: 'replacement-run',
        generation: 2
      },
      portConflict:
        scenario.replacement === 'port-conflict'
          ? {
              code: 'SERVICE_PORT_FIXED_CONFLICT',
              port: 5173,
              ownership: 'external',
              managedOwner: null,
              managedLeaseState: null
            }
          : null,
      actualEndpoint:
        scenario.replacement === 'service-ready'
          ? {
              protocol: 'http',
              host: '127.0.0.1',
              port: 5173,
              requestedPort: null,
              fallback: false,
              displayAddress: 'http://127.0.0.1:5173',
              openable: true
            }
          : null,
      servicePortState: scenario.replacement === 'service-ready' ? 'bound' : null
    }
    act(() => store.replaceStates({ 'terminal-1': session }))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', scenario.visual)
    expect(screen.getByRole('status')).toHaveAccessibleName(`测试终端：${scenario.label}`)
  })

  it.each([undefined, 'other-workflow'])('does not claim an unconfirmed workflow %s', (runId) => {
    const data = createWorkflowData('succeeded')
    render(node({ ...data, workflowRunId: runId }))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'idle')
    expect(screen.getByRole('status')).toHaveAccessibleName('测试终端：已退出')
  })

  it('keeps a newer workflow session neutral until its own workflow state is available', () => {
    const data = createWorkflowData('failed')
    render(
      node({
        ...data,
        session: {
          ...data.session,
          sessionId: 'new-workflow-session',
          runIdentity: {
            ...data.session.runIdentity!,
            sessionId: 'new-workflow-session',
            runId: 'new-workflow',
            generation: 2
          }
        }
      })
    )
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'idle')
  })

  it('shows a current session failure while the matching workflow result is still catching up', () => {
    const data = createWorkflowData('succeeded')
    render(node({ ...data, session: { ...data.session, status: 'failed' } }))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'error')
  })

  it('keeps one forward decelerating sweep through session identity updates and disclosure', () => {
    const clock = createMotionClock()
    const data = createWorkflowData('running')
    const { rerender, container } = render(node(data))
    const fill = container.querySelector('.terminal-collapsed-feedback__fill') as HTMLElement
    const read = () => Number(fill.style.transform.match(/scaleX\(([^)]+)\)/)?.[1] ?? 0)
    const start = read()
    clock.advance(500)
    const first = read()
    clock.advance(500)
    const second = read()
    expect(first).toBeGreaterThan(start)
    expect(second).toBeGreaterThan(first)
    expect(second - first).toBeLessThan(first - start)

    const claimed = {
      ...data,
      session: {
        ...data.session,
        sessionId: 'claimed-session',
        runIdentity: { ...data.session.runIdentity!, sessionId: 'claimed-session' }
      }
    }
    rerender(node(claimed))
    expect(read()).toBeGreaterThanOrEqual(second)
    rerender(
      node({
        ...claimed,
        session: {
          ...claimed.session,
          runIdentity: {
            projectId: 'project',
            workspaceId: 'main',
            blockId: 'terminal-1',
            sessionId: 'claimed-session',
            runId: 'workflow-run',
            generation: 1
          }
        }
      })
    )
    expect(read()).toBeGreaterThanOrEqual(second)
    clock.advance(500)
    const beforeExpand = read()
    rerender(node({ ...claimed, block: { ...data.block, isCollapsed: false } }))
    expect(container.querySelector('.terminal-collapsed-feedback__fill')).toBe(fill)
    expect(screen.queryByText('测试终端：执行中')).not.toBeInTheDocument()
    expect(container.querySelector('.terminal-collapsed-feedback__announcement')).toBeNull()
    clock.advance(500)
    rerender(node(claimed))
    expect(read()).toBeGreaterThanOrEqual(beforeExpand)
    clock.advance(500)
    const resumed = read()
    expect(resumed).toBeGreaterThan(beforeExpand)
    rerender(node({ ...claimed, workflowStatus: 'succeeded' }))
    expect(read()).toBeGreaterThanOrEqual(resumed)
    expect(read()).toBeLessThan(1)
    clock.advance(60)
    const finishing = read()
    expect(finishing).toBeGreaterThan(resumed)
    expect(finishing).toBeLessThan(1)
    clock.advance(300)
    expect(read()).toBe(1)
    expect(fill).toHaveAttribute('data-progress-phase', 'complete')
  })

  it('keeps the current sweep when reduced motion changes and releases its frame on unmount', () => {
    const clock = createMotionClock()
    const data = createWorkflowData('running')
    const { rerender, container, unmount } = render(node(data))
    clock.advance(1000)
    const fill = container.querySelector('.terminal-collapsed-feedback__fill') as HTMLElement
    const before = Number(fill.style.transform.match(/scaleX\(([^)]+)\)/)?.[1])
    motion.reduced = true
    rerender(node({ ...data }))
    const reduced = Number(fill.style.transform.match(/scaleX\(([^)]+)\)/)?.[1])
    expect(reduced).toBeGreaterThanOrEqual(before)
    expect(clock.pending()).toBe(0)
    motion.reduced = false
    rerender(node({ ...data }))
    expect(Number(fill.style.transform.match(/scaleX\(([^)]+)\)/)?.[1])).toBeGreaterThanOrEqual(
      reduced
    )
    unmount()
    expect(clock.pending()).toBe(0)
  })

  it('accelerates a successful sweep without first dropping its forward speed', () => {
    const clock = createMotionClock()
    const data = createWorkflowData('running')
    const { rerender, container } = render(node(data))
    const fill = container.querySelector('.terminal-collapsed-feedback__fill') as HTMLElement
    const read = () => Number(fill.style.transform.match(/scaleX\(([^)]+)\)/)?.[1])
    clock.advance(1000)
    const earlier = read()
    clock.advance(8)
    const beforeSuccess = read()
    rerender(node({ ...data, workflowStatus: 'succeeded' }))
    clock.advance(8)
    expect(read() - beforeSuccess).toBeGreaterThan(beforeSuccess - earlier)
  })

  it.each<{
    workflowStatus: WorkflowRunNodeStatus
    visual: string
    glyph: string
    label: string
  }>([
    { workflowStatus: 'waiting', visual: 'idle', glyph: 'tool', label: '等待' },
    { workflowStatus: 'running', visual: 'running', glyph: 'tool', label: '执行中' },
    { workflowStatus: 'ready', visual: 'done', glyph: 'check', label: '已就绪' },
    { workflowStatus: 'succeeded', visual: 'done', glyph: 'check', label: '成功' },
    { workflowStatus: 'failed', visual: 'error', glyph: 'retry', label: '失败' },
    { workflowStatus: 'blocked', visual: 'idle', glyph: 'tool', label: '已阻断' },
    { workflowStatus: 'stopped', visual: 'idle', glyph: 'tool', label: '已停止' }
  ])('shows $workflowStatus without a timer or changing the expand action', (scenario) => {
    const data = createWorkflowData(scenario.workflowStatus)
    const { container } = render(node(data))
    const status = screen.getByRole('status')
    expect(status).toHaveAccessibleName(`测试终端：${scenario.label}`)
    expect(screen.getAllByText('测试终端', { exact: false })).toHaveLength(1)
    expect(status).toHaveAttribute('data-status', scenario.visual)
    expect(status.querySelector('[data-state="in"]')).toHaveAttribute('data-glyph', scenario.glyph)
    expect(status).toHaveAttribute('aria-busy', String(scenario.visual === 'running'))
    expect(container.querySelector('[class*="timer"]')).toBeNull()
    expect(screen.queryByTestId('terminal-viewport')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '测试终端 展开终端' }))
    expect(data.onResizeBlock).toHaveBeenCalledWith(
      data.block,
      expect.objectContaining({ isCollapsed: false })
    )
    expect(data.onStart).not.toHaveBeenCalled()
  })

  it('keeps an interactive or direct shell neutral rather than inferring command progress', () => {
    const data = createData()
    const { rerender } = render(node(data))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'idle')
    rerender(node({ ...data, session: { ...data.session, sessionKind: 'direct' } }))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'idle')
    rerender(node({ ...data, session: { ...data.session, status: 'exited' } }))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'idle')
  })

  it('shows a session startup failure without inventing a successful command result', () => {
    const data = createData()
    render(node({ ...data, session: { ...data.session, status: 'failed' } }))
    expect(screen.getByRole('status')).toHaveAccessibleName('测试终端：失败')
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'error')
  })

  it.each([
    { portState: 'bound', visual: 'done', label: '已就绪' },
    { portState: 'releasing', visual: 'idle', label: '正在停止并释放端口' },
    { portState: 'quarantined', visual: 'error', label: '端口清理未确认，已隔离' }
  ] as const)(
    'projects managed service $portState without reporting stale readiness',
    (scenario) => {
      const data = createData()
      render(
        node({
          ...data,
          session: {
            ...data.session,
            servicePortState: scenario.portState,
            actualEndpoint: {
              protocol: 'http',
              host: '127.0.0.1',
              port: 5173,
              requestedPort: null,
              fallback: false,
              displayAddress: 'http://127.0.0.1:5173',
              openable: true
            }
          }
        })
      )
      expect(screen.getByRole('status')).toHaveAttribute('data-status', scenario.visual)
      expect(screen.getByRole('status')).toHaveAccessibleName(`测试终端：${scenario.label}`)
    }
  )

  it('keeps subscribing while collapsed and releases feedback and subscriptions when parked', () => {
    const data = createData()
    const store = createTerminalStateStore({ 'terminal-1': data.session })
    const { rerender, unmount } = render(node({ ...data, terminalStateStore: store }))
    act(() => store.replaceStates({ 'terminal-1': { ...data.session, status: 'failed' } }))
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'error')
    rerender(node({ ...data, terminalStateStore: store, isParkedInCollapsedGroup: true }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(store.getDiagnostics().listenerCount).toBe(0)
    unmount()
  })

  it('rolls between the original glyphs and cancels an error shake on reversal or expansion', () => {
    const cancel = vi.fn()
    const animate = vi.fn(() => ({ cancel }))
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
    const data = createWorkflowData('running')
    const { rerender } = render(node(data))
    rerender(node({ ...data, workflowStatus: 'failed' }))
    expect(screen.getByRole('status').querySelector('[data-glyph="tool"]')).toHaveAttribute(
      'data-state',
      'out'
    )
    expect(animate).toHaveBeenCalledOnce()
    rerender(node({ ...data, workflowStatus: 'running' }))
    expect(cancel).toHaveBeenCalledOnce()
    rerender(node({ ...data, workflowStatus: 'failed' }))
    rerender(node({ ...data, block: { ...data.block, isCollapsed: false } }))
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('settles an in-flight shake when reduced motion is enabled and keeps the failure visible', () => {
    const cancel = vi.fn()
    const animate = vi.fn(() => ({ cancel }))
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
    const data = createWorkflowData('running')
    const { rerender } = render(node(data))
    rerender(node({ ...data, workflowStatus: 'failed' }))
    motion.reduced = true
    rerender(node({ ...data, workflowStatus: 'failed' }))
    expect(cancel).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveAttribute('data-reduced-motion', 'true')
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'error')
    expect(animate).toHaveBeenCalledOnce()
  })

  it('does not replay a saved failure on mount or start a shake with reduced motion', () => {
    const animate = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
    const data = createWorkflowData('failed')
    const { unmount } = render(node(data))
    expect(animate).not.toHaveBeenCalled()
    unmount()
    motion.reduced = true
    const reduced = render(node({ ...data, workflowStatus: 'running' }))
    reduced.rerender(node(data))
    expect(animate).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'error')
  })
})

function createMotionClock() {
  let now = 0
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.set(++nextId, callback)
    return nextId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    callbacks.delete(id)
  })
  return {
    advance(milliseconds: number) {
      now += milliseconds
      const pending = [...callbacks.values()]
      callbacks.clear()
      act(() => pending.forEach((callback) => callback(now)))
    },
    pending: () => callbacks.size
  }
}

function node(data: TerminalFlowNode['data']) {
  return (
    <TerminalNode
      id="terminal-1"
      type="terminal"
      data={data}
      dragging={false}
      zIndex={0}
      selectable
      deletable
      selected={false}
      draggable
      isConnectable={false}
      positionAbsoluteX={0}
      positionAbsoluteY={0}
    />
  )
}

function createData(): TerminalFlowNode['data'] {
  return {
    identity: {
      projectId: 'project',
      workspaceId: 'main',
      objectKind: 'terminal',
      objectId: 'terminal-1'
    },
    block: {
      id: 'terminal-1',
      type: 'terminal',
      name: '测试终端',
      description: '',
      launchCommand: 'pnpm test',
      position: { x: 0, y: 0 },
      size: { width: 420, height: 280 },
      isCollapsed: true
    },
    session: { sessionId: 'session', status: 'running', sessionKind: 'interactive', output: '' },
    isSelected: false,
    isTerminalGroupSelectionMode: false,
    canSelectForTerminalGroup: true,
    isNavigationHighlighted: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onQuickLaunch: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateDefinition: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}

function createWorkflowData(status: WorkflowRunNodeStatus): TerminalFlowNode['data'] {
  const data = createData()
  return {
    ...data,
    workflowStatus: status,
    workflowRunId: 'workflow-run',
    session: {
      ...data.session,
      status:
        status === 'succeeded' || status === 'failed' || status === 'stopped'
          ? 'exited'
          : 'running',
      sessionKind: 'workflow',
      runIdentity: {
        projectId: 'project',
        workspaceId: 'main',
        blockId: 'terminal-1',
        sessionId: 'session',
        runId: 'workflow-run',
        generation: 1
      }
    }
  }
}
