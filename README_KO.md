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
  <sub><a href="./README_ZH.md">简体中文</a> · <a href="./README_ZH_TW.md">繁體中文</a> · <a href="./README.md">English</a> · <strong>한국어</strong> · <a href="./README_JA.md">日本語</a></sub>
</p>

<p align="center">
  <strong>사람과 AI가 함께 일하는 캔버스형 ADE: AI가 도구를 배우고 조작하는 복잡한 일을 맡아, 사용자는 목표와 판단, 직관적인 상호작용에 집중할 수 있습니다.</strong><br />
  하나의 캔버스에서 Agent와 함께 작업하며 진행 상황을 확인하고 필요할 때 직접 조정하세요.
</p>

<h3 align="center"><a href="https://github.com/chen-985211/cleancode/releases"><ins>CleanCode Preview 다운로드 (macOS / Windows / Linux)</ins></a></h3>

<p align="center"><img src="./docs/assets/cleancode-workflow-demo.png" alt="CleanCode 캔버스의 여러 Agent, 터미널 워크플로와 Git 브랜치 작업 공간" width="960" /></p>
<p align="center"><sub>하나의 브랜치 작업 공간에서 여러 Agent와 연결된 터미널 작업을 함께 사용합니다.</sub></p>
<p align="center"><strong>▶ 다중 Agent 협업 데모 (0:39)</strong></p>

https://github.com/user-attachments/assets/9e157258-5604-4da6-83f9-65943c19efc5

<p align="center"><strong>▶ 전체 데모 (2:33, 소리 포함)</strong></p>

https://github.com/user-attachments/assets/cafe373f-97b7-4f8c-b4a4-dfbc88ab26c3

---

## 🧩 CleanCode란?

**CleanCode는 사람과 AI의 협업을 위한 캔버스형 ADE(Agentic Development Environment)입니다.** Agent, 터미널, 프로젝트 작업 공간을 하나의 캔버스에 모아 의도를 표현하고 직접 조작하며 Agent와 함께 개발 및 자동화 작업을 수행할 수 있습니다.

설계는 《생각에 관한 생각》의 시스템 1과 시스템 2에서 영감을 받았습니다. 시스템 1은 빠르고 직관적인 반응을, 시스템 2는 집중이 필요한 분석·계획·추론을 뜻합니다. CleanCode는 이를 사람과 AI의 협업에 적용해 **사람은 시스템 1의 일을, Agent는 시스템 2의 일을 맡습니다.**

- **사람은 직관적인 표현과 직접적인 상호작용에 집중합니다.** 원하는 일과 선호를 설명하고 캔버스에서 관찰·선택·조정하며 목표, 판단과 주요 결정을 직접 관리합니다.
- **Agent는 분석과 계획이 필요한 일을 처리합니다.** 사용할 수 있는 도구와 권한 안에서 기능을 파악하고 도구 사용법을 배우며, 작업을 나누고 단계를 계획하고, 스크립트 작성, 명령 설정, 문제 해결 및 결과 확인을 수행합니다.

작업을 마치려면 먼저 소프트웨어의 기능 위치, 매개변수 설정, 단계 간 연결을 배워야 하는 경우가 많습니다. CleanCode는 이러한 학습과 후속 작업을 Agent가 맡도록 합니다. 작업 공간이 처음이든 익숙하든 목표에서 출발해 결과에 집중하고 언제든 직접 제어할 수 있습니다.

<a id="core-features"></a>

## ✨ 주요 기능

- 🖼️ **캔버스 작업 공간**: Agent, 터미널과 그룹을 한 캔버스에 배치하고 쌓기, 펼치기, 격자 배치 및 자동 정리를 사용합니다.
- 🤖 **다중 Agent 지원**: Codex와 Claude Code를 포함한 33종의 Agent CLI를 사용합니다. 일부 도구는 응답 완료, 입력 대기 또는 승인 필요 시 알림을 보냅니다.
- 🤝 **네이티브 Agent 협업**: CleanCode MCP를 통해 Agent가 캔버스를 조작하고 워크플로를 구성하며 다른 Agent를 생성하고 작업을 할당합니다.
- 🌿 **브랜치 작업 공간**: Git worktree로 여러 변경 사항을 병렬로 작업하며, 각 브랜치에 별도의 캔버스, 터미널 및 Agent 세션을 제공합니다.
- 📝 **Issue 기반 개발**: GitHub Issues를 살펴보고 Issue에 연결된 브랜치 작업 공간을 만들거나 엽니다.
- 🧰 **작업 공간 프리셋**: 프로젝트의 기본 Agent와 터미널 템플릿을 설정해 새 브랜치 작업 공간에 자동으로 추가하고, 선택적으로 템플릿을 실행합니다.
- ⚙️ **자동화 워크플로**: 터미널 명령, 스크립트와 비대화형 AI CLI를 연결해 의존성에 따라 실행하고 각 단계의 상태를 확인합니다.
- 🔌 **포트 관리**: 병렬로 실행하는 서비스에 고정, 우선 또는 자동 할당 포트를 설정하고 실제 주소를 확인합니다.
- 📦 **템플릿과 빠른 실행**: 자주 쓰는 터미널, 워크플로 또는 그룹을 템플릿으로 저장하고 단축키로 작업을 실행합니다.

