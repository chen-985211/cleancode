<h1 align="center">
  <img src="./public/app-icon.png" alt="CleanCode" width="96" valign="middle" /> CleanCode
</h1>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/chen-985211/cleancode/releases"><img src="https://img.shields.io/badge/download-Preview-orange.svg" alt="Download Preview" /></a>
  <a href="#快速开始"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="macOS, Windows and Linux" /></a>
  <a href="#让-agent-回到开发现场"><img src="https://img.shields.io/badge/agents-33%20providers-blueviolet.svg" alt="33 Coding Agent Providers" /></a>
  <a href="#把依赖画出来然后跑起来"><img src="https://img.shields.io/badge/workflow-visual%20%26%20executable-brightgreen.svg" alt="Visual and executable workflows" /></a>
</p>

<p align="center">
  <sub><strong>简体中文</strong> · <a href="./README.md">English</a></sub>
</p>

<p align="center">
  <strong>一个由 Agent 驱动的画布式 ADE：表达目标，让 AI 搭建工作流，把成功经验留下来。</strong><br />
  在本地工作区组织 Agent、脚本和终端，跑通一次，通过现有收藏与模板反复复用。
</p>

<p align="center"><em>你表达意图，AI 组织实现，成功的流程成为下一次的起点。</em></p>

<h3 align="center">
  <a href="https://github.com/chen-985211/cleancode/releases"><ins>下载 CleanCode Preview（macOS / Windows / Linux）</ins></a>
</h3>

<p align="center">
  <img src="./docs/assets/cleancode-workflow-demo.png" alt="CleanCode 画布中的多 Agent、终端工作流与 Git 分支工作区" width="960" />
</p>

<p align="center"><sub>同一分支工作区中的 Coding Agent、终端任务、长驻服务与真实依赖连线。</sub></p>

<p align="center"><strong>▶ 多 Agent 协作演示（0:39）</strong></p>

https://github.com/user-attachments/assets/9e157258-5604-4da6-83f9-65943c19efc5

<p align="center"><strong>▶ 完整演示（2:33，含声音）</strong></p>

https://github.com/user-attachments/assets/cafe373f-97b7-4f8c-b4a4-dfbc88ab26c3

---

用户想完成一件事时，可以先表达目标、偏好和对结果的判断，把拆解步骤、编写脚本、配置命令和排查问题交给 Agent。CleanCode 把 Agent 正在组织的工作放进同一张可见画布：本地目录、分支工作区、终端、服务和依赖关系有明确归属，用户可以看见进展，也可以随时调整。

**CleanCode 是一个由 Agent 驱动的画布式 ADE（Agentic Development Environment）。** 借用《思考，快与慢》中系统一和系统二的概念，用户侧追求系统一式的直觉表达与轻量操作，Agent 承担系统二式的规划、实现和检查。用户保留目标与关键取舍，复杂实现由 AI 在已有工具与权限范围内完成。CleanCode MCP 是 Agent 操作画布与协作 Agent 的核心入口，脚本编写则使用 Agent 自身的文件与 Shell 工具。

当一套方法跑通，现有的项目模板、全局收藏和快捷执行就能把成功经验留下来。下一次直接复用已配置的流程，省去重复规划、搭建和试错；流程中需要 AI 的步骤仍然可以处理新的输入。这条路径已经可以由当前的 Agent、终端工作流与保存复用能力组合完成。

## 一个需求，一张开发现场

当你为 `feature/auth` 创建分支工作区时，CleanCode 不只是帮你切了一个 Git 分支，而是给这个需求开出了一块独立的开发现场。它有自己的 Git worktree，也有自己的画布、终端、运行作用域和 Agent 会话：

```txt
feature/auth（独立 worktree）
├── Coding Agent
└── 可执行工作流
    └── 安装依赖 ──> API 服务 ──> Web 应用
                              └─> 测试
```

所以你可以同时推进 `feature/auth`、`fix/search` 和 `experiment/new-ui`，而不是把它们挤在同一个终端历史和同一组服务状态里。回到任一工作区时，你看到的是这个需求自己的现场：终端输出还在，Agent 上下文还在，工作目录也没有变。

如果两个分支都要启动同一个开发服务，CleanCode 也会帮它们避开端口冲突。它可以使用固定、优选或自动端口，把最终端点注入启动环境或命令参数，并把实际访问地址显示在画布上。

## 把依赖画出来，然后跑起来

