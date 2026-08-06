export type CanvasExecutionStructureType = 'terminal' | 'workflow' | 'multiple'

interface CanvasSemanticTerminal {
  readonly terminalId: string
}

interface CanvasSemanticDependency {
  readonly sourceTerminalId: string
  readonly targetTerminalId: string
}

interface CanvasTopLevelExecutionUnit {
  readonly terminalIds: readonly string[]
  readonly type: 'terminal' | 'workflow'
}

interface CanvasExecutionStructureInput {
  readonly terminals: readonly CanvasSemanticTerminal[]
  readonly dependencies: readonly CanvasSemanticDependency[]
}

interface CanvasExecutionSelectionInput extends CanvasExecutionStructureInput {
  readonly selectedTerminalIds: readonly string[]
}

export interface CanvasExecutionSelectionAnalysis {
  readonly classification: CanvasExecutionStructureType | null
  readonly expandedTerminalIds: readonly string[]
  readonly topLevelExecutionUnits: readonly CanvasTopLevelExecutionUnit[]
  readonly unknownTerminalIds: readonly string[]
}

export const canvasExecutionSemanticContract = Object.freeze({
  definitions: Object.freeze({
    combination: bilingual(
      'A persistent container and connection scope for zero or more complete execution units.',
      '组合是可持久存在的独立容器与连线作用域，可容纳零个或多个完整执行单元。'
    ),
    terminal: bilingual('A terminal is the smallest execution unit.', '终端是最小执行单位。'),
    topLevelExecutionUnit: bilingual(
      'A top-level execution unit is either an independent terminal or one complete workflow.',
      '顶层执行单元只能是独立终端或完整流程。'
    ),
    workflow: bilingual(
      'A workflow is one complete dependency-connected set of terminals and dependency edges.',
      '流程是由终端及依赖连线构成的完整执行整体。'
    )
  }),
  rules: Object.freeze({
    completeWorkflowMembership: bilingual(
      'When creating or adjusting combination membership, selecting any terminal in a workflow must include that complete workflow.',
      '创建或调整组合成员时，命中流程中的任意终端都必须扩展为完整流程。'
    ),
    ordinaryTerminalScope: bilingual(
      'Ordinary terminal clicks, inspection, and configuration still affect only that terminal.',
      '普通单击、查看和配置仍只作用于当前终端。'
    ),
    connectionScopeIsolation: bilingual(
      'A dependency connection may only join two root terminals or two terminals in the same combination.',
      '依赖连线只能连接两个根画布终端，或同一组合中的两个终端。'
    ),
    emptyCombinationPersistence: bilingual(
      'A combination may remain empty until the user explicitly dissolves or removes it.',
      '组合可以保持为空，直到用户显式解散或删除它。'
    )
  }),
  version: 2
})

export const canvasExecutionSemanticInstructions = [
  `CleanCode canvas execution semantics / CleanCode 画布执行语义：${projectBilingual(
    canvasExecutionSemanticContract.definitions.terminal
  )} ${projectBilingual(canvasExecutionSemanticContract.definitions.workflow)} ${projectBilingual(
    canvasExecutionSemanticContract.definitions.combination
  )}`,
  `${projectBilingual(
    canvasExecutionSemanticContract.definitions.topLevelExecutionUnit
  )} ${projectBilingual(canvasExecutionSemanticContract.rules.emptyCombinationPersistence)}`,
  `${projectBilingual(
    canvasExecutionSemanticContract.rules.completeWorkflowMembership
  )} ${projectBilingual(
    canvasExecutionSemanticContract.rules.connectionScopeIsolation
  )} ${projectBilingual(canvasExecutionSemanticContract.rules.ordinaryTerminalScope)}`
].join(' ')

