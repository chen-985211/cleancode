<p align="right">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

<div align="center">
  <img src="./public/app-icon.png" alt="cleancode" width="112" />

  <h1>cleancode</h1>

  <p><strong>DIY your AI development workflow, like building with blocks.</strong></p>

  <p>Compose your tools. Bring your agents. Run your workflow.</p>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
    <a href="https://github.com/chen-985211/cleancode/releases"><img src="https://img.shields.io/badge/download-Preview-orange.svg" alt="Download Preview" /></a>
    <a href="#requirements"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="macOS, Windows and Linux" /></a>
    <a href="#bring-your-favorite-agent"><img src="https://img.shields.io/badge/agents-33%20providers-blueviolet.svg" alt="33 Coding Agent Providers" /></a>
    <a href="#draw-it-and-run-it"><img src="https://img.shields.io/badge/workflow-visual%20%26%20executable-brightgreen.svg" alt="Visual and executable workflows" /></a>
  </p>

  <p>
    <strong><a href="https://github.com/chen-985211/cleancode/releases">Download CleanCode Preview (macOS / Windows / Linux)</a></strong>
  </p>
</div>

<p align="center">
  <img src="./docs/assets/cleancode-workflow-demo.png" alt="Build and run a project startup workflow with an Agent in cleancode" />
</p>

---

Your development workflow should not be defined by a single Agent, IDE, or fixed script.

**cleancode is a canvas-first, local-first executable development workspace.** It brings terminals, services, dependencies, Git branch workspaces, and your favorite Coding Agents into the same development environment, where you can run, adjust, and continue them your way.

```txt
feature/auth
├── Agent: Codex
└── Workflow
    ├── Build shared
    └── API server ──> Web app
                   └─> Tests
```

The canvas is not a static flowchart. Every workflow you build carries real commands, startup order, readiness conditions, runtime state, and execution scope.

## Build It Your Way

Start with one terminal, or assemble a complete development workbench:

- Use terminal blocks for builds, tests, development servers, and everyday commands.
- Configure finite tasks and long-running services with different execution modes.
- Group terminals that belong to the same part of your system.
- Declare real dependencies with directed connections, not decorative lines.
- Place multiple Agent consoles, each pinned to a Provider, on the same canvas.
- Save a dedicated canvas, terminal definitions, and Agent identities for every branch workspace.

**Your tools. Your Agents. Your workflow.**

## Bring Your Favorite Agent

**Switch Agents without changing how you work.** cleancode brings different Coding Agents into the same visible development environment. Your terminals, services, branches, and runtime state no longer need to be reorganized around a Provider.

<!-- agent-provider-wall:start -->

cleancode includes **33 Coding Agent Providers**. Every one of them can work in the same visible, executable development environment alongside your terminals, services, branches, and runtime state.

