import type { WorkbenchSnapshot } from './types/workbenchSnapshot'

export function putWorkbenchFirst(
  entries: readonly WorkbenchSnapshot[],
  workbench: WorkbenchSnapshot
): WorkbenchSnapshot[] {
  return [
    workbench,
    ...entries.filter((entry) => entry.project.directory !== workbench.project.directory)
  ]
}

export function resolveCurrentWorkbenchAfterRemoval(
  current: WorkbenchSnapshot | null,
  removedWorkbench: WorkbenchSnapshot,
  rememberedWorkbenches: readonly WorkbenchSnapshot[]
): WorkbenchSnapshot | null {
  if (current?.project.directory !== removedWorkbench.project.directory) {
    return (
      rememberedWorkbenches.find(
        (entry) => entry.project.directory === current?.project.directory
      ) ?? current
    )
  }

  return rememberedWorkbenches[0] ?? null
}
