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
  it('publishes the versioned minimum combination invariant', () => {
    expect(canvasExecutionSemanticContract).toMatchObject({
      minimumCombinationTopLevelExecutionUnits: 2,
      version: 1
    })
  })

  it('classifies one complete workflow without creating a combination', () => {
    const analysis = analyzeCanvasExecutionSelection({
      dependencies,
      selectedTerminalIds: ['build'],
      terminals
    })

    expect(analysis).toMatchObject({
      canCreateCombination: false,
      classification: 'workflow',
      expandedTerminalIds: ['install', 'build', 'test']
    })
    expect(analysis.topLevelExecutionUnits).toEqual([
      { terminalIds: ['install', 'build', 'test'], type: 'workflow' }
    ])
  })

  it('classifies multiple top-level execution units as a combination', () => {
    const analysis = analyzeCanvasExecutionSelection({
      dependencies,
      selectedTerminalIds: ['build', 'api', 'shell'],
      terminals
    })

    expect(analysis).toMatchObject({
      canCreateCombination: true,
      classification: 'combination',
      expandedTerminalIds: ['install', 'build', 'test', 'api', 'worker', 'shell']
    })
    expect(analysis.topLevelExecutionUnits).toEqual([
      { terminalIds: ['install', 'build', 'test'], type: 'workflow' },
      { terminalIds: ['api', 'worker'], type: 'workflow' },
      { terminalIds: ['shell'], type: 'terminal' }
    ])
  })

  it('uses the same classification for template-sized structures', () => {
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
    ).toBe('combination')
    expect(
      classifyCanvasExecutionStructure({
        dependencies: [],
        terminals: [{ terminalId: 'shell' }]
      })
    ).toBe('terminal')
  })

  it('publishes the canonical bilingual instructions from the structured rules', () => {
    expect(canvasExecutionSemanticInstructions).toContain('at least two top-level execution units')
    expect(canvasExecutionSemanticInstructions).toContain('至少两个顶层执行单元')
    expect(canvasExecutionSemanticInstructions).toContain('Never wrap a single complete workflow')
    expect(canvasExecutionSemanticInstructions).toContain('命中流程中的任意终端')
  })
})
