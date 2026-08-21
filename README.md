<h1 align="center">
  <img src="./public/app-icon.png" alt="CleanCode" width="96" valign="middle" /> CleanCode
</h1>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/chen-985211/cleancode/releases"><img src="https://img.shields.io/badge/download-Preview-orange.svg" alt="Download Preview" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="macOS, Windows and Linux" /></a>
  <a href="#bring-agents-back-to-the-development-context"><img src="https://img.shields.io/badge/agents-33%20providers-blueviolet.svg" alt="33 Coding Agent Providers" /></a>
  <a href="#draw-the-dependencies-then-run-them"><img src="https://img.shields.io/badge/workflow-visual%20%26%20executable-brightgreen.svg" alt="Visual and executable workflows" /></a>
</p>

<p align="center">
  <sub><a href="./README_ZH.md">简体中文</a> · <strong>English</strong></sub>
</p>

<p align="center">
  <strong>A canvas-based ADE that puts each feature's Agents, terminals, and workflows into one runnable development context.</strong><br />
  Start with branch isolation, keep context and runtime state, and turn proven setups into reusable development assets.
</p>

<p align="center"><em>One feature. One visible, executable development context.</em></p>

<h3 align="center">
  <a href="https://github.com/chen-985211/cleancode/releases"><ins>Download CleanCode Preview (macOS / Windows / Linux)</ins></a>
</h3>

<p align="center">
  <img src="./docs/assets/cleancode-workflow-demo.png" alt="Multiple Agents, terminal workflows, and Git branch workspaces on the CleanCode canvas" width="960" />
</p>

<p align="center"><sub>Coding Agents, terminal tasks, long-running services, and real dependency connections in one branch workspace.</sub></p>

---

Software development is moving from “one person writing code” to people and Agents advancing multiple development contexts together. One change may have its own branch, terminals, services, test commands, ports, and Agent conversation; another change has a similar context of its own. The problem is not a lack of tools. Once these contexts scatter across different windows, you have to keep rebuilding them from memory: which branch a terminal belongs to, whether a service is still alive, whether ports conflict, whether dependencies are ready, and whether the Agent still understands the current change. That is why I increasingly think a development environment should not be organized only around code files and editors. It should be organized around the change currently in motion. It needs to remember branches, terminals, services, ports, dependency order, and Agent context at the same time, and make them visible in a form people can understand and Agents can operate.

**CleanCode is a canvas-based ADE (Agentic Development Environment).** In CleanCode, a change is not just a branch name. It is a development context you can keep working in: Agents, terminals, services, ports, and dependency relationships all live on the same canvas. You can see how they relate to each other and run them directly; once that context is proven, it can be saved as a project template or global favorite, becoming an asset you can reuse the next time you build.

## One Change, One Development Context

When you create a branch workspace for `feature/auth`, CleanCode is not just checking out another Git branch. It opens an isolated development context for that change. It has its own Git worktree, and its own canvas, terminals, execution scope, and Agent sessions:

```txt
feature/auth (isolated worktree)
├── Coding Agent
└── Executable workflow
    └── Install dependencies ──> API service ──> Web app
                                               └─> Tests
```

That means you can work on `feature/auth`, `fix/search`, and `experiment/new-ui` at the same time without squeezing them into the same terminal history and service state. When you return to any workspace, you come back to that change's own context: terminal output is still there, Agent context is still there, and the working directory has not moved.

If two branches both need to start the same development service, CleanCode helps them avoid port conflicts. It can use fixed, preferred, or automatic ports, inject the final endpoint through the launch environment or command arguments, and show the actual address on the canvas.

## Draw the Dependencies, Then Run Them

Many development environments do not break because the commands themselves cannot run. They break because the order and conditions are not remembered by the environment: install dependencies first, wait until the API service is actually ready, then start the web app, and finally run tests. Those details often scatter across READMEs, script comments, terminal history, and human memory. Switch branches, or come back a few days later, and the whole flow has to be checked again.

In CleanCode, those startup conditions become an executable workflow on the canvas:

- Terminal blocks run real builds, tests, development servers, and everyday commands.
- Directed connections declare real dependencies. Tasks without upstream dependencies can start in parallel; downstream tasks wait until every direct dependency has completed or become ready.
- Finite tasks succeed or fail according to their exit codes, while long-running services become ready after matching output text or opening a TCP listener.
- Services can use fixed, preferred, or automatic ports; the runtime allocates and injects the final endpoint.
- An upstream failure explicitly blocks its descendants; stopping a workflow cleans up active processes in reverse dependency order.

