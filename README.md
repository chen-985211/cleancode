<p align="right">
  <strong>简体中文</strong> · <a href="./README_EN.md">English</a>
</p>

<div align="center">
  <img src="./public/app-icon.png" alt="cleancode" width="112" />

  <h1>cleancode</h1>

  <p><strong>像搭积木一样，DIY 你的 AI 开发工作流。</strong></p>

  <p>组合你的工具，带上你的 Agent，运行属于你的开发现场。</p>

  <p><em>Compose your tools. Bring your agents. Run your workflow.</em></p>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
    <a href="https://github.com/chen-985211/cleancode/releases"><img src="https://img.shields.io/badge/download-Preview-orange.svg" alt="Download Preview" /></a>
    <a href="#环境要求"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg" alt="macOS, Windows and Linux" /></a>
    <a href="#带上你喜欢的-agent"><img src="https://img.shields.io/badge/agents-33%20providers-blueviolet.svg" alt="33 Coding Agent Providers" /></a>
    <a href="#画出来也运行起来"><img src="https://img.shields.io/badge/workflow-visual%20%26%20executable-brightgreen.svg" alt="Visual and executable workflows" /></a>
  </p>

  <p>
    <strong><a href="https://github.com/chen-985211/cleancode/releases">下载 CleanCode Preview（macOS / Windows / Linux）</a></strong>
  </p>
</div>

<p align="center">
  <img src="./docs/assets/cleancode-workflow-demo.png" alt="cleancode 画布中的多 Agent、终端工作流与 Git 分支工作区" />
</p>

---

你的开发方式不应该被某一个 Agent、IDE 或固定脚本定义。

**cleancode 是一个画布优先、本地优先的可执行开发工作空间。** 你可以把终端、服务、依赖关系、Git 分支工作区和喜欢的 Coding Agent 组合到同一个开发现场，再按自己的方式运行它、调整它、继续它。

```txt
feature/auth
├── Agent：Codex
└── Workflow
    ├── Build shared
    └── API server ──> Web app
                   └─> Tests
```

画布不是一张静态流程图。你搭出来的工作流拥有真实命令、启动顺序、就绪条件、运行状态和作用范围。

## 按你的方式搭建

从一块终端开始，也可以搭出一整套开发工作台：

- 用终端积木承载构建、测试、开发服务器和日常命令。
- 把有限任务与长驻服务配置成不同的执行模式。
- 用终端组合整理属于同一部分的工具。
- 用有向连接声明真实依赖，而不只是画一条装饰线。
- 在同一张画布上放置多个固定 Provider 的 Agent 控制台。
- 保存每个分支工作区自己的画布、终端定义和 Agent 身份。
- 把终端、完整流程或组合收藏为项目级或全局模板，再选择放置或放置并运行。
- 把常用终端、流程或组合绑定到 `1` 至 `5` 快捷执行位。

**你的工具、你的 Agent、你的工作流。**

## 带上你喜欢的 Agent

**换 Agent，不必换工作方式。** cleancode 让不同 Coding Agent 进入同一个可见开发现场；终端、服务、分支和运行状态不再围绕某个 Provider 重新组织。

<!-- agent-provider-wall:start -->

cleancode 内建 **33 个 Coding Agent Provider**。它们都可以进入同一个可见、可执行的开发世界，与终端、服务、分支和运行状态一起工作。

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

**33 个主流 Coding Agent，全部可以在 cleancode 中拥有一个真正的开发现场。**

<!-- agent-provider-wall:end -->

## 一个分支，一个完整工作面

为需求创建分支工作区后，cleancode 用独立 Git worktree 隔离它的目录，并让画布、终端、运行作用域和 Agent 会话跟随工作区一起切换。

你可以同时推进 `feature/auth`、`fix/search` 和 `experiment/new-ui`，而不必反复清空终端、确认工作目录或提醒 Agent“我们已经换分支了”。

## 画出来，也运行起来

连接代表真实依赖，配置代表真实执行意图。cleancode 会把当前终端图转换成一次不可变的执行计划：