<p>
  <a href="https://docs.anthropic.com/claude/docs/claude-code"><kbd><img src="./docs/assets/agent-providers/claude-code.svg" width="18" height="18" alt="" /> Claude Code</kbd></a>
  <a href="https://developers.openai.com/codex/cli/"><kbd><img src="./docs/assets/agent-providers/codex.svg" width="18" height="18" alt="" /> Codex</kbd></a>
  <a href="https://opencode.ai/docs/cli/"><kbd><img src="./docs/assets/agent-providers/opencode.svg" width="18" height="18" alt="" /> OpenCode</kbd></a>
  <a href="https://github.com/google-gemini/gemini-cli"><kbd><img src="./docs/assets/agent-providers/gemini.png" width="18" height="18" alt="" /> Gemini</kbd></a>
  <a href="https://cursor.com/cli"><kbd><img src="./docs/assets/agent-providers/cursor.png" width="18" height="18" alt="" /> Cursor</kbd></a>
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><kbd><img src="./docs/assets/agent-providers/copilot.svg" width="18" height="18" alt="" /> GitHub Copilot</kbd></a>
  <a href="https://github.com/openclaw/openclaw"><kbd><img src="./docs/assets/agent-providers/openclaw.png" width="18" height="18" alt="" /> OpenClaw</kbd></a>
  <a href="https://hermes-agent.nousresearch.com/docs/"><kbd><img src="./docs/assets/agent-providers/hermes.png" width="18" height="18" alt="" /> Hermes</kbd></a>
  <a href="https://pi.dev"><kbd><img src="./docs/assets/agent-providers/pi.svg" width="18" height="18" alt="" /> Pi</kbd></a>
  <a href="https://docs.cline.bot/cline-cli/overview"><kbd><img src="./docs/assets/agent-providers/cline.png" width="18" height="18" alt="" /> Cline</kbd></a>
  <a href="https://block.github.io/goose/docs/quickstart/"><kbd><img src="./docs/assets/agent-providers/goose.png" width="18" height="18" alt="" /> Goose</kbd></a>
  <a href="https://aider.chat/docs/"><kbd><img src="./docs/assets/agent-providers/aider.svg" width="18" height="18" alt="" /> Aider</kbd></a>
  <a href="https://docs.continue.dev/guides/cli"><kbd><img src="./docs/assets/agent-providers/continue.png" width="18" height="18" alt="" /> Continue</kbd></a>
  <a href="https://github.com/charmbracelet/crush"><kbd><img src="./docs/assets/agent-providers/crush.png" width="18" height="18" alt="" /> Charm</kbd></a>
  <a href="https://kilo.ai/docs/cli"><kbd><img src="./docs/assets/agent-providers/kilo.svg" width="18" height="18" alt="" /> Kilocode</kbd></a>
  <a href="https://github.com/QwenLM/qwen-code"><kbd><img src="./docs/assets/agent-providers/qwen-code.png" width="18" height="18" alt="" /> Qwen Code</kbd></a>
  <a href="https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html"><kbd><img src="./docs/assets/agent-providers/kimi.png" width="18" height="18" alt="" /> Kimi</kbd></a>
  <a href="https://ampcode.com/manual#install"><kbd><img src="./docs/assets/agent-providers/amp.png" width="18" height="18" alt="" /> Amp</kbd></a>
  <a href="https://x.ai/cli"><kbd><img src="./docs/assets/agent-providers/grok.png" width="18" height="18" alt="" /> Grok</kbd></a>
  <a href="https://docs.factory.ai/cli/getting-started/quickstart"><kbd><img src="./docs/assets/agent-providers/droid.svg" width="18" height="18" alt="" /> Droid</kbd></a>
  <a href="https://antigravity.google/docs/cli-overview"><kbd><img src="./docs/assets/agent-providers/antigravity.png" width="18" height="18" alt="" /> Antigravity</kbd></a>
  <a href="https://kiro.dev/docs/cli/"><kbd><img src="./docs/assets/agent-providers/kiro.png" width="18" height="18" alt="" /> Kiro</kbd></a>
  <a href="https://github.com/mistralai/mistral-vibe"><kbd><img src="./docs/assets/agent-providers/mistral-vibe.png" width="18" height="18" alt="" /> Mistral Vibe</kbd></a>
  <a href="https://mimo.xiaomi.com/coder"><kbd><img src="./docs/assets/agent-providers/mimo-code.png" width="18" height="18" alt="" /> MiMo Code</kbd></a>
  <a href="https://openclaude.gitlawb.com/"><kbd><img src="./docs/assets/agent-providers/openclaude.png" width="18" height="18" alt="" /> OpenClaude</kbd></a>
  <a href="https://omp.sh"><kbd><img src="./docs/assets/agent-providers/omp.svg" width="18" height="18" alt="" /> OMP</kbd></a>
  <a href="https://devin.ai/cli"><kbd><img src="./docs/assets/agent-providers/devin.png" width="18" height="18" alt="" /> Devin</kbd></a>
  <a href="https://docs.augmentcode.com/cli/overview"><kbd><img src="./docs/assets/agent-providers/aug.png" width="18" height="18" alt="" /> Auggie</kbd></a>
  <a href="https://www.codebuff.com/docs/help/quick-start"><kbd><img src="./docs/assets/agent-providers/codebuff.png" width="18" height="18" alt="" /> Codebuff</kbd></a>
  <a href="https://github.com/autohandai/code-cli"><kbd><img src="./docs/assets/agent-providers/autohand.png" width="18" height="18" alt="" /> Autohand Code</kbd></a>
  <a href="https://commandcode.ai/docs/quickstart"><kbd><img src="./docs/assets/agent-providers/command-code.png" width="18" height="18" alt="" /> Command Code</kbd></a>
  <a href="https://github.com/AntigmaLabs/ante-preview"><kbd><img src="./docs/assets/agent-providers/ante.png" width="18" height="18" alt="" /> Ante</kbd></a>
  <a href="https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/"><kbd><img src="./docs/assets/agent-providers/rovo.png" width="18" height="18" alt="" /> Rovo Dev</kbd></a>