很多开发环境的问题，不是命令本身跑不起来，而是顺序和条件没有被环境记住：先安装依赖，等 API 服务真正就绪，再启动 Web 应用，最后跑测试。它们常常散落在 README、脚本注释、终端历史和人的记忆里。只要换一个分支，或者隔几天再回来，这套流程就要重新确认一遍。

Agent 可以通过 CleanCode MCP 把这些启动条件配置成画布上的可执行工作流，用户也可以直接编辑：

- 终端积木运行真实的构建、测试、开发服务器和日常命令。
- 有向连接声明真实依赖；没有上游的任务可以并行启动，下游等待全部直接依赖完成或就绪。
- 有限任务按退出码判断成功，长驻服务按输出文本或 TCP 监听判断就绪。
- 服务可以使用固定、优选或自动端口，由运行时分配并注入最终端点。
- 上游失败会明确阻塞后代；停止时按反向依赖顺序清理活动进程。

所以这张画布不是一张静态流程图。每次运行，CleanCode 都会从当前终端图生成一份不可变执行计划，并把节点状态、失败原因和实际访问地址留在画布上。

如果 API 服务没有在期限内就绪，依赖它的 Web 应用和测试不会盲目启动。你会直接看到流程停在哪个节点、哪些后代被阻塞，以及真正的失败原因。

### 用脚本与 AI 组成自动化

当前终端已经能运行 Python、Node.js、HTTP 客户端和非交互 AI CLI，因此可以承载资料整理、内容生成、批量文件处理等自动化。例如：

```txt
准备资料（脚本） ──> 分析和提取（codex exec / claude -p） ──> 校验并生成报告（脚本）
```

