import type { Page } from 'playwright'
import { expect } from 'vitest'

export async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '.workbench-object-motion--spatial, .react-flow__node.dragging, .terminal-node[inert], .terminal-node--disclosure-transition'
      )
  )
}

export function expectRect(actual: Rect, expected: Rect) {
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(
      Math.abs(actual[key] - expected[key]),
      JSON.stringify({ actual, expected, key })
    ).toBeLessThan(1)
}
type Rect = { x: number; y: number; width: number; height: number }

export async function recordEdgeFrames(
  page: Page,
  connections: readonly { id: string; sourceBlockId: string; targetBlockId: string }[],
  record = true
) {
  return page.evaluateHandle(
    ({ connections, record }) => {
      let frame = 0,
        frames = 0,
        maxGap = 0
      let worst: unknown = null
      const channel = new MessageChannel()
      // Observe after all animation callbacks in the frame have written their
      // styles, including both the shell spring and the SVG edge presentation.
      const tick = () => channel.port2.postMessage(null)
      const sample = () => {
        frames++
        for (const edge of connections) {
          const rect = (id: string) => {
            const element = document.querySelector<HTMLElement>(
              `[data-terminal-block-id="${id}"] .terminal-node`
            )!
            const bounds = element.getBoundingClientRect()
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              classes: element.className,
              style: element.getAttribute('style')
            }
          }
          const source = rect(edge.sourceBlockId),
            target = rect(edge.targetBlockId)
          const path = document.querySelector<SVGPathElement>(
            `.react-flow__edge[data-id="${edge.id}"] .react-flow__edge-path`
          )
          const matrix = path?.getScreenCTM()
          if (!path || !matrix) {
            maxGap = Number.MAX_SAFE_INTEGER
            worst = {
              missingEdge: edge.id,
              frames,
              pathFound: Boolean(path),
              renderedEdges: [...document.querySelectorAll('.react-flow__edge')].map((edge) =>
                edge.getAttribute('data-id')
              ),
              source,
              target
            }
            continue
          }
          const start = path.getPointAtLength(0),
            end = path.getPointAtLength(path.getTotalLength())
          const from = new DOMPoint(start.x, start.y).matrixTransform(matrix)
          const to = new DOMPoint(end.x, end.y).matrixTransform(matrix)
          const portRadius =
            document
              .querySelector<HTMLElement>(
                `[data-terminal-block-id="${edge.targetBlockId}"] .terminal-node__handle--input`
              )!
              .getBoundingClientRect().width / 2
          const gap = Math.max(
            Math.hypot(from.x - source.x - source.width, from.y - source.y - source.height / 2),
            Math.abs(Math.hypot(to.x - target.x, to.y - target.y - target.height / 2) - portRadius)
          )
          if (gap > maxGap) {
            maxGap = gap
            worst = {
              edge: edge.id,
              actualPath: path.getAttribute('d'),
              source,
              target,
              from: { x: from.x, y: from.y },
              to: { x: to.x, y: to.y }
            }
          }
        }
      }
      channel.port1.onmessage = () => {
        sample()
        frame = requestAnimationFrame(tick)
      }
      if (record) frame = requestAnimationFrame(tick)
      else sample()
      return {
        read() {
          return { frames, maxGap, worst }
        },
        stop() {
          cancelAnimationFrame(frame)
          channel.port1.close()
          channel.port2.close()
          return { frames, maxGap, worst }
        }
      }
    },
    { connections, record }
  )
}

export async function readGeometry(
  page: Page,
  ids: string[],
  groupId: string | null,
  connections: readonly { id: string; sourceBlockId: string; targetBlockId: string }[]
) {
  const probe = await recordEdgeFrames(page, connections, false)
  const { maxGap } = await probe.evaluate((probe) => probe.stop())
  await probe.dispose()
  return page.evaluate(
    ({ ids, groupId, maxGap }) => {
      const rect = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }
      const members = ids.map((id) => rect(`[data-terminal-block-id="${id}"] .terminal-node`))
      return {
        members,
        maxGap,
        group: groupId
          ? rect(`[data-terminal-group-id="${groupId}"] .terminal-group-node__material`)
          : null
      }
    },
    { ids, groupId, maxGap }
  )
}
