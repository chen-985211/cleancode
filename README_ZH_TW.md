<h1 align="center">
  <img src="./public/app-icon.png" alt="CleanCode" width="96" valign="middle" /> CleanCode
</h1>

<p align="center">
  <a href="https://github.com/chen-985211/cleancode/releases"><img src="https://img.shields.io/github/v/release/chen-985211/cleancode?include_prereleases&amp;sort=semver&amp;display_name=tag&amp;style=flat&amp;label=download&amp;labelColor=555555&amp;color=CB3837&amp;logo=github&amp;logoColor=white" alt="Download latest release" /></a>
  <a href="./docs/contexts/agent/cleancode-mcp.md"><img src="https://img.shields.io/badge/MCP-native%20tools-6366D8.svg?style=flat&amp;labelColor=555555" alt="Native CleanCode MCP tools" /></a>
  <a href="#core-features"><img src="https://img.shields.io/badge/workflow-automation-238636.svg?style=flat&amp;labelColor=555555" alt="Workflow automation" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-F4C430.svg?style=flat&amp;labelColor=555555" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/macOS-000000?style=flat&amp;logo=apple&amp;logoColor=white" alt="macOS" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Windows-0078D6?style=flat" alt="Windows" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Linux-FCC624?style=flat&amp;logo=linux&amp;logoColor=black" alt="Linux" /></a>
</p>

<p align="center">
  <sub><a href="./README_ZH.md">简体中文</a> · <strong>繁體中文</strong> · <a href="./README.md">English</a> · <a href="./README_KO.md">한국어</a> · <a href="./README_JA.md">日本語</a></sub>
</p>

<p align="center">
  <strong>一個面向人機協作的畫布式 ADE：讓 AI 承擔學習與操作工具的複雜性，讓你專注於目標、判斷和直覺互動。</strong><br />
  在同一張畫布上與 Agent 共同推進工作，過程可見，隨時可以直接調整。
</p>

<h3 align="center"><a href="https://github.com/chen-985211/cleancode/releases"><ins>下載 CleanCode Preview（macOS / Windows / Linux）</ins></a></h3>

<p align="center"><img src="./docs/assets/cleancode-workflow-demo.png" alt="CleanCode 畫布中的多 Agent、終端工作流程與 Git 分支工作區" width="960" /></p>
<p align="center"><sub>同一分支工作區中的多個 Agent 與相互連接的終端任務。</sub></p>
<p align="center"><strong>▶ 多 Agent 協作示範（0:39）</strong></p>

https://github.com/user-attachments/assets/9e157258-5604-4da6-83f9-65943c19efc5

<p align="center"><strong>▶ 完整示範（2:33，含聲音）</strong></p>

https://github.com/user-attachments/assets/cafe373f-97b7-4f8c-b4a4-dfbc88ab26c3

---

## 🧩 什麼是 CleanCode？

**CleanCode 是一個面向人機協作的畫布式 ADE（Agentic Development Environment，代理式開發環境）。** 它將 Agent、終端與專案工作區整合在同一張畫布上，讓你表達意圖、直接操作，並與 Agent 共同完成開發及自動化任務。

設計理念借用《快思慢想》中的系統一與系統二：系統一偏向快速、直覺的反應，系統二偏向需要集中注意力的分析、規劃與推理。CleanCode 將這兩個概念應用於人機分工：**人負責系統一的工作，Agent 負責系統二的工作。**

- **人專注於直覺表達與直接互動。** 描述想做的事和偏好，透過畫布觀察、選擇及調整，掌握目標、判斷與關鍵決策。
- **Agent 處理需要分析與規劃的工作。** 在既有工具和權限範圍內，了解可用能力、學習工具用法、拆解任務、規劃步驟、編寫腳本、設定命令、排查問題並檢查結果。

完成任務往往需要先學會軟體：功能在哪裡、如何設定參數、各步驟如何銜接。CleanCode 希望讓 Agent 承擔這些學習和操作成本。無論你是初次使用還是熟悉工作台，都可以從目標出發，專注於結果，並隨時直接操作。

<a id="core-features"></a>

## ✨ 核心功能

