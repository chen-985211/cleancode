import { fireEvent, render, screen } from '@testing-library/react'

import { TerminalServiceRuntimeBar } from '../../../src/presentation/app-shell/TerminalServiceRuntimeBar'
import type {
  ManagedTerminalServiceOwner,
  TerminalRunIdentity,
  TerminalServiceEndpoint,
  TerminalServicePortConflict
} from '../../../src/presentation/app-shell/types'

describe('terminal service runtime bar', () => {
  it('shows the authoritative address, copies it, opens HTTP, and explains fallback', () => {
    const onCopyEndpoint = vi.fn()
    const onOpenEndpoint = vi.fn()
    const identity = createIdentity()
    const endpoint = createEndpoint({
      fallback: true,
      port: 5174,
      requestedPort: 5173,
      displayAddress: 'http://127.0.0.1:5174'
    })

    render(
      <TerminalServiceRuntimeBar
        identity={identity}
        endpoint={endpoint}
        conflict={null}
        onCopyEndpoint={onCopyEndpoint}
        onOpenEndpoint={onOpenEndpoint}
        onLocateOwner={vi.fn()}
        onEditPortConfiguration={vi.fn()}
        onDismissConflict={vi.fn()}
      />
    )

    expect(screen.getByLabelText('实际服务地址')).toHaveTextContent('http://127.0.0.1:5174')
    expect(screen.getByLabelText('实际服务地址')).toHaveAttribute('title', 'http://127.0.0.1:5174')
    expect(screen.getByText('首选 5173 已占用，已改用 5174')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '复制实际服务地址' }))
    fireEvent.click(screen.getByRole('button', { name: '打开实际服务地址' }))

    expect(onCopyEndpoint).toHaveBeenCalledWith(endpoint)
    expect(onOpenEndpoint).toHaveBeenCalledWith(identity)
  })

  it('keeps TCP endpoints copyable without offering an open action', () => {
    render(
      <TerminalServiceRuntimeBar
        identity={createIdentity()}
        endpoint={{
          ...createEndpoint(),
          protocol: 'tcp',
          displayAddress: 'tcp://127.0.0.1:5432',
          openable: false
        }}
        conflict={null}
        onCopyEndpoint={vi.fn()}
        onOpenEndpoint={vi.fn()}
        onLocateOwner={vi.fn()}
        onEditPortConfiguration={vi.fn()}
        onDismissConflict={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '复制实际服务地址' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '打开实际服务地址' })).not.toBeInTheDocument()
  })

  it('identifies a managed conflict and offers only scoped safe actions', () => {
    const onLocateOwner = vi.fn()
    const onOpenEndpoint = vi.fn()
    const onEditPortConfiguration = vi.fn()
    const onDismissConflict = vi.fn()
    const owner: ManagedTerminalServiceOwner = {
      identity: {
        ...createIdentity(),
        projectId: 'project-beta',
        workspaceName: 'feature/auth',
        blockId: 'web'
      },
      projectName: 'Storefront',
      workspaceName: 'feature/auth',
      terminalName: 'Web Server'
    }

    render(
      <TerminalServiceRuntimeBar
        identity={createIdentity()}
        endpoint={null}
        conflict={createConflict({ ownership: 'managed', managedOwner: owner })}
        onCopyEndpoint={vi.fn()}
        onOpenEndpoint={onOpenEndpoint}
        onLocateOwner={onLocateOwner}
        onEditPortConfiguration={onEditPortConfiguration}
        onDismissConflict={onDismissConflict}
      />
    )

    expect(screen.getByRole('status', { name: '端口冲突' })).toHaveTextContent(
      'Storefront / feature/auth / Web Server'
    )
    fireEvent.click(screen.getByRole('button', { name: '定位占用服务' }))
    fireEvent.click(screen.getByRole('button', { name: '打开占用服务' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑端口配置' }))
    fireEvent.click(screen.getByRole('button', { name: '取消端口冲突提示' }))

    expect(onLocateOwner).toHaveBeenCalledWith(owner)
    expect(onOpenEndpoint).toHaveBeenCalledWith(owner.identity)
    expect(onEditPortConfiguration).toHaveBeenCalledOnce()
    expect(onDismissConflict).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /停止|终止|杀死/ })).not.toBeInTheDocument()
  })

  it.each(['external', 'unknown'] as const)(
    'does not expose process details or destructive actions for %s ownership',
    (ownership) => {
      render(
        <TerminalServiceRuntimeBar
          identity={createIdentity()}
          endpoint={null}
          conflict={createConflict({ ownership })}
          onCopyEndpoint={vi.fn()}
          onOpenEndpoint={vi.fn()}
          onLocateOwner={vi.fn()}
          onEditPortConfiguration={vi.fn()}
          onDismissConflict={vi.fn()}
        />
      )

      expect(screen.getByRole('status', { name: '端口冲突' })).toHaveTextContent(
        ownership === 'external' ? '端口 5173 已被外部服务占用' : '无法确认端口 5173 的监听者归属'
      )
      expect(screen.queryByText(/PID|进程号/i)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /打开占用服务|定位|停止|终止/ })
      ).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '编辑端口配置' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '取消端口冲突提示' })).toBeEnabled()
    }
  )

  it('keeps managed ownership visible when owner labels cannot be resolved', () => {
    render(
      <TerminalServiceRuntimeBar
        identity={createIdentity()}
        endpoint={null}
        conflict={createConflict({ ownership: 'managed' })}
        onCopyEndpoint={vi.fn()}
        onOpenEndpoint={vi.fn()}
        onLocateOwner={vi.fn()}
        onEditPortConfiguration={vi.fn()}
        onDismissConflict={vi.fn()}
      />
    )

    expect(screen.getByRole('status', { name: '端口冲突' })).toHaveTextContent(
      '端口 5173 正由另一个 cleancode 服务使用'
    )
    expect(screen.queryByRole('button', { name: '定位占用服务' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开占用服务' })).not.toBeInTheDocument()
  })
})

function createIdentity(): TerminalRunIdentity {
  return {
    projectId: 'project-alpha',
    workspaceName: 'main',
    blockId: 'api',
    runId: 'run-2',
    sessionId: 'session-2',
    generation: 2
  }
}

function createEndpoint(input: Partial<TerminalServiceEndpoint> = {}): TerminalServiceEndpoint {
  return {
    protocol: 'http',
    host: '127.0.0.1',
    port: 5173,
    requestedPort: 5173,
    fallback: false,
    displayAddress: 'http://127.0.0.1:5173',
    openable: true,
    ...input
  }
}

function createConflict(
  input: Pick<TerminalServicePortConflict, 'ownership'> & Partial<TerminalServicePortConflict>
): TerminalServicePortConflict {
  const { ownership, ...rest } = input

  return {
    code: 'SERVICE_PORT_FIXED_CONFLICT',
    port: 5173,
    ownership,
    managedOwner: null,
    ...rest
  }
}