</p>

**33 leading Coding Agents, each with a real development environment inside cleancode.**

<!-- agent-provider-wall:end -->

## One Branch, One Complete Workspace

When you create a branch workspace for a feature, cleancode isolates its directory with a dedicated Git worktree. The canvas, terminals, execution scope, and Agent sessions all switch together with that workspace.

You can work on `feature/auth`, `fix/search`, and `experiment/new-ui` at the same time without repeatedly clearing terminals, checking the working directory, or reminding an Agent that you have switched branches.

## Draw It and Run It

Connections represent real dependencies; configuration represents real execution intent. cleancode turns the current terminal graph into an immutable execution plan:

- Tasks without upstream dependencies can start in parallel; downstream tasks wait until every direct dependency has completed or become ready.
- Finite tasks succeed or fail according to their real exit code, while long-running services become ready after matching output text or opening a TCP listener.
- Services can request fixed, preferred, or automatic ports; the runtime allocates them and injects the final endpoints.
- An upstream failure explicitly blocks its descendants; stopping a workflow cleans up active processes in reverse dependency order.

Node state, failure reasons, and actual service URLs all come from the runtime. The canvas shows what happened, but never presents a static label as runtime truth.

## Let Agents Help You Build

Agents that support the native cleancode MCP can understand and organize the same workspace through stable tools instead of editing internal canvas data. The current toolset can:

- Read the canvas, terminal blocks, connections, and execution plan.
- Create, update, delete, and connect terminal blocks.
- Validate dependencies and inspect the startup plan.
- Align, distribute, and automatically arrange terminal layouts.

Deleting blocks, dissolving groups, and disconnecting dependencies require approval in the cleancode UI. Starting and stopping workflows also remains under human control. Agents can help build your environment while every action that changes it stays visible.

## Start with One Feature

1. Create an isolated branch workspace for the feature.
2. Add the Coding Agent you use.
3. Turn builds, tests, development servers, and helper commands into terminal blocks.
4. Configure tasks, services, ports, and dependencies.
5. Run any terminal and all its descendants, then inspect the result on the same canvas.

## Quick Start

### Download the Preview