So the canvas is not a static flowchart. Every run produces an immutable execution plan from the current terminal graph, and CleanCode keeps node state, failure reasons, and actual service addresses on the canvas.

If the API service does not become ready in time, the web app and tests that depend on it do not start blindly. You can see exactly where the workflow stopped, which descendants were blocked, and what actually failed.

## Prove It Once, Turn It into an Asset

Once a development context actually works, its value no longer belongs to just that one change. The exact command, the readiness signal, the port strategy, and the layout of the nodes are all experience you had to discover. In many teams, that experience stays in someone's terminal history, chat thread, or memory. The next branch starts, and the same context has to be rebuilt.

In CleanCode, proven terminals, workflows, or combinations can be saved as project templates; if they belong in more than one project, move them into global favorites. The next time a similar change appears, choose **Place** or **Place and run**, and CleanCode creates a new set of terminals and connections with their own identities, bringing back the commands, dependency relationships, port strategy, and relative layout together.

Templates keep reusable development structure, not temporary state from the last run. They do not copy terminal output, runtime state, actual endpoints, Agents, or Agent conversations. You can also bind frequently used terminals, complete workflows, or combinations to slots `1` through `5` in the current workspace, then run them with `Command/Ctrl + 1` through `5`.

## Bring Agents Back to the Development Context

If CleanCode is an ADE (Agentic Development Environment), the first problem it should solve is not inventing another Agent. You may already have tools that feel right: Claude Code, Codex, Gemini, Cursor, OpenCode, or another local Agent CLI. The real question is whether those Agents can enter a change and stand in the same context as the branch, terminals, services, ports, and dependency relationships.

**What needs to be preserved is not only the Agent itself, but the way you have learned to work with it.** You know when it should change code directly, when it should read the project first, and when it needs to stop and ask you. It has also adapted to your command line, permission habits, and the way you carry context. Asking you to switch Agents looks like switching tools; in practice, it means rebuilding a collaboration pattern.

That is why CleanCode does not try to start over. It does not ship a new Coding Agent or lock you into a closed system; it brings the local Agent CLIs already installed on your machine into the current branch workspace. Then an Agent is not entering an isolated chat window. It enters the place where the current change is actually happening: the right directory, the same canvas, running terminals, services, ports, and dependency relationships.

On top of that, Agents can participate in two ways. Every built-in Provider can have its own console, running a real local CLI in the current workspace; Agents that support the native CleanCode MCP can also read, inspect, and build terminal workflows on the canvas through explicit tool boundaries. When you create an Agent, CleanCode checks the Provider CLIs installed on your machine, so the menu is not a theoretical compatibility list. It shows the Agents that can actually start here.

<!-- agent-provider-wall:start -->

There is a key idea here: CleanCode is not built by binding itself to a few specific Agents. Its foundation is the terminal, so the **33 Coding Agent Providers** are more like entries we prepared first: common Agent commands, icons, detection, and default arguments are already organized.

Look one layer deeper, and any Agent that can start from the command line can theoretically enter this canvas as a terminal process. Run the command in a terminal, then pin it to the current workspace with the pin button in the terminal header. Now it is no longer just a temporary command opened for one conversation. It becomes an Agent context that can stay in the background and keep working.