자세한 내용은 [제품 기능 및 빠른 시작](./docs/product/feature-guide.md)을 참조하세요.

<details open>
<summary>전체 Agent 목록 보기</summary>

CleanCode는 터미널을 기반으로 **33종의 Coding Agent** 실행 설정을 제공하며, 컴퓨터에 설치된 도구를 자동으로 감지해 현재 작업 공간에서 사용할 수 있게 합니다.

다른 명령줄 Agent도 익숙한 도구와 설정을 사용하여 캔버스 터미널에서 직접 실행할 수 있습니다.

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

**익숙한 Agent를 계속 사용하며 하나의 캔버스에서 협업하세요.**

</details>

<a id="quick-start"></a>

## 🚀 빠른 시작

CleanCode를 실행하기 위해 모든 개념을 먼저 이해할 필요는 없습니다. 다음 단계를 따라 시작하세요.

### Preview 다운로드

[GitHub Releases](https://github.com/chen-985211/cleancode/releases)에서 플랫폼에 맞는 설치 파일을 다운로드하세요.

- macOS: Apple Silicon과 Intel을 모두 지원하는 Universal DMG/ZIP.
- Windows: x64 NSIS 설치 프로그램.
- Linux: x64 AppImage/DEB.

> [!WARNING]
> 현재 Preview는 공식 개발자 인증서로 서명되지 않았습니다. 이 저장소의 GitHub Releases에서만 다운로드하고, 같은 릴리스의 `SHA256SUMS.txt`로 패키지를 검증하세요.

앱의 Developer ID 서명과 Apple notarization이 아직 완료되지 않아 macOS가 최초 실행을 차단합니다. `CleanCode.app`을 `/Applications`로 옮기고 출처와 SHA-256 체크섬을 확인한 뒤, 이 앱에 한해서 다운로드 격리 속성을 제거하고 실행할 수 있습니다.

```bash
xattr -dr com.apple.quarantine /Applications/CleanCode.app
open /Applications/CleanCode.app
```

이 명령은 해당 앱의 최초 Gatekeeper 검사를 우회합니다. 대상 경로를 `/Applications`, 다운로드 폴더 또는 홈 폴더처럼 넓은 범위로 바꾸지 마세요. 또는 [Apple 공식 안내](https://support.apple.com/en-asia/102445)에 따라 **시스템 설정 → 개인정보 보호 및 보안**에서 **확인 없이 열기**를 선택하세요.

### 소스 개발 환경 요구 사항

다음 요구 사항은 소스에서 실행하거나 개발에 참여할 때만 적용됩니다. Preview를 다운로드하기 위해 개발 의존성을 설치할 필요는 없습니다.

- Node.js `>= 24`
- pnpm `>= 10`
- macOS, Windows 또는 Linux

### 로컬 실행

```bash
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

### 자주 사용하는 검사

```bash
pnpm typecheck
pnpm test
pnpm pre-commit
```

### 로컬 빌드

```bash
# 로컬 검증을 위한 현재 플랫폼의 압축 해제된 앱
pnpm package

# 현재 플랫폼용 배포 설치 파일
pnpm dist

# 해당 운영체제에서 대상을 명시적으로 선택할 수도 있습니다
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

빌드 결과물은 `release/`에 저장됩니다.

## 📚 문서

- [제품 기능 및 빠른 시작](./docs/product/feature-guide.md)
- [문서 센터](./docs/README.md)
- [아키텍처 가이드](./docs/engineering/architecture.md)
- [컨텍스트 맵](./docs/engineering/context-map.md)
- [UI 계약](./docs/product/ui-contract.md)
- [터미널 의존성 워크플로](./docs/contexts/run/terminal-workflow.md)
- [Agent 및 세션 생명주기](./docs/contexts/agent/agent-session.md)
- [CleanCode 네이티브 MCP](./docs/contexts/agent/cleancode-mcp.md)
- [개발 협업 지침](./docs/engineering/development.md)

## 🤝 기여하기

Issue, 토론과 Pull Request를 환영합니다. 시작하기 전에 [기여 가이드](./CONTRIBUTING.md)와 [개발 협업 지침](./docs/engineering/development.md)을 읽어 주세요.

## 💬 커뮤니티 참여

아래 QR 코드를 스캔하여 CleanCode 커뮤니티에 참여하고 아이디어, 기능 제안이나 문제를 공유해 주세요.

<p align="center"><img src="./docs/assets/cleancode-qq-group.png" alt="CleanCode 커뮤니티 참여 QR 코드 (그룹 번호: 186885114)" width="320" /></p>
<p align="center"><strong>그룹 번호: 186885114</strong><br /><sub>사람과 AI의 협업을 통해 AI 네이티브 운영체제의 가능성을 탐색합니다.</sub></p>
