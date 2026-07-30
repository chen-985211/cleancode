export type CanvasExecutionStructureType = 'terminal' | 'workflow' | 'combination'

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
  readonly canCreateCombination: boolean
  readonly classification: CanvasExecutionStructureType | null
  readonly expandedTerminalIds: readonly string[]
  readonly topLevelExecutionUnits: readonly CanvasTopLevelExecutionUnit[]
  readonly unknownTerminalIds: readonly string[]
}

const minimumCombinationTopLevelExecutionUnits = 2

export const canvasExecutionSemanticContract = Object.freeze({
  definitions: Object.freeze({
    combination: bilingual('A container of top-level execution units.', '顶层执行单元的容器。'),
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
  minimumCombinationTopLevelExecutionUnits,
  rules: Object.freeze({
    completeWorkflowMembership: bilingual(
      'When creating or adjusting combination membership, selecting any terminal in a workflow must include that complete workflow.',
      '创建或调整组合成员时，命中流程中的任意终端都必须扩展为完整流程。'
    ),
    ordinaryTerminalScope: bilingual(
      'Ordinary terminal clicks, inspection, and configuration still affect only that terminal.',
      '普通单击、查看和配置仍只作用于当前终端。'
    )
  }),
  version: 1
})

export const canvasExecutionSemanticInstructions = [
  `CleanCode canvas execution semantics / CleanCode 画布执行语义：${projectBilingual(
    canvasExecutionSemanticContract.definitions.terminal
  )} ${projectBilingual(canvasExecutionSemanticContract.definitions.workflow)}`,
  `A combination must always contain at least ${toEnglishNumber(
    canvasExecutionSemanticContract.minimumCombinationTopLevelExecutionUnits
  )} top-level execution units（组合始终至少${toChineseNumber(
    canvasExecutionSemanticContract.minimumCombinationTopLevelExecutionUnits
  )}个顶层执行单元）. ${projectBilingual(
    canvasExecutionSemanticContract.definitions.topLevelExecutionUnit
  )} Never wrap a single complete workflow or one independent terminal in a combination（单条完整流程或单个独立终端不得创建组合）.`,
  `${projectBilingual(
    canvasExecutionSemanticContract.rules.completeWorkflowMembership
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
    canCreateCombination:
      selectedUnits.length >=
      canvasExecutionSemanticContract.minimumCombinationTopLevelExecutionUnits,
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
  if (units.length >= canvasExecutionSemanticContract.minimumCombinationTopLevelExecutionUnits) {
    return 'combination'
  }
  return units[0]?.type ?? null
}

function normalizeIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids))
}

function toChineseNumber(value: number): string {
  return value === 2 ? '两' : String(value)
}

function toEnglishNumber(value: number): string {
  return value === 2 ? 'two' : String(value)
}

function bilingual(english: string, chinese: string) {
  return Object.freeze({ chinese, english })
}

function projectBilingual(value: { readonly chinese: string; readonly english: string }): string {
  return `${value.english}（${value.chinese}）`
}
