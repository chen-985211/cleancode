import type { BlockPositionSnapshot } from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { BlockTemplateSnapshot } from '../../../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { BlockTemplatePlacementPreview } from '../../../../contexts/block-graph/presentation/components/BlockTemplatePlacementPreview'
import {
  useWorkbenchCanvasViewport,
  type WorkbenchCanvasViewportStore
} from '../viewport/workbenchCanvasViewportStore'

export function LiveBlockTemplatePlacementPreview({
  origin,
  template,
  viewportStore
}: {
  readonly origin: BlockPositionSnapshot
  readonly template: BlockTemplateSnapshot
  readonly viewportStore: WorkbenchCanvasViewportStore
}) {
  const viewport = useWorkbenchCanvasViewport(viewportStore)

  return <BlockTemplatePlacementPreview origin={origin} template={template} viewport={viewport} />
}