export function analyzeCanvasExecutionSelection(
  input: CanvasExecutionSelectionInput
): CanvasExecutionSelectionAnalysis {
  const terminalIds = normalizeIds(input.terminals.map((terminal) => terminal.terminalId))
  const terminalIdSet = new Set(terminalIds)
  const requestedTerminalIds = normalizeIds(input.selectedTerminalIds)
  const unknownTerminalIds = requestedTerminalIds.filter(
    (terminalId) => !terminalIdSet.has(terminalId)
  )
  const selectedTerminalIdSet = new Set(
    requestedTerminalIds.filter((terminalId) => terminalIdSet.has(terminalId))
  )
  const allUnits = createTopLevelExecutionUnits({
    dependencies: input.dependencies,
    terminals: terminalIds.map((terminalId) => ({ terminalId }))
  })
  const selectedUnits = allUnits.filter((unit) =>
    unit.terminalIds.some((terminalId) => selectedTerminalIdSet.has(terminalId))
  )
  const expandedTerminalIdSet = new Set(selectedUnits.flatMap((unit) => unit.terminalIds))
  const expandedTerminalIds = [
    ...terminalIds.filter((terminalId) => expandedTerminalIdSet.has(terminalId)),
    ...unknownTerminalIds
  ]

  return Object.freeze({
    classification: classifyTopLevelExecutionUnits(selectedUnits),
    expandedTerminalIds: Object.freeze(expandedTerminalIds),
    topLevelExecutionUnits: Object.freeze(selectedUnits),
    unknownTerminalIds: Object.freeze(unknownTerminalIds)
  })
}

export function classifyCanvasExecutionStructure(
  input: CanvasExecutionStructureInput
): CanvasExecutionStructureType | null {
  return classifyTopLevelExecutionUnits(createTopLevelExecutionUnits(input))
}

function createTopLevelExecutionUnits(
  input: CanvasExecutionStructureInput
): CanvasTopLevelExecutionUnit[] {
  const terminalIds = normalizeIds(input.terminals.map((terminal) => terminal.terminalId))
  const terminalIdSet = new Set(terminalIds)
  const adjacentTerminalIds = new Map(
    terminalIds.map((terminalId) => [terminalId, new Set<string>()])
  )

  for (const dependency of input.dependencies) {
    if (
      dependency.sourceTerminalId === dependency.targetTerminalId ||
      !terminalIdSet.has(dependency.sourceTerminalId) ||
      !terminalIdSet.has(dependency.targetTerminalId)
    ) {
      continue
    }
    adjacentTerminalIds.get(dependency.sourceTerminalId)?.add(dependency.targetTerminalId)
    adjacentTerminalIds.get(dependency.targetTerminalId)?.add(dependency.sourceTerminalId)
  }

  const visitedTerminalIds = new Set<string>()
  const units: CanvasTopLevelExecutionUnit[] = []
  for (const terminalId of terminalIds) {
    if (visitedTerminalIds.has(terminalId)) continue

    const componentTerminalIds = new Set<string>()
    const pendingTerminalIds = [terminalId]
    while (pendingTerminalIds.length > 0) {
      const currentTerminalId = pendingTerminalIds.shift()
      if (!currentTerminalId || visitedTerminalIds.has(currentTerminalId)) continue
      visitedTerminalIds.add(currentTerminalId)
      componentTerminalIds.add(currentTerminalId)
      pendingTerminalIds.push(...(adjacentTerminalIds.get(currentTerminalId) ?? []))
    }
    const orderedComponentTerminalIds = terminalIds.filter((candidateTerminalId) =>
      componentTerminalIds.has(candidateTerminalId)
    )
    units.push(
      Object.freeze({
        terminalIds: Object.freeze(orderedComponentTerminalIds),
        type: orderedComponentTerminalIds.length === 1 ? 'terminal' : 'workflow'
      })
    )
  }

  return units
}

function classifyTopLevelExecutionUnits(
  units: readonly CanvasTopLevelExecutionUnit[]
): CanvasExecutionStructureType | null {
  if (units.length === 0) return null
  if (units.length > 1) return 'multiple'
  return units[0]?.type ?? null
}

function normalizeIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids))
}

function bilingual(english: string, chinese: string) {
  return Object.freeze({ chinese, english })
}

function projectBilingual(value: { readonly chinese: string; readonly english: string }): string {
  return `${value.english}（${value.chinese}）`
}
