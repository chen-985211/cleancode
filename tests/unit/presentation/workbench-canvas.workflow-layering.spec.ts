import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const terminalGroupStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/terminal-group-node.css'),
  'utf8'
)
const workbenchCanvasStyles = readFileSync(
  resolve(process.cwd(), 'src/presentation/app-shell/styles/workbench-canvas.css'),
  'utf8'
)

describe('workbench canvas workflow layering', () => {
  it('keeps selected groups above agents without covering elevated workflow edges', () => {
    const style = document.createElement('style')
    const groupNode = document.createElement('div')
    const agentNode = document.createElement('div')

    style.textContent = `${workbenchCanvasStyles}\n${terminalGroupStyles}`
    groupNode.className = 'react-flow__node react-flow__node-terminalGroup selected'
    agentNode.className = 'react-flow__node react-flow__node-agentConsole'
    document.head.append(style)
    document.body.append(groupNode)
    document.body.append(agentNode)

    const groupZIndex = getComputedStyle(groupNode).zIndex
    const agentZIndex = getComputedStyle(agentNode).zIndex

    agentNode.remove()
    groupNode.remove()
    style.remove()

    expect(groupZIndex).toBe('2')
    expect(agentZIndex).toBe('2')
  })
})
