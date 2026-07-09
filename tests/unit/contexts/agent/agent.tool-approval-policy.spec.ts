import { AgentToolApprovalPolicy } from '../../../../src/contexts/agent/domain/policies/AgentToolApprovalPolicy'

describe('agent tool approval policy', () => {
  it('requires right-panel approval only for destructive cleancode graph operations', () => {
    const policy = new AgentToolApprovalPolicy()

    expect(policy.requiresApproval('delete_block')).toBe(true)
    expect(policy.requiresApproval('delete_terminal_group')).toBe(true)
    expect(policy.requiresApproval('create_block')).toBe(false)
    expect(policy.requiresApproval('update_block')).toBe(false)
    expect(policy.requiresApproval('create_terminal_group')).toBe(false)
    expect(policy.requiresApproval('update_terminal_group')).toBe(false)
    expect(policy.requiresApproval('inspect_graph')).toBe(false)
  })
})
