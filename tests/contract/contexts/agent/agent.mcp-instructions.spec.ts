import { createAgentMcpConfiguration } from '../../../../src/contexts/agent/application/dto/AgentMcpConfiguration'

describe.each([true, false])('CleanCode MCP task scope with collaboration=%s', (collaboration) => {
  const configuration = createAgentMcpConfiguration({ canvas: true, collaboration })

  it.each(['instructions', 'developerInstructions'] as const)(
    '%s preserves code work and existing authorization without canvas prerequisites',
    (entry) => {
      const instructions = configuration[entry]
      expect(instructions).toContain('Route by the user task and conversation context')
      expect(instructions).toContain(
        'bug investigation, source-code implementation, refactoring, or tests'
      )
      expect(instructions).toContain('use the Provider file and shell tools directly')
      expect(instructions).toContain(
        'No inspect_graph call or special source-code wording is required'
      )
      expect(instructions).toContain('MCP tools are additional capabilities')
      expect(instructions).toContain('do not limit the Provider tools or replace the user task')
      expect(instructions).toContain('Honor authorization already given for the current task')
      expect(instructions).toContain('actual configured policy or a tool denial')
      expect(instructions).toContain('For mixed tasks, use repository tools for code')
      expect(instructions).toContain('does not restrict authorized shell commands, scripts, tests')
      expect(instructions).toContain(
        'Deletion tools still require independent CleanCode UI approval'
      )
      expect(instructions).not.toMatch(/Call inspect_graph before (?:reading|searching)/i)
      expect(instructions).not.toContain('after inspect_graph only to determine')
      expect(instructions).not.toMatch(/Only (?:interpret|treat).*source-code/)
      expect(instructions).not.toContain('canvas routing is mandatory')
    }
  )

  it.each(['instructions', 'developerInstructions'] as const)(
    '%s actively uses canvas evidence and actions without duplicate permission questions',
    (entry) => {
      const instructions = configuration[entry]
      expect(instructions).toContain('proceed with the necessary steps using available tools')
      expect(instructions).toContain('Use canvas tools proactively')
      expect(instructions).toContain(
        'without requiring the user to name MCP, a tool, or the canvas'
      )
      expect(instructions).toContain('reproduce, diagnose, or verify a bug')
      expect(instructions).toContain('Reuse relevant graph snapshots returned by tools')
      expect(instructions).toContain('needed facts are missing or stale')
      expect(instructions).toContain('call the tool and let CleanCode present its approval')
      expect(instructions).toContain('do not add a separate chat confirmation')
    }
  )
})
