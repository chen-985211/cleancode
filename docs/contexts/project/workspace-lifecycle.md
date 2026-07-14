# 项目与分支工作区生命周期

## 文档地位

本文是当前已实现 Project 上下文的统一维护入口，描述项目登记、分支工作区、Git 绑定、生命周期规则、跨上下文协作和验证入口。

全仓分层、依赖方向和事实来源以[架构文档](../../engineering/architecture.md)为准；用户可见交互以 [UI 契约](../../product/ui.md)为准。

## 能力状态与范围

Project 上下文当前负责：

- 创建或打开本地项目，并保存项目元数据。
- 记住、排序和移除最近项目目录。
- 维护主工作区与 Git worktree 工作区。
- 创建新分支 worktree、切换当前工作区、归档 worktree。
- 检查真实 Git 状态，并把分支与 worktree 重新同步到项目模型。
- 在主工作区切换 Git 分支前协调同一物理目录中的 Agent 运行时。

当前不负责合并、变基、解决冲突、删除真实 Git 分支或托管远程仓库。

## 统一语言

| 术语       | 含义                                                               |
| ---------- | ------------------------------------------------------------------ |
| 项目       | 由稳定 ID、名称、项目根目录和一组分支工作区组成的本地工作对象      |
| 项目登记簿 | 最近打开项目目录的去重、有序列表                                   |
| 主工作区   | 名为 `main`、物理目录等于项目根目录的固定工作区                    |
| 分支工作区 | 绑定一个 Git 分支与独立 worktree 目录的工作区                      |
| 当前工作区 | 当前工作面使用的唯一工作区                                         |
| Git 绑定   | 工作区记录的稳定分支名；非 Git 项目的主工作区绑定为 `null`         |
| 同步       | 读取真实 Git 仓库与 worktree 状态，并更新 `Project` 中的工作区快照 |
| 归档工作区 | 删除 worktree 并从项目移除工作区，但不删除对应 Git 分支            |

## 聚合与事实所有权

Project 上下文有两个聚合根：

- `Project`：拥有项目目录、主工作区、分支工作区、Git 绑定和当前工作区选择。
- `ProjectRegistry`：拥有最近项目目录列表；它不复制项目业务状态。

`Project.create` 总是创建一个名为 `main` 的当前工作区，其目录等于项目目录，初始 Git 绑定为 `null`。打开项目或执行同步后，应用层再根据真实 Git 状态更新绑定与 worktree 列表。

## 项目与工作区不变量

1. 当前创建、同步和归档用例始终保留主工作区；主工作区不能被归档。
2. 同一项目只能有一个当前工作区；恢复到多个当前项时只保留第一个。
3. 工作区名称在项目内唯一，Git 分支绑定在项目内唯一。
4. 新建分支工作区后，它成为当前工作区，其他工作区取消当前状态。
5. 主工作区不能归档；只有绑定 Git 分支的 worktree 工作区可以归档。
6. 归档当前 worktree 后，当前工作区回退到主工作区。
7. 同步时以真实 worktree 为准清理失效工作区；原当前工作区消失时回退到主工作区。
8. 项目登记簿忽略空目录、去重，并把最近记住的目录放在最前面。

## Git 工作流

### 创建分支工作区

创建前必须确认当前目录是 Git 仓库、存在当前分支，且目标分支尚不存在。应用层先计算 worktree 目录并通过聚合校验名称与绑定，再调用 Git 端口创建分支 worktree，成功后保存项目。

### 归档分支工作区

归档前必须确认工作区存在、不是主工作区、绑定了 Git 分支且工作树干净。应用层删除并 prune worktree 后保存聚合变化。对应的 Git 分支继续存在。

### 主工作区切换分支

主工作区直接切换 Git 分支会改变同一物理目录的语义，因此必须：

1. 确认目标分支存在、未被其他 worktree 占用，且主工作区没有未提交改动。
2. 通过 Project 拥有的 `WorkspaceAgentLifecyclePort` 挂起该物理目录中的全部运行中 Agent。
3. 执行 Git checkout；失败时恢复旧 Agent 作用域并继续抛出原错误。
4. 成功后同步工作区绑定并把主工作区设为当前工作区；新分支作用域在后续界面恢复时接管。

Agent 运行时如何按分支隔离，见 [Agent 与会话生命周期](../agent/agent-session.md)。

## 状态与持久化

`Project` 与 `ProjectRegistry` 当前通过文件系统仓储保存为版本化 JSON。Git 仓库、分支和 worktree 的真实状态来自 `GitWorkspacePort`，但只有经过用例同步并保存后的 `Project` 才是 cleancode 已提交项目状态。

项目登记簿只保存项目目录，不拥有项目名称、工作区或 Git 绑定。删除登记项不会删除项目目录、Git 分支或 worktree。

## 实现入口

| 层级           | 入口                                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | [`Project.ts`](../../../src/contexts/project/domain/aggregates/Project.ts)、[`ProjectRegistry.ts`](../../../src/contexts/project/domain/aggregates/ProjectRegistry.ts)                                                                                           |
| Application    | [`CreateOrOpenProjectUseCase.ts`](../../../src/contexts/project/application/use-cases/CreateOrOpenProjectUseCase.ts)、[`CreateBranchWorkspaceUseCase.ts`](../../../src/contexts/project/application/use-cases/CreateBranchWorkspaceUseCase.ts)                   |
| Git lifecycle  | [`CheckoutMainWorkspaceBranchUseCase.ts`](../../../src/contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase.ts)、[`ArchiveBranchWorkspaceUseCase.ts`](../../../src/contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase.ts) |
| Infrastructure | [`GitCliWorkspaceAdapter.ts`](../../../src/contexts/project/infrastructure/filesystem/GitCliWorkspaceAdapter.ts)、[`FileSystemProjectRepository.ts`](../../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRepository.ts)                     |
| Platform       | [`projectIpcHandlers.ts`](../../../src/platform/electron-main/projectIpcHandlers.ts)                                                                                                                                                                             |

## 验证矩阵

| 层级        | 证明内容                                  | 主要测试                                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit        | 聚合不变量、创建/归档/切换、Git 同步      | [`project.branch-workspaces.spec.ts`](../../../tests/unit/contexts/project/project.branch-workspaces.spec.ts)、[`project.git-workspace-use-cases.spec.ts`](../../../tests/unit/contexts/project/project.git-workspace-use-cases.spec.ts)   |
| Unit / 协作 | 主工作区 checkout 与 Agent 挂起、失败恢复 | [`project.agent-branch-lifecycle.spec.ts`](../../../tests/unit/contexts/project/project.agent-branch-lifecycle.spec.ts)                                                                                                                    |
| Integration | JSON 仓储、登记簿和真实 Git/worktree 适配 | [`project.filesystem-repository.spec.ts`](../../../tests/integration/contexts/project/project.filesystem-repository.spec.ts)、[`project.git-workspace.spec.ts`](../../../tests/integration/contexts/project/project.git-workspace.spec.ts) |
| Contract    | Git 状态同步 IPC 的输入输出               | [`project.git-state-synchronization-ipc.spec.ts`](../../../tests/contract/contexts/project/project.git-state-synchronization-ipc.spec.ts)                                                                                                  |

## 维护规则

改变工作区身份、Git 绑定、归档或当前工作区规则时，必须同步 `Project` 聚合、相关用例、测试和本文。新增合并、变基、删除分支等能力前，必须先明确它们是否改变现有聚合边界与失败恢复策略。
