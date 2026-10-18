import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { AgentMcpSettingsPane } from '../../../../src/contexts/agent/presentation/components/AgentMcpSettingsPane'
import { AgentProviderPreferences } from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'
import { agentToolDefinitions } from '../../../../src/contexts/agent/application/dto/AgentToolProtocol'

describe('CleanCode MCP settings', () => {
  it('collapses each category independently and keeps its switch separate', async () => {
    function Harness() {
      const [preferences, setPreferences] = useState(AgentProviderPreferences.create().toSnapshot())
      return (
        <AgentMcpSettingsPane
          preferences={preferences}
          onPreferencesChange={async (patch) =>
            setPreferences((current) =>
              AgentProviderPreferences.restore({ ...current, ...patch }).toSnapshot()
            )
          }
        />
      )
    }
    render(<Harness />)
    const canvasDisclosure = screen.getByRole('button', { name: /终端画布工具/ })
    const collaborationDisclosure = screen.getByRole('button', { name: /Agent 协作工具/ })
    expect(canvasDisclosure).toHaveAttribute('aria-expanded', 'false')
    expect(collaborationDisclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    fireEvent.click(canvasDisclosure)
    expect(canvasDisclosure).toHaveAttribute('aria-expanded', 'true')
    expect(collaborationDisclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('inspect_graph')).toBeVisible()
    expect(screen.getByText('list_agents')).not.toBeVisible()
    fireEvent.click(collaborationDisclosure)
    for (const tool of agentToolDefinitions) expect(screen.getByText(tool.name)).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: /终端画布工具/ })).getAllByRole('listitem')
    ).toHaveLength(16)
    expect(
      within(screen.getByRole('region', { name: /Agent 协作工具/ })).getAllByRole('listitem')
    ).toHaveLength(5)
    const canvas = screen.getByRole('switch', { name: '终端画布工具' })
    const collaboration = screen.getByRole('switch', { name: 'Agent 协作工具' })
    fireEvent.click(canvas)
    await waitFor(() => expect(canvas).toHaveAttribute('aria-checked', 'false'))
    expect(collaboration).toHaveAttribute('aria-checked', 'true')
    expect(canvasDisclosure).toHaveAttribute('aria-expanded', 'true')
    expect(collaborationDisclosure).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(collaboration)
    await waitFor(() => expect(collaboration).toHaveAttribute('aria-checked', 'false'))
    expect(canvas).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: '新 Agent 默认启用 CleanCode MCP' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    fireEvent.click(canvasDisclosure)
    expect(canvasDisclosure).toHaveAttribute('aria-expanded', 'false')
    expect(
      within(screen.getByRole('region', { name: /终端画布工具/ })).queryByRole('list')
    ).not.toBeInTheDocument()
    expect(screen.getByText('list_agents')).toBeVisible()
    expect(canvas).toHaveAttribute('aria-checked', 'false')
    expect(collaboration).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(canvasDisclosure)
    expect(screen.getByText('inspect_graph')).toBeVisible()
    expect(canvas).toHaveAttribute('aria-checked', 'false')
  })

  it('removes the auxiliary page, default and category explanations', () => {
    render(<AgentMcpSettingsPane onPreferencesChange={vi.fn()} />)

    for (const explanation of [
      '管理内置工具分类，应用于所有项目和工作区。',
      '仅影响之后新建的 Agent，已有 Agent 保留自己的开关。',
      '分类更改在 Agent 下次启动或重新连接 MCP 后生效，不会自动中断当前会话。',
      '查看与编辑终端、组合、执行配置和依赖工作流。',
      '发现和创建 Agent，发送任务与接收回复。'
    ]) {
      expect(screen.queryByText(explanation)).not.toBeInTheDocument()
    }
  })

  it('prevents duplicate writes and keeps a failed selection available for retry', async () => {
    let rejectSave!: (error: Error) => void
    const onPreferencesChange = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        })
    )
    render(
      <AgentMcpSettingsPane
        preferences={AgentProviderPreferences.create().toSnapshot()}
        onPreferencesChange={onPreferencesChange}
      />
    )
    fireEvent.click(screen.getByRole('switch', { name: '终端画布工具' }))
    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toHaveAttribute('aria-disabled', 'true')
      expect(toggle).toBeEnabled()
    }
    fireEvent.click(screen.getByRole('switch', { name: 'Agent 协作工具' }))
    expect(onPreferencesChange).toHaveBeenCalledOnce()
    rejectSave(new Error('private internal details'))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.queryByText('private internal details')).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '终端画布工具' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await waitFor(() => expect(screen.getByRole('switch', { name: '终端画布工具' })).toBeEnabled())
  })

  it.each(['loading', 'unavailable'] as const)(
    'keeps the catalog readable while preferences are %s',
    (preferencesStatus) => {
      render(
        <AgentMcpSettingsPane preferencesStatus={preferencesStatus} onPreferencesChange={vi.fn()} />
      )
      for (const toggle of screen.getAllByRole('switch')) expect(toggle).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: /终端画布工具/ }))
      expect(screen.getByText('inspect_graph')).toBeVisible()
    }
  )
})
