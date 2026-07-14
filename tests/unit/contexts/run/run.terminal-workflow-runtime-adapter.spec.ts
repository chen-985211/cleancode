import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import { TerminalSessionWorkflowRuntimeAdapter } from '../../../../src/contexts/run/infrastructure/pty/TerminalSessionWorkflowRuntimeAdapter'
import type {
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../../../src/contexts/run/application/ports/TerminalProcessPort'

describe('terminal session workflow runtime adapter', () => {
  it('starts command PTYs and then starts an empty interactive handoff shell', async () => {
    const processes = new RecordingProcessPort()
    const runtime = new TerminalSessionWorkflowRuntimeAdapter(new TerminalSessionService(processes))
    const common = {
      blockId: 'install',
      workspaceName: 'main',
      workingDirectory: '/project',
      launchCommand: 'pnpm install',
      onOutput: () => undefined,
      onExit: () => undefined
    }

    const taskSession = await runtime.startCommand(common)
    const interactiveSession = await runtime.startInteractive(common)

    expect(processes.starts.map((start) => start.launchCommand)).toEqual([
      'pnpm install',
      undefined
    ])
    expect(processes.stops).toEqual([taskSession.id])
    expect(interactiveSession.id).not.toBe(taskSession.id)
  })
})

class RecordingProcessPort implements TerminalProcessPort {
  readonly starts: StartTerminalProcessCommand[] = []
  readonly stops: string[] = []

  async start(command: StartTerminalProcessCommand): Promise<{ processId: number }> {
    this.starts.push(command)
    return { processId: this.starts.length }
  }

  write(): void {}
  resize(): void {}
  async readWorkingDirectory(): Promise<null> {
    return null
  }
  stop(sessionId: string): void {
    this.stops.push(sessionId)
  }
  disposeAll(): void {}
}
