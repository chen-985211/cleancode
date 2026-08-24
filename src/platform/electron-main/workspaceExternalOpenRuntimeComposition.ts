import { app, shell } from 'electron'

import type { ProjectRepository } from '../../contexts/project/application/ports/ProjectRepository'
import { GetWorkspaceExternalOpenCapabilitiesUseCase } from '../../contexts/project/application/use-cases/GetWorkspaceExternalOpenCapabilitiesUseCase'
import { OpenWorkspaceExternallyUseCase } from '../../contexts/project/application/use-cases/OpenWorkspaceExternallyUseCase'
import { ElectronWorkspaceExternalOpenAdapter } from '../../contexts/project/infrastructure/system/ElectronWorkspaceExternalOpenAdapter'

export function createWorkspaceExternalOpenRuntime(projects: ProjectRepository) {
  const externalOpen = new ElectronWorkspaceExternalOpenAdapter({
    getApplicationNameForProtocol: (url) => app.getApplicationNameForProtocol(url),
    openExternal: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path)
  })
  const getCapabilities = new GetWorkspaceExternalOpenCapabilitiesUseCase(externalOpen)
  const openWorkspace = new OpenWorkspaceExternallyUseCase(projects, externalOpen)

  return {
    getWorkspaceExternalOpenCapabilities: () => getCapabilities.execute(),
    openWorkspaceExternally: (command: Parameters<typeof openWorkspace.execute>[0]) =>
      openWorkspace.execute(command)
  }
}
