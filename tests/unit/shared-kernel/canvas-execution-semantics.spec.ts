import {
  analyzeCanvasExecutionSelection,
  canvasExecutionSemanticContract,
  canvasExecutionSemanticInstructions,
  classifyCanvasExecutionStructure
} from '../../../src/shared-kernel/domain/policies/CanvasExecutionSemantics'

const terminals = [
  { terminalId: 'install' },
  { terminalId: 'build' },
  { terminalId: 'test' },
  { terminalId: 'api' },
  { terminalId: 'worker' },
  { terminalId: 'shell' }
]

const dependencies = [
  { sourceTerminalId: 'install', targetTerminalId: 'build' },
  { sourceTerminalId: 'build', targetTerminalId: 'test' },
  { sourceTerminalId: 'api', targetTerminalId: 'worker' }
]

describe('canvas execution semantic contract', () => {
  it('publishes the versioned container and scope invariants', () => {
    expect(canvasExecutionSemanticContract).toMatchObject({
      version: 2,
      rules: {
        completeWorkflowMembership: expect.any(Object),
        connectionScopeIsolation: expect.any(Object),
        emptyCombinationPersistence: expect.any(Object)
      }
    })
    expect(canvasExecutionSemanticContract).not.toHaveProperty(
      'minimumCombinationTopLevelExecutionUnits'
    )
  })

  it('expands one selected terminal to its complete workflow', () => {
    const analysis = analyzeCanvasExecutionSelection({
      dependencies,
      selectedTerminalIds: ['build'],
      terminals
    })

    expect(analysis).toMatchObject({
      classification: 'workflow',
      expandedTerminalIds: ['install', 'build', 'test']
    })
    expect(analysis).not.toHaveProperty('canCreateCombination')
    expect(analysis.topLevelExecutionUnits).toEqual([
      { terminalIds: ['install', 'build', 'test'], type: 'workflow' }
    ])
  })

  it('keeps a multi-unit selection distinct from an explicit combination container', () => {
    const analysis = analyzeCanvasExecutionSelection({
      dependencies,
      selectedTerminalIds: ['build', 'api', 'shell'],
      terminals
    })

    expect(analysis).toMatchObject({
      classification: 'multiple',
      expandedTerminalIds: ['install', 'build', 'test', 'api', 'worker', 'shell']
    })
    expect(analysis.topLevelExecutionUnits).toEqual([
      { terminalIds: ['install', 'build', 'test'], type: 'workflow' },
      { terminalIds: ['api', 'worker'], type: 'workflow' },
      { terminalIds: ['shell'], type: 'terminal' }
    ])
  })

  it('uses the same structural classification without inferring a combination', () => {
    expect(
      classifyCanvasExecutionStructure({
        dependencies: dependencies.slice(0, 2),
        terminals: terminals.slice(0, 3)
      })
    ).toBe('workflow')
    expect(
      classifyCanvasExecutionStructure({
        dependencies: [...dependencies.slice(0, 2), dependencies[2]!],
        terminals: terminals.slice(0, 5)
      })
    ).toBe('multiple')
    expect(
      classifyCanvasExecutionStructure({
        dependencies: [],
        terminals: [{ terminalId: 'shell' }]
      })
    ).toBe('terminal')
  })

  it('publishes the canonical bilingual instructions from the structured rules', () => {
    expect(canvasExecutionSemanticInstructions).toContain('may remain empty')
    expect(canvasExecutionSemanticInstructions).toContain('可以保持为空')
    expect(canvasExecutionSemanticInstructions).toContain('same combination')
    expect(canvasExecutionSemanticInstructions).toContain('命中流程中的任意终端')
  })
})
