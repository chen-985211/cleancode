import type { ProjectSnapshot } from '../dto/ProjectSnapshot'

/** Loads external workspace content; its representation remains owned by the caller. */
export interface RememberedProjectLoadPort {
  load(project: ProjectSnapshot): Promise<void>
}