- 🖼️ **畫布工作台**：在同一張畫布上操作 Agent、終端與群組，支援堆疊、展開、網格排列和自動整理。
- 🤖 **多 Agent 支援**：使用 Codex、Claude Code 等 33 種 Agent CLI；部分工具可在回覆完成、等待輸入或需要授權時發送通知。
- 🤝 **原生 Agent 協作**：透過 CleanCode MCP 操作畫布、建立工作流程、建立其他 Agent 並指派任務。
- 🌿 **分支工作區**：透過 Git worktree 平行處理多個變更，每個分支都有獨立的畫布、終端與 Agent 工作階段。
- 📝 **Issue 驅動開發**：瀏覽 GitHub Issues，建立或開啟與 Issue 關聯的分支工作區。
- 🧰 **工作區預設**：為專案設定預設 Agent 和終端範本，在建立分支工作區時自動加入畫布，並可選擇自動執行範本。
- ⚙️ **自動化工作流程**：連接終端命令、腳本及非互動式 AI CLI，依照依賴順序執行，並查看各步驟狀態。
- 🔌 **連接埠管理**：為平行執行的服務設定固定、偏好或自動分配的連接埠，並查看實際位址。
- 📦 **範本與快速執行**：將常用終端、工作流程或群組儲存為範本，減少重複設定，並以快捷鍵啟動常用任務。

詳見[產品功能與快速上手](./docs/product/feature-guide.md)。

<details open>
<summary>查看完整 Agent 清單</summary>

CleanCode 以終端為基礎，內建 **33 種 Coding Agent** 的啟動設定，並自動偵測本機已安裝的工具，讓你在目前工作區中使用。

其他命令列 Agent 也可以直接在畫布終端中執行，繼續使用熟悉的工具與設定。

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

**繼續使用熟悉的 Agent，在同一張畫布上協作。**

</details>

<a id="quick-start"></a>

## 🚀 快速開始

如果只想先啟動 CleanCode，不必先了解所有概念，依照以下步驟即可。

### 下載 Preview

從 [GitHub Releases](https://github.com/chen-985211/cleancode/releases) 下載對應平台的安裝套件：

- macOS：Universal DMG/ZIP，支援 Apple Silicon 和 Intel。
- Windows：x64 NSIS 安裝程式。
- Linux：x64 AppImage/DEB。

> [!WARNING]
> 目前的 Preview 尚未使用正式開發者憑證簽署。請只從本儲存庫的 GitHub Releases 下載，並使用同一 Release 中的 `SHA256SUMS.txt` 驗證套件。

由於應用程式尚未完成 Developer ID 簽署及 Apple notarization，macOS 會阻止首次開啟。將 `CleanCode.app` 移至 `/Applications`，確認來源和 SHA-256 校驗值後，可以僅移除此應用程式的下載隔離屬性並啟動：

```bash
xattr -dr com.apple.quarantine /Applications/CleanCode.app
open /Applications/CleanCode.app
```

此命令會繞過該應用程式首次的 Gatekeeper 檢查。請勿將目標替換成 `/Applications`、下載目錄或家目錄等大範圍路徑。也可以依照 [Apple 官方說明](https://support.apple.com/en-asia/102445)，在「系統設定 → 隱私權與安全性」中選擇「仍要開啟」。

### 原始碼開發環境要求

以下要求僅適用於從原始碼執行或參與開發；下載 Preview 前不需要安裝這些開發依賴。

- Node.js `>= 24`
- pnpm `>= 10`
- macOS、Windows 或 Linux

### 本機執行

```bash
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

### 常用檢查

```bash
pnpm typecheck
pnpm test
pnpm pre-commit
```

### 本機建置

```bash
# 目前平台未打包的應用程式，供本機驗證
pnpm package

# 目前平台的發行安裝套件
pnpm dist

# 也可以在對應作業系統上明確選擇目標
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

建置產物輸出至 `release/`。

## 📚 文件

- [產品功能與快速上手](./docs/product/feature-guide.md)
- [文件中心](./docs/README.md)
- [架構指南](./docs/engineering/architecture.md)
- [上下文地圖](./docs/engineering/context-map.md)
- [UI 契約](./docs/product/ui-contract.md)
- [終端依賴工作流程](./docs/contexts/run/terminal-workflow.md)
- [Agent 與工作階段生命週期](./docs/contexts/agent/agent-session.md)
- [CleanCode 原生 MCP](./docs/contexts/agent/cleancode-mcp.md)
- [開發協作規範](./docs/engineering/development.md)

## 🤝 參與貢獻

歡迎提交 Issue、參與討論及提交 Pull Request。開始前請閱讀[貢獻指南](./CONTRIBUTING.md)與[開發協作規範](./docs/engineering/development.md)。

## 💬 加入社群

掃描下方 QR Code 加入 CleanCode 社群，分享想法、提出功能建議或回報問題，一起讓 CleanCode 更好。

<p align="center"><img src="./docs/assets/cleancode-qq-group.png" alt="掃碼加入 CleanCode 社群（群號：186885114）" width="320" /></p>
<p align="center"><strong>群號：186885114</strong><br /><sub>以人機協作為起點，探索 AI 原生作業系統的可能性。</sub></p>
