import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { CodexThreadId } from '../../../../src/contexts/agent/domain/value-objects/CodexThreadId'

describe('workspace Agents', () => {
  it('keeps identity, layout, and branch conversations independent for every Agent', () => {
    const agent = AgentSession.create({
      agentId: 'agent-1',
      layout: { position: { x: 320, y: 140 }, size: { width: 440, height: 520 } },
      name: '实现 Agent',
      projectId: 'project-1',
      workspaceName: 'main'
    })

    agent.bindCodexThread(
      AgentConversationScope.create({
        agentId: 'agent-1',
        gitBranch: 'main',
        projectId: 'project-1',
        workspaceName: 'main'
      }),
      CodexThreadId.create('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    )
    agent.bindCodexThread(
      AgentConversationScope.create({
        agentId: 'agent-1',
        gitBranch: 'feature/login',
        projectId: 'project-1',
        workspaceName: 'main'
      }),
      CodexThreadId.create('0190d8a2-4f13-7e17-a0c1-64c303571909')
    )

    expect(agent.findCodexThreadId('main')).toBe('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    expect(agent.findCodexThreadId('feature/login')).toBe('0190d8a2-4f13-7e17-a0c1-64c303571909')
    expect(agent.toSnapshot()).toMatchObject({
      agentId: 'agent-1',
      layout: { position: { x: 320, y: 140 }, size: { width: 440, height: 520 } },
      name: '实现 Agent',
      projectId: 'project-1',
      workspaceName: 'main'
    })
  })

  it('can be persisted before Codex reports a thread and can update its presentation facts', () => {
    const agent = AgentSession.create({
      agentId: 'agent-2',
      layout: { position: { x: 540, y: 180 }, size: { width: 440, height: 520 } },
      name: 'Agent 2',
      projectId: 'project-1',
      workspaceName: 'main'
    })

    agent.rename('测试 Agent')
    agent.updateLayout({ position: { x: 620, y: 220 }, size: { width: 520, height: 460 } })

    expect(agent.toSnapshot()).toMatchObject({
      cleancodeMcpEnabled: true,
      conversations: [],
      name: '测试 Agent',
      layout: { position: { x: 620, y: 220 }, size: { width: 520, height: 460 } }
    })
  })

  it('can disable the CleanCode canvas MCP capability without changing Agent identity', () => {
    const agent = AgentSession.create({
      agentId: 'agent-3',
      layout: { position: { x: 540, y: 180 }, size: { width: 440, height: 520 } },
      name: 'Agent 3',
      projectId: 'project-1',
      workspaceName: 'main'
    })

    agent.setCleancodeMcpEnabled(false)

    expect(agent.id).toBe('agent-3')
    expect(agent.cleancodeMcpEnabled).toBe(false)
    expect(agent.toSnapshot()).toMatchObject({
      agentId: 'agent-3',
      cleancodeMcpEnabled: false
    })
  })
})
