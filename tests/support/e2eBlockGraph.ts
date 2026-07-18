import type { BlockGraphSnapshot } from '../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { parseBlockGraphStore } from '../../src/contexts/block-graph/infrastructure/filesystem/BlockGraphStore'
import { readOnlyJsonFile, waitForJsonFile, type E2eWorkbench } from './e2eWorkbench'

const graphFileName = 'default-graph.json'

export async function readE2eBlockGraph(workbench: E2eWorkbench): Promise<BlockGraphSnapshot> {
  return parseBlockGraphStore(
    await readOnlyJsonFile(workbench.appStateDirectory, graphFileName),
    graphFileName
  ).graph
}

export async function waitForE2eBlockGraph(workbench: E2eWorkbench): Promise<BlockGraphSnapshot> {
  return parseBlockGraphStore(
    await waitForJsonFile(workbench.appStateDirectory, graphFileName),
    graphFileName
  ).graph
}