<p>
  <a href="https://docs.anthropic.com/claude/docs/claude-code"><img src="./docs/assets/agent-providers/badge-claude-code.svg" height="30" alt="Claude Code" /></a>
  <a href="https://developers.openai.com/codex/cli/"><img src="./docs/assets/agent-providers/badge-codex.svg" height="30" alt="Codex" /></a>
  <a href="https://opencode.ai/docs/cli/"><img src="./docs/assets/agent-providers/badge-opencode.svg" height="30" alt="OpenCode" /></a>
  <a href="https://github.com/google-gemini/gemini-cli"><img src="./docs/assets/agent-providers/badge-gemini.svg" height="30" alt="Gemini" /></a>
  <a href="https://cursor.com/cli"><img src="./docs/assets/agent-providers/badge-cursor.svg" height="30" alt="Cursor" /></a>
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><img src="./docs/assets/agent-providers/badge-copilot.svg" height="30" alt="GitHub Copilot" /></a>
  <a href="https://github.com/openclaw/openclaw"><img src="./docs/assets/agent-providers/badge-openclaw.svg" height="30" alt="OpenClaw" /></a>
  <a href="https://hermes-agent.nousresearch.com/docs/"><img src="./docs/assets/agent-providers/badge-hermes.svg" height="30" alt="Hermes" /></a>
  <a href="https://pi.dev"><img src="./docs/assets/agent-providers/badge-pi.svg" height="30" alt="Pi" /></a>
  <a href="https://docs.cline.bot/cline-cli/overview"><img src="./docs/assets/agent-providers/badge-cline.svg" height="30" alt="Cline" /></a>
  <a href="https://block.github.io/goose/docs/quickstart/"><img src="./docs/assets/agent-providers/badge-goose.svg" height="30" alt="Goose" /></a>
  <a href="https://aider.chat/docs/"><img src="./docs/assets/agent-providers/badge-aider.svg" height="30" alt="Aider" /></a>
  <a href="https://docs.continue.dev/guides/cli"><img src="./docs/assets/agent-providers/badge-continue.svg" height="30" alt="Continue" /></a>
  <a href="https://github.com/charmbracelet/crush"><img src="./docs/assets/agent-providers/badge-crush.svg" height="30" alt="Charm" /></a>
  <a href="https://kilo.ai/docs/cli"><img src="./docs/assets/agent-providers/badge-kilo.svg" height="30" alt="Kilocode" /></a>
  <a href="https://github.com/QwenLM/qwen-code"><img src="./docs/assets/agent-providers/badge-qwen-code.svg" height="30" alt="Qwen Code" /></a>
  <a href="https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html"><img src="./docs/assets/agent-providers/badge-kimi.svg" height="30" alt="Kimi" /></a>
  <a href="https://ampcode.com/manual#install"><img src="./docs/assets/agent-providers/badge-amp.svg" height="30" alt="Amp" /></a>
  <a href="https://x.ai/cli"><img src="./docs/assets/agent-providers/badge-grok.svg" height="30" alt="Grok" /></a>
  <a href="https://docs.factory.ai/cli/getting-started/quickstart"><img src="./docs/assets/agent-providers/badge-droid.svg" height="30" alt="Droid" /></a>
  <a href="https://antigravity.google/docs/cli-overview"><img src="./docs/assets/agent-providers/badge-antigravity.svg" height="30" alt="Antigravity" /></a>
  <a href="https://kiro.dev/docs/cli/"><img src="./docs/assets/agent-providers/badge-kiro.svg" height="30" alt="Kiro" /></a>
  <a href="https://github.com/mistralai/mistral-vibe"><img src="./docs/assets/agent-providers/badge-mistral-vibe.svg" height="30" alt="Mistral Vibe" /></a>
  <a href="https://mimo.xiaomi.com/coder"><img src="./docs/assets/agent-providers/badge-mimo-code.svg" height="30" alt="MiMo Code" /></a>
  <a href="https://openclaude.gitlawb.com/"><img src="./docs/assets/agent-providers/badge-openclaude.svg" height="30" alt="OpenClaude" /></a>
  <a href="https://omp.sh"><img src="./docs/assets/agent-providers/badge-omp.svg" height="30" alt="OMP" /></a>
  <a href="https://devin.ai/cli"><img src="./docs/assets/agent-providers/badge-devin.svg" height="30" alt="Devin" /></a>
  <a href="https://docs.augmentcode.com/cli/overview"><img src="./docs/assets/agent-providers/badge-aug.svg" height="30" alt="Auggie" /></a>
  <a href="https://www.codebuff.com/docs/help/quick-start"><img src="./docs/assets/agent-providers/badge-codebuff.svg" height="30" alt="Codebuff" /></a>
  <a href="https://github.com/autohandai/code-cli"><img src="./docs/assets/agent-providers/badge-autohand.svg" height="30" alt="Autohand Code" /></a>
  <a href="https://commandcode.ai/docs/quickstart"><img src="./docs/assets/agent-providers/badge-command-code.svg" height="30" alt="Command Code" /></a>
  <a href="https://github.com/AntigmaLabs/ante-preview"><img src="./docs/assets/agent-providers/badge-ante.svg" height="30" alt="Ante" /></a>
  <a href="https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/"><img src="./docs/assets/agent-providers/badge-rovo.svg" height="30" alt="Rovo Dev" /></a>
  <img src="./docs/assets/agent-providers/badge-any-cli-agent.svg" height="30" alt="Any CLI Agent" />
</p>

**Keep using the Agents you already know; CleanCode pins those CLI processes into a visible, runnable development context that stays with the work.**

<!-- agent-provider-wall:end -->

## Let Agents Build the Context, Without Crossing the Boundary

We said above that Agents can stand on the same canvas as terminals, services, and ports. But being in the development context does not mean an Agent should bypass you and edit the canvas data behind your back. Agents that support the native CleanCode MCP use stable tools to understand the current workspace: they can see existing terminals and connections, inspect the real startup commands in the project, and build a new terminal workflow from your goal.

