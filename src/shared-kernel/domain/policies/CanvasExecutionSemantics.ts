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
      'A persistent visual container for zero or more terminals and workflows, allowing dependencies across its boundary.',
      '组合是可持久存在的独立视觉容器，可容纳零个或多个终端与流程，允许跨边界依赖。'
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
      'Creating a combination or moving workflow membership must include the complete workflow. Explicit terminal-scoped membership commands preserve external dependencies. Dragging a workflow terminal title inside a combination returns it to its fixed slot. Outside a combination, each terminal can move independently and keeps its released position, membership and dependencies; the workflow handle moves the complete workflow.',
      '创建组合或调整流程成员时，命中流程中的任意终端都必须扩展为完整流程；显式单终端成员命令保留外部依赖；组合内的流程单节点标题拖动在松手后回到固定槽位；组合外的节点可独立拖动并保留释放位置、归属与依赖，完整流程通过流程标签移动。'
    ),
    ordinaryTerminalScope: bilingual(
      'Ordinary terminal clicks, inspection, and configuration still affect only that terminal.',
      '普通单击、查看和配置仍只作用于当前终端。'
    ),
    crossBoundaryDependencies: bilingual(
      'Dependency connections may cross combination boundaries; membership and disclosure changes preserve those connections.',
      '依赖连线可以跨越组合边界；成员调整与展开收起必须保留这些连接。'
    ),
    emptyCombinationPersistence: bilingual(
      'A combination may remain empty until the user explicitly dissolves or removes it.',
      '组合可以保持为空，直到用户显式解散或删除它。'
    )
  }),
  version: 3
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
    canvasExecutionSemanticContract.rules.crossBoundaryDependencies
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