Download the installer for your platform from [GitHub Releases](https://github.com/chen-985211/cleancode/releases):

- macOS: Universal DMG/ZIP for both Apple Silicon and Intel.
- Windows: x64 NSIS installer.
- Linux: x64 AppImage/DEB.

> [!WARNING]
> The current Preview is not signed with official developer certificates. Download it only from this repository's GitHub Releases, and verify the package against `SHA256SUMS.txt` from the same release.

Because the app has not yet completed Developer ID signing and Apple notarization, macOS will block it the first time it opens. After moving `CleanCode.app` to `/Applications` and verifying the source and SHA-256 checksum, you can remove the download quarantine attribute for this app only and launch it:

```bash
xattr -dr com.apple.quarantine /Applications/CleanCode.app
open /Applications/CleanCode.app
```

This command bypasses the initial Gatekeeper check for this app. Do not replace the target with a broad path such as `/Applications`, your Downloads folder, or your home directory. Alternatively, follow [Apple's official instructions](https://support.apple.com/en-asia/102445) and choose **Open Anyway** under **System Settings → Privacy & Security**.

### Requirements

- Node.js `>= 24`
- pnpm `>= 10`
- macOS, Windows, or Linux

### Run Locally

```bash
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

### Common Checks

```bash
pnpm typecheck
pnpm test
pnpm pre-commit
```

### Build Locally

```bash
# Unpacked app for the current platform, intended for local verification
pnpm package

# Distribution installer for the current platform
pnpm dist

# You can also select a target explicitly on the corresponding operating system
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

All artifacts are written to `release/`. macOS builds Universal DMG/ZIP packages, Windows builds an x64 NSIS installer, and Linux builds x64 AppImage/DEB packages. The user-facing app name is **CleanCode**, while the internal package name remains `cleancode`.

When you push a `v*` tag that matches the version in `package.json`, GitHub Actions builds on all three target operating systems, runs a packaged-terminal smoke test, and creates a public Preview Pre-release. The Preview does not yet use official developer certificates: macOS uses ad-hoc signing without notarization, and the Windows installer is unsigned, so the operating system may display security warnings. Until official signing is available, these artifacts are public testing builds.

## Current Limitations

cleancode is under active development. Keep these current limitations in mind:

- The canvas currently provides terminal blocks and terminal groups. Preview, HTTP, Test, File, Plugin, and other block types remain on the roadmap.
- Agents can orchestrate and inspect terminal dependencies through MCP, but they cannot yet start, query, or stop workflows through MCP.
- Active workflows and Agent terminal processes do not continue running after the app exits. Recoverable terminals and upstream conversations reconnect according to their individual capabilities.
- The plugin extension system is not yet public, and third-party plugin compatibility is not guaranteed.
- The prebuilt packages on GitHub Releases are unsigned Preview builds, not signed production releases.

## Design Principles

- **The canvas is not the source of truth.** It only projects the domain model and runtime state.
- **People and Agents share the same use cases.** Agents do not bypass application boundaries to manipulate internal implementations.
- **Workspace isolation comes first.** Branches, directories, ports, and sessions must have explicit ownership.
- **Dangerous actions must be visible.** Capabilities that change processes, files, or workspace state require approval and auditing.
- **Failures must be explainable.** Plans, readiness, endpoints, and errors should map back to objects users can understand.

For architecture and domain boundaries, see the [Architecture Guide](./docs/engineering/architecture.md) and [Context Map](./docs/engineering/context-map.md).

## Documentation

- [Documentation Center](./docs/README.md)
- [UI Contract](./docs/product/ui-contract.md)
- [Terminal Dependency Workflows](./docs/contexts/run/terminal-workflow.md)
- [Agent and Session Lifecycle](./docs/contexts/agent/agent-session.md)
- [Native cleancode MCP](./docs/contexts/agent/cleancode-mcp.md)
- [Development Guidelines](./docs/engineering/development.md)

## Contributing

Issues, discussions, and pull requests are welcome. Before you begin, read the [Contributing Guide](./CONTRIBUTING.md) and [Development Guidelines](./docs/engineering/development.md).

## License

[MIT](./LICENSE)

---

<div align="center">
  <h2>Join the CleanCode Community</h2>

  <p>Talk workflows, Coding Agents, and developer experience—and share your feedback and ideas.</p>

  <img src="./docs/assets/cleancode-qq-group.png" alt="Scan to join the CleanCode QQ group (group number: 186885114)" width="320" />

  <p>
    <strong>QQ group: 186885114</strong><br />
    <sub>Scan with QQ, or search for the group number to join</sub>
  </p>
</div>