For example, you can simply tell it:

> Help me set up a workflow for starting this project.

The Agent first inspects the existing canvas, then reads the project to figure out what should be installed first, which services should start, and how ports and dependencies should connect. What lands on the canvas is not a suggestion, but a development context you can see, inspect, and keep running.

But there is an important boundary here: actions that change the structure of the context, such as deleting blocks, dissolving groups, or disconnecting dependencies, require approval in the CleanCode UI. Starting and stopping workflows also remain under human control. Agents can help build the context, but they should not turn your local development environment into a black box. What they changed, what they created, and what would run next should stay visible to you.

## Let One Feature Grow into a Development Context

Using CleanCode does not require planning a complete system first. Start with the feature you are working on right now: add the local project, create an isolated branch workspace for it, and bring in the Coding Agent you already use.

From there, you can turn installation, builds, tests, and development servers into terminal blocks yourself, or ask an Agent that supports the CleanCode MCP to build the first startup workflow. CleanCode puts finite tasks, long-running services, readiness conditions, ports, and dependency relationships on the same canvas, so the feature becomes more than a branch. It becomes a runnable context you can inspect and keep adjusting.

Once the workflow runs, start it from the root terminal and inspect startup order, runtime state, failure reasons, and actual endpoints on the canvas. After the context has been proven, save the terminals, workflow, or combination as a template, or bind it to a quick execution slot. The next time a similar feature appears, it is no longer just a configuration you repeat. It is reusable experience.

## Quick Start

If you just want to get CleanCode running, you do not need to understand every concept first. The steps below are enough.

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

### Source Development Requirements

These requirements apply only when running from source or contributing to development. You do not need to install these development dependencies before downloading the Preview.

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

It is worth saying this directly: CleanCode is still a Preview. It can already organize terminals, Agents, branch workspaces, and executable workflows together, but some boundaries are not fully open yet.

- Executable block types currently remain terminal-centered, with terminal dependency workflows and terminal combinations. Preview, HTTP, Test, File, Plugin, and other standalone block types remain on the roadmap.
- Connections between terminals express startup dependencies only; they do not pass standard output, files, or structured artifacts between nodes.
- Agents can build, organize, and inspect terminal dependencies through MCP, but they cannot yet start, query, or stop workflows.
- Active workflows and Agent terminal processes do not continue running after the app exits. Recoverable terminals and upstream conversations reconnect according to their individual capabilities.
- Remote hosts, distributed execution, and cross-project workflows are not currently supported.
- The plugin extension system is not yet public, and third-party plugin compatibility is not guaranteed.
- The prebuilt packages on GitHub Releases are unsigned Preview builds, not signed production releases.

## Design Principles

These principles are not decorative slogans. They exist so the canvas can feel free while the runtime stays trustworthy.

- **The canvas is not the source of truth.** It only projects the domain model and runtime state.
- **People and Agents share the same use cases.** Agents do not bypass application boundaries to manipulate internal implementations.
- **Workspace isolation comes first.** Branches, directories, ports, and sessions must have explicit ownership.
- **Dangerous actions must be visible.** Capabilities that change processes, files, or workspace state require approval and auditing.
- **Failures must be explainable.** Plans, readiness, endpoints, and errors should map back to objects users can understand.

For architecture and domain boundaries, see the [Architecture Guide](./docs/engineering/architecture.md) and [Context Map](./docs/engineering/context-map.md).

## Documentation

- [Product Features and Quick Start](./docs/product/feature-guide.md)
- [Documentation Center](./docs/README.md)
- [UI Contract](./docs/product/ui-contract.md)
- [Terminal Dependency Workflows](./docs/contexts/run/terminal-workflow.md)
- [Agent and Session Lifecycle](./docs/contexts/agent/agent-session.md)
- [Native CleanCode MCP](./docs/contexts/agent/cleancode-mcp.md)
- [Development Guidelines](./docs/engineering/development.md)

## Contributing

Issues, discussions, and pull requests are welcome. Before you begin, read the [Contributing Guide](./CONTRIBUTING.md) and [Development Guidelines](./docs/engineering/development.md).

## License

[MIT](./LICENSE)

---

<div align="center">
  <h2>Join the CleanCode Community</h2>

  <p>Share the workflows you build, the way you use Agents, and Preview feedback.</p>

  <img src="./docs/assets/cleancode-qq-group.png" alt="Scan to join the CleanCode QQ group (group number: 186885114)" width="320" />

  <p>
    <strong>QQ group: 186885114</strong><br />
    <sub>Scan with QQ, or search for the group number to join</sub>
  </p>
</div>
