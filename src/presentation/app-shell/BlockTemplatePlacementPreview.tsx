import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import { resolveBlockTemplateBounds } from './blockTemplatePlacement'
import type { WorkbenchSnapshot } from './types'

export function BlockTemplatePlacementPreview({
  origin,
  template,
  viewport
}: {
  readonly origin: { readonly x: number; readonly y: number }
  readonly template: BlockTemplateSnapshot
  readonly viewport: WorkbenchSnapshot['graph']['viewport']
}) {
  const nodeById = new Map(template.nodes.map((node) => [node.templateNodeId, node]))
  const templateBounds = resolveBlockTemplateBounds(template, origin)
  const toScreen = (point: { readonly x: number; readonly y: number }) => ({
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y
  })

  return (
    <div className="block-template-placement-preview" aria-hidden="true">
      <svg>
        {template.connections.map((connection) => {
          const source = nodeById.get(connection.sourceTemplateNodeId)
          const target = nodeById.get(connection.targetTemplateNodeId)
          if (!source || !target) return null
          const sourceCenter = toScreen({
            x: origin.x + source.position.x + source.size.width / 2,
            y: origin.y + source.position.y + source.size.height / 2
          })
          const targetCenter = toScreen({
            x: origin.x + target.position.x + target.size.width / 2,
            y: origin.y + target.position.y + target.size.height / 2
          })
          return (
            <line
              key={`${connection.sourceTemplateNodeId}:${connection.targetTemplateNodeId}`}
              x1={sourceCenter.x}
              y1={sourceCenter.y}
              x2={targetCenter.x}
              y2={targetCenter.y}
            />
          )
        })}
      </svg>
      {template.type === 'combination' ? (
        <span
          className="block-template-placement-preview__group"
          style={{
            left: templateBounds.x * viewport.zoom + viewport.x,
            top: templateBounds.y * viewport.zoom + viewport.y,
            width: templateBounds.width * viewport.zoom,
            height: templateBounds.height * viewport.zoom
          }}
        />
      ) : null}
      {template.nodes.map((node) => (
        <span
          key={node.templateNodeId}
          className="block-template-placement-preview__node"
          style={{
            left: (origin.x + node.position.x) * viewport.zoom + viewport.x,
            top: (origin.y + node.position.y) * viewport.zoom + viewport.y,
            width: node.size.width * viewport.zoom,
            height: node.size.height * viewport.zoom
          }}
        >
          <span>{node.name}</span>
        </span>
      ))}
    </div>
  )
}