Agent 可以编写这些脚本、提示词和启动命令，再通过 MCP 创建终端并连接依赖。AI 处理步骤可以使用 `codex exec` 或 `claude -p`，两者都支持非交互调用和结构化结果，分别见 [OpenAI 官方文档](https://developers.openai.com/codex/noninteractive)与 [Claude Code 官方文档](https://code.claude.com/docs/en/headless)。Agent 编写的包装脚本可以把不同 CLI 的结果整理为相同的下游输入。文件交接、输出解析、条件分支和循环由脚本或 CLI 完成；画布连线继续负责依赖调度。用户从现有入口启动，跑通后即可收藏并再次运行。具体步骤见[功能指南中的自动化例子](./docs/product/feature-guide.md#让-agent-搭建资料整理自动化)。

## 跑通一次，沉淀为资产

当 Agent 帮你跑通一套开发或自动化流程，命令、依赖、服务就绪条件和端口策略就成为一次成功经验。把它保存下来，下一次就有了可直接执行的起点，AI 也可以在已有方法上继续调整。

在 CleanCode 里，验证过的终端、流程或组合可以保存为项目模板；如果它适合更多项目，也可以移到全局收藏。下一次遇到类似需求时，你可以选择“放置”或“放置并运行”，CleanCode 会创建一套拥有独立身份的新终端和连接，把命令、依赖关系、端口策略和相对布局一起带回来。

模板保存的是可复用的开发结构，而不是上一次运行的临时状态。它不会复制终端输出、运行状态、实际端点、Agent 或 Agent 对话。你也可以把常用终端、完整流程或组合绑定到当前工作区的 `1` 至 `5` 快捷执行位，再用 `Command/Ctrl + 1` 至 `5` 启动。

## 让 Agent 回到开发现场

如果 CleanCode 是一个 ADE（Agentic Development Environment），那它要解决的第一件事，就不是重新发明一个新的 Agent。你可能已经有自己顺手的工具：Claude Code、Codex、Gemini、Cursor、OpenCode，或者别的本地 Agent CLI。真正的问题是，这些 Agent 进入一个需求时，能不能和分支、终端、服务、端口、依赖关系站在同一个现场里。

**真正需要被保留下来的，不只是 Agent 本身，而是你和它之间已经形成的工作方式。** 你知道它适合什么时候直接改代码，什么时候应该先读项目，什么时候需要停下来问你；它也已经适应了你的命令行、权限习惯和上下文表达。让你换一个 Agent，表面上是在换工具，本质上是在重新磨合一套协作关系。

所以 CleanCode 不想把这些东西推倒重来。它不内置一个新的 Coding Agent，也不把你锁进一个封闭系统；它只是把你已经安装的本地 Agent CLI 放进当前分支工作区。这样 Agent 进入的就不是一个孤立的聊天窗口，而是当前需求真实发生的地方：正确的目录、同一张画布、正在运行的终端、服务、端口和依赖关系。

在这个基础上，Agent 有两种参与方式。所有内建 Provider 都可以拥有自己的控制台，用真实本地 CLI 在当前工作区运行；支持原生 CleanCode MCP 的 Agent，还可以在明确的工具边界里读取、检查和搭建画布上的终端工作流。新建 Agent 时，CleanCode 会检查本机已经安装的 Provider CLI，菜单里出现的不是一串理论支持列表，而是当前机器上真正可以启动的 Agent。

<!-- agent-provider-wall:start -->

这里有一个很关键的地方：CleanCode 并不是靠绑定某几个 Agent 来成立的。它的底座是终端，所以 **33 个 Coding Agent Provider** 更像是我们先替你铺好的入口：常见 Agent 的命令、图标、检测方式和默认参数已经整理好。

再往下看，只要一个 Agent 能从命令行启动，它理论上就可以先作为一个终端进程进入这张画布。你在终端里输入命令，把它跑起来，再用终端右上角的图钉把它钉在当前工作区里。这样它就不再只是某次对话里临时打开的一条命令，而是一个可以留在后台、继续工作的 Agent 现场。

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

**你继续使用熟悉的 Agent；CleanCode 负责把这些 CLI 进程钉在一张可见、可运行、可长期停留的开发现场里。**

<!-- agent-provider-wall:end -->

## CleanCode MCP：让 Agent 主动搭建现场

CleanCode MCP 把画布操作交给 Agent：检查已有终端和依赖、配置任务与服务、原子创建完整流程，以及发现和联系协作 Agent。用户表达目标后，Agent 可以结合自己的项目读取、文件编辑和 Shell 能力，编写脚本并把处理步骤落实到画布上。

比如你可以直接告诉它：

> 帮我整理这个目录的资料并生成报告，把处理步骤搭成可复用的画布流程。

Agent 可以先检查画布和资料，再准备脚本、配置任务模式与启动命令，最后通过 MCP 一次提交已配置的终端和真实依赖。启动项目时也采用同样的方式，由 Agent 确认项目支持的命令、服务就绪条件与端口注入方式。

当前 MCP 已能搭建和检查流程；启动、停止、收藏和模板放置继续使用现有用户入口，MCP 尚未提供这些操作。删除积木、解散组合和断开依赖保留界面审批。脚本与 AI CLI 的权限由对应 Agent 和工具管理，配置好的工作流运行后由 Run 执行依赖调度，过程与结果保留在画布和终端中。

## 从一个需求，长出一张现场

使用 CleanCode 不需要先规划一套完整系统。你可以从当前正在做的一个需求开始：添加本地项目，为它创建独立分支工作区，然后带上你常用的 Coding Agent。

接下来，直接告诉支持 CleanCode MCP 的 Agent 你想完成什么，让它读取项目、编写必要脚本并搭建工作流。安装、构建、测试、开发服务和资料处理都可以使用现有终端承载；画布上的定义仍然可以由你检查和编辑。

当流程跑起来，你可以从根终端启动它，在画布上看到启动顺序、运行状态、失败原因和实际端点。等这套现场被验证过，再把终端、流程或组合保存为模板，或绑定到快捷执行位。下一次类似需求出现时，它就不再只是一次配置，而是一套可以直接复用的经验。

## 快速开始

如果你只是想先把 CleanCode 跑起来，不需要先理解所有概念，按下面几步就够了。

### 下载 Preview

从 [GitHub Releases](https://github.com/chen-985211/cleancode/releases) 下载对应平台的安装包：

- macOS：Universal DMG/ZIP，同时支持 Apple Silicon 和 Intel。
- Windows：x64 NSIS 安装程序。
- Linux：x64 AppImage/DEB。

> [!WARNING]
> 当前 Preview 尚未使用正式开发者证书签名。请只从本仓库的 GitHub Releases 下载，并先使用
> 同一 Release 中的 `SHA256SUMS.txt` 核对安装包。

macOS 会因为应用尚未完成 Developer ID 签名和 Apple notarization 而阻止首次打开。把
`CleanCode.app` 拖入 `/Applications`，确认安装包来源和 SHA-256 校验值无误后，可以只为这个
应用移除下载隔离属性并启动：

```bash
xattr -dr com.apple.quarantine /Applications/CleanCode.app
open /Applications/CleanCode.app
```

这条命令会绕过该应用的首次 Gatekeeper 检查。不要把目标路径替换为 `/Applications`、下载目录或
用户目录等宽泛范围。也可以按照
[Apple 官方说明](https://support.apple.com/en-asia/102445)，在“系统设置 → 隐私与安全性”中选择
“仍要打开”。

### 从源码运行的环境要求

以下要求只适用于从源码运行和参与开发；下载 Preview 不需要先安装这些开发依赖。

- Node.js `>= 24`
- pnpm `>= 10`
- macOS、Windows 或 Linux

### 本地运行

```bash
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

### 常用检查

```bash
pnpm typecheck
pnpm test
pnpm pre-commit
```

### 本地打包

```bash
# 当前平台的 unpacked 应用，用于本地验证
pnpm package

# 当前平台的发行安装包
pnpm dist

# 也可以在对应操作系统上显式选择平台
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

产物统一写入 `release/`。macOS 生成 Universal DMG/ZIP，Windows 生成 x64 NSIS
安装程序，Linux 生成 x64 AppImage/DEB。应用的用户可见名称为 **CleanCode**，内部包名仍为
`cleancode`。

推送与 `package.json` 版本一致的 `v*` tag 后，GitHub Actions 会在三个目标系统分别构建、
运行打包后终端冒烟测试，并创建公开的 Preview Pre-release。Preview 尚未使用正式开发者证书：
macOS 使用 ad-hoc 签名且未 notarize，Windows 安装程序未签名，因此操作系统可能显示安全警告。
正式签名完成前，这些产物只作为公开测试版本。

## 当前边界

也需要直接说清楚：CleanCode 现在还是 Preview。它已经能把终端、Agent、分支工作区和可执行工作流组织到一起，但有些边界还没有完全打开。

- 当前可执行积木类型仍以终端为核心，并支持终端依赖流程与终端组合；Preview、HTTP、Test、File 和 Plugin 等独立积木类型仍在路线图中。
- 终端之间的连接只表达启动依赖，不会在节点之间传递标准输出、文件或结构化产物。
- Agent 可以通过 MCP 搭建、编排和检查终端依赖，但暂不能启动、查询或停止工作流。
- 应用退出后，活动工作流和 Agent 终端进程不会自动继续运行；可恢复的终端与上游对话会按各自能力重新连接。
- 当前不支持远程主机、分布式执行或跨项目工作流。
- 插件扩展体系尚未公开，暂不承诺第三方插件兼容性。
- GitHub Releases 中的预构建安装包当前属于未正式签名的 Preview，不是已签名正式发行版。

## 设计原则

这些原则不是装饰性的口号，而是为了保证画布看起来自由，但运行起来仍然可信。

- **画布不是事实来源。** 它只投影领域模型与运行状态。
- **人和 Agent 共享用例。** Agent 不绕过应用边界直接操纵内部实现。
- **工作区隔离优先。** 分支、目录、端口和会话都必须有明确归属。
- **危险操作必须可见。** 改变进程、文件或工作区状态的能力需要审批和审计。
- **失败必须能够解释。** 计划、就绪、端点和错误都应回到用户可理解的对象上。

架构和领域边界详见 [架构文档](./docs/engineering/architecture.md) 与 [上下文地图](./docs/engineering/context-map.md)。

## 文档

- [产品功能与快速上手](./docs/product/feature-guide.md)
- [文档中心](./docs/README.md)
- [UI 契约](./docs/product/ui-contract.md)
- [终端依赖工作流](./docs/contexts/run/terminal-workflow.md)
- [Agent 与会话生命周期](./docs/contexts/agent/agent-session.md)
- [CleanCode 原生 MCP](./docs/contexts/agent/cleancode-mcp.md)
- [开发协作规范](./docs/engineering/development.md)

## 参与贡献

欢迎提交 Issue、讨论和 Pull Request。开始前请阅读 [贡献指南](./CONTRIBUTING.md) 与 [开发协作规范](./docs/engineering/development.md)。

## 许可证

[MIT](./LICENSE)

---

<div align="center">
  <h2>加入 CleanCode 社区</h2>

  <p>分享你搭出来的工作流、Agent 使用方式和 Preview 反馈。</p>

  <img src="./docs/assets/cleancode-qq-group.png" alt="扫码加入 CleanCode QQ 群（群号：186885114）" width="320" />

  <p>
    <strong>QQ 群：186885114</strong><br />
    <sub>打开 QQ 扫码，或搜索群号加入</sub>
  </p>
</div>
