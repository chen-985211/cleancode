import { contextBridge } from 'electron'

const cleancodeApi = {
  appName: 'cleancode'
} as const

contextBridge.exposeInMainWorld('cleancode', cleancodeApi)