- 没有上游的任务可以并行启动，下游等待全部直接依赖完成或就绪。
- 有限任务按真实退出码判断成功，长驻服务按输出文本或 TCP 监听判断就绪。
- 服务可以声明固定、优选或自动端口，由运行时分配并注入最终端点。
- 上游失败会明确阻塞后代；停止时按反向依赖顺序清理活动进程。

节点状态、失败原因和实际访问地址都来自运行时。画布展示发生了什么，但不会用静态标签冒充事实。

## 搭一次，随时复用

独立终端、完整依赖流程和终端组合都可以保存为收藏模板。项目模板留在当前项目，全局模板可以放置到任意项目；每次放置都会生成一套新的终端、连接和可选组合，同时保留模板中的配置、依赖和相对布局。选择“放置并运行”还会把新实例的精确作用域交给同一套工作流调度器。

每个工作区还有固定编号 `1` 至 `5` 的快捷执行位。你可以从对象列表、拖动或右键菜单绑定终端、完整流程或组合；点击快捷位只定位画布，按 `Command/Ctrl + 1` 至 `5` 才会运行对应对象。

## 让 Agent 参与搭建

支持原生 cleancode MCP 的 Agent 可以通过稳定工具理解和整理同一个工作空间，而不是直接修改画布内部数据。当前工具覆盖：

- 读取画布、终端积木、连接和执行计划。
- 一次性创建、配置、连接、组合、排列并校验完整的新终端工作流。
- 对既有终端积木进行创建、更新、删除和连接等增量调整。
- 验证依赖并检查启动计划。
- 确定性排列相关终端与完整组合，同时避让画布上的既有对象。

Agent 完整创建的工作流会作为一次完整变更落到画布，再按“逐步搭建”或“并行进入”连续呈现。用户拖动对象、平移或缩放画布时可以立即接管；启用减少动态效果后则直接显示最终布局。

删除积木、解散组合和断开依赖需要在 cleancode 界面中审批；启动与停止工作流仍由人控制。这让 Agent 能够参与搭建，同时让改变开发现场的动作保持可见。

## 从一个需求开始

1. 为需求创建独立分支工作区。
2. 加入你常用的 Coding Agent。
3. 把构建、测试、开发服务器和辅助命令做成终端积木。
4. 配置任务、服务、端口和依赖关系。
5. 把常用终端、流程或组合收藏为模板，或绑定到快捷执行位。
6. 从终端、组合、模板或快捷键运行工作流，在同一张画布上查看结果。

## 快速开始

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

### 环境要求

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

cleancode 正在积极开发，当前版本需要注意：

- 当前可执行积木类型仍以终端为核心，并支持终端依赖流程与终端组合；Preview、HTTP、Test、File 和 Plugin 等独立积木类型仍在路线图中。
- Agent 可以通过 MCP 搭建、编排和检查终端依赖，但暂不能启动、查询或停止工作流。
- 应用退出后，活动工作流和 Agent 终端进程不会自动继续运行；可恢复的终端与上游对话会按各自能力重新连接。
- 插件扩展体系尚未公开，暂不承诺第三方插件兼容性。
- GitHub Releases 中的预构建安装包当前属于未正式签名的 Preview，不是已签名正式发行版。

## 设计原则

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
- [cleancode 原生 MCP](./docs/contexts/agent/cleancode-mcp.md)
- [开发协作规范](./docs/engineering/development.md)

## 参与贡献

欢迎提交 Issue、讨论和 Pull Request。开始前请阅读 [贡献指南](./CONTRIBUTING.md) 与 [开发协作规范](./docs/engineering/development.md)。

## 许可证

[MIT](./LICENSE)

---

<div align="center">
  <h2>加入 CleanCode 社区</h2>

  <p>交流工作流搭建、Agent 使用和开发体验，也欢迎分享反馈与建议。</p>

  <img src="./docs/assets/cleancode-qq-group.png" alt="扫码加入 CleanCode QQ 群（群号：186885114）" width="320" />

  <p>
    <strong>QQ 群：186885114</strong><br />
    <sub>打开 QQ 扫码，或搜索群号加入</sub>
  </p>
</div>
