import './AppShell.css'

export function AppShell() {
  return (
    <main className="app-shell" aria-label="cleancode workspace">
      <section className="app-shell__panel" aria-labelledby="app-shell-title">
        <p className="app-shell__eyebrow">cleancode</p>
        <h1 id="app-shell-title">Workspace ready</h1>
        <p className="app-shell__summary">
          Electron, React, TypeScript, Vite, and Vitest are ready for the first
          DDD-guided feature.
        </p>
      </section>
    </main>
  )
}
