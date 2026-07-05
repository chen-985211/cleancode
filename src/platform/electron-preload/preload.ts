import { contextBridge, ipcRenderer } from 'electron'

const cleancodeApi = {
  appName: 'cleancode',
  listWorkbenches: () => ipcRenderer.invoke('cleancode:list-workbenches'),
  addProject: () => ipcRenderer.invoke('cleancode:add-project'),
  removeProject: (command: unknown) => ipcRenderer.invoke('cleancode:remove-project', command),
  createTerminalBlock: (command: unknown) =>
    ipcRenderer.invoke('cleancode:create-terminal-block', command),
  updateTerminalBlockMetadata: (command: unknown) =>
    ipcRenderer.invoke('cleancode:update-terminal-block-metadata', command),
  moveBlock: (command: unknown) => ipcRenderer.invoke('cleancode:move-block', command),
  deleteBlock: (command: unknown) => ipcRenderer.invoke('cleancode:delete-block', command),
  saveGraph: (command: unknown) => ipcRenderer.invoke('cleancode:save-graph', command),
  startTerminal: (command: unknown) => ipcRenderer.invoke('cleancode:start-terminal', command),
  writeTerminal: (command: unknown) => ipcRenderer.invoke('cleancode:write-terminal', command),
  resizeTerminal: (command: unknown) => ipcRenderer.invoke('cleancode:resize-terminal', command),
  interruptTerminal: (command: unknown) =>
    ipcRenderer.invoke('cleancode:interrupt-terminal', command),
  terminateTerminal: (command: unknown) =>
    ipcRenderer.invoke('cleancode:terminate-terminal', command),
  onTerminalOutput: (listener: (event: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, outputEvent: unknown) => {
      listener(outputEvent)
    }

    ipcRenderer.on('cleancode:terminal-output', subscription)

    return () => ipcRenderer.removeListener('cleancode:terminal-output', subscription)
  },
  onTerminalExit: (listener: (event: unknown) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, exitEvent: unknown) => {
      listener(exitEvent)
    }

    ipcRenderer.on('cleancode:terminal-exit', subscription)

    return () => ipcRenderer.removeListener('cleancode:terminal-exit', subscription)
  }
} as const

contextBridge.exposeInMainWorld('cleancode', cleancodeApi)
