# 项目与分支工作区生命周期

## 文档地位

本文是当前已实现 Project 上下文的统一维护入口，描述项目登记、分支工作区、Git 绑定、生命周期规则、跨上下文协作和验证入口。

全仓分层、依赖方向和事实来源以[架构文档](../../engineering/architecture.md)为准；用户可见交互以 [UI 契约](../../product/ui-contract.md)为准。

## 能力状态与范围

Project 上下文当前负责：

- 创建或打开本地项目，并保存项目元数据。
- 记住、手动排序和移除最近项目目录，并持久化项目顺序与当前项目选择。
- 维护具有稳定 `workspaceId` 的默认物理工作区与 Git worktree 工作区。
- 创建新分支 worktree、切换当前工作区、归档 worktree。
- 检查真实 Git 状态，并把分支与 worktree 重新同步到项目模型。
- 在归档 worktree、同步失效或目录重绑定的物理工作区、移除项目时，协调对应 Agent 与 Run 运行时。
- 从首次项目读取开始串行同一项目的创建、同步、选择、checkout、归档和移除写事务。

当前不负责合并、变基、解决冲突、删除真实 Git 分支或托管远程仓库。

## 统一语言

| 术语       | 含义                                                                 |
| ---------- | -------------------------------------------------------------------- |
| 项目       | 由稳定 ID、名称、项目根目录和一组分支工作区组成的本地工作对象        |
| 项目登记簿 | 最近打开项目目录的去重、有序列表                                     |
| 当前项目   | 当前工作面使用的唯一项目；属于项目登记簿中的一个项目或为空           |
| 默认工作区 | `workspaceKind = default`、物理目录等于项目根目录的固定工作区        |
| 分支工作区 | `workspaceKind = linked-worktree`、具有独立 worktree 目录的工作区    |
| 当前工作区 | 当前工作面使用的唯一工作区                                           |
| 工作区身份 | 项目内稳定且与目录、显示名、Git 初始化状态和分支无关的 `workspaceId` |
| Git 绑定   | 工作区当前检出的分支元数据；非 Git 项目的默认工作区绑定为 `null`     |
| 同步       | 读取真实 Git 仓库与 worktree 状态，并更新 `Project` 中的工作区快照   |
| 归档工作区 | 删除 worktree 并从项目移除工作区，但不删除对应 Git 分支              |

## 聚合与事实所有权

Project 上下文有两个聚合根：

- `Project`：拥有项目目录、稳定工作区身份、工作区类型、目录、显示名、Git 绑定和当前工作区选择。
- `ProjectRegistry`：拥有最近项目目录列表和当前项目选择；它不复制项目业务状态。

`Project.create` 总是创建一个具有随机稳定 `workspaceId`、`workspaceKind = default`、显示名 `main` 的当前工作区；其目录等于项目目录，初始 Git 绑定为 `null`。打开项目或执行同步后，应用层再根据真实 Git 状态更新绑定与 worktree 列表。`main` 是显示名而不是身份。

## 项目与工作区不变量

1. 当前创建、同步和归档用例始终保留默认工作区；默认工作区不能被归档。
2. 同一项目只能有一个当前工作区；恢复到多个当前项时只保留第一个。
3. `workspaceId` 在项目内唯一且不因 Git 初始化、分支 checkout、显示名或目录元数据更新而改变；Git 分支绑定在项目内唯一。
4. 新建分支工作区后，它成为当前工作区，其他工作区取消当前状态。
5. 默认工作区不能归档；只有绑定 Git 分支的 linked-worktree 工作区可以归档。
6. 归档当前 worktree 后，当前工作区回退到默认工作区。
7. 同步时以真实 worktree 为准清理失效工作区；原当前工作区消失时回退到默认工作区。
8. 项目登记簿忽略空目录、去重，并把最近记住的目录放在最前面。
9. 当前项目必须为空或属于项目登记簿；选择项目不改变登记簿顺序。
10. 移除当前项目时回退到登记簿中的第一个剩余项目；登记簿为空时当前项目为空。
11. 手动排序只能移动已经记住的项目，排序前后的项目集合与当前项目选择必须保持不变。

## Git 工作流

### 创建分支工作区

创建前必须确认当前目录是 Git 仓库、存在当前分支，且目标分支尚不存在。应用层先计算 worktree 目录并通过聚合校验名称与绑定，再调用 Git 端口创建分支 worktree，成功后保存项目。

### 归档分支工作区

归档前必须确认工作区存在、不是默认工作区、绑定了 Git 分支且工作树干净；普通脏工作树必须在任何运行时清理前拒绝。预检通过后，应用层先挂起并排空该目录的 Agent，再次确认工作树干净，随后通过 `WorkspaceAgentLifecyclePort` 取得 Agent attach lease，并通过 `WorkspaceRunLifecyclePort` 阻止新 Run 启动、等待在途启动并硬清理该工作区的终端、Provider 恢复资格/checkpoint、探测器和端口租约。终端的应用退出保留策略不能覆盖这个硬清理。若排空期间出现改动，必须恢复原 Agent、释放运行时 lease，且不得删除 worktree。二次检查通过后才删除并 prune worktree、保存聚合变化。保存成功后 resolve 两类 lease；若 worktree 已删除但 prune 或保存失败，则 quarantine blocker，避免旧界面向已删除目录重新附加或启动 PTY。后续归档重试可识别 quarantine，跳过已经完成的删除并在保存成功后 resolve。对应的 Git 分支继续存在。

Git worktree 是否锁定及锁定原因属于真实 Git 的瞬时状态，不写入 `Project` 快照。cleancode 创建和外部工具创建、随后被同步进项目的 worktree 使用同一归档规则：干净但锁定的 worktree 必须返回 `GIT_WORKTREE_LOCKED`，由界面展示锁定原因并取得“解除锁并归档”的单次显式确认。应用层在 Agent 排空后重新读取锁状态；锁原因变化或新出现未确认的锁时，必须恢复 Agent 并停止归档。

已确认且二次校验仍一致的锁，只允许先执行 `git worktree unlock`，再执行普通 `git worktree remove`。不得用 `--force` 或双重 `-f` 绕过脏工作树或锁保护。若解锁后普通删除失败，必须尽力恢复原锁及其原因，Project 不得保存归档结果，Agent 与 Run lifecycle lease 必须释放；删除已经成功后的 prune 或保存失败仍沿用 quarantine 恢复规则。

### 默认工作区切换分支

默认工作区就是项目根目录对应的物理 worktree。分支只是该物理工作区的可变 Git 绑定，不参与工作区、画布对象或运行时身份，因此 checkout 不得挂起 Agent、停止普通终端、清空 Provider 对话、替换图或清除 renderer 易失状态。

1. 确认目标分支存在且未被其他 worktree 占用。
2. 直接执行普通 Git checkout；未提交改动、冲突和其他安全条件由 Git 自身判定并返回。
3. checkout 成功后只更新默认工作区的 `gitBranch`、显示元数据和当前选择，必须保留原 `workspaceId`。
4. 若 Project 保存失败，尽力 checkout 回原分支；补偿失败必须上报原始失败与补偿失败，不能谎报已提交状态。

分支 checkout 是同一物理工作区内的元数据变更，不获取 Agent/Run lifecycle lease。只有物理工作区被归档、移除或目录发生重绑定时，才需要清理旧运行时 owner。

### 项目写事务与自动同步

`CreateOrOpenProject`、创建/选择工作区、默认目录 checkout、归档、自动 Git 同步、移除项目，以及保存新 Agent 前的工作区作用域验证必须共享同一个 `ProjectWorkspaceTransactionCoordinator`。协调器从每个用例的首次仓储读取开始按项目目录串行，自动同步不得在 checkout 或归档中间缓存旧快照后再覆盖提交结果；Agent 创建只有在该事务内重新确认项目仍被记住且项目 ID、`workspaceId` 与物理目录完整匹配后才能提交。`gitBranch` 只作为启动和显示元数据，不参与稳定作用域校验。

`ProjectRegistry` 是跨项目目录共享的一份整表快照，其 remember/forget/select 读改写必须另行共享全局 `ProjectRegistryTransactionCoordinator`。移除项目同时持有该目录的 workspace transaction 与全局 registry transaction；不同目录的并发移除以及 remember/forget/select 并发都不得用旧登记簿快照覆盖另一项更新。

自动 Git 同步和重新打开项目会以真实 Git/worktree 状态保存 Project。同步按物理目录优先、分支次之匹配已有工作区并保留其 `workspaceId`。只有工作区消失或同一 `workspaceId` 的物理目录变化时，才必须先通过 `WorkspaceRunLifecyclePort` 清理旧 Run 作用域；`gitBranch` 或 `displayName` 单独变化只更新元数据，不得 dispose。一次同步涉及多个旧工作区时，调用方必须通过 `disposeWorkspaces` 在一个项目级 lease 内批量排空，不能逐个持有同项目 lease 形成自等待；批量失败后的启动隔离仍按每个 workspace key 独立保留和解除。只有 Git 适配器权威确认“非仓库”或完整检查成功，才允许保存并通过 Agent/Run lifecycle 端口 resolve 项目 quarantine。Git 命令不可执行、目录不可访问、仓库损坏或安全校验失败必须向上抛出，不能伪装成非 Git 项目并解除隔离。

Renderer 发起自动同步时必须绑定请求开始时的 workbench 快照；响应返回前只要当前 workbench 已被终端图修改、Agent 布局、手动工作区切换或其他动作替换，就丢弃该响应并等待下一轮同步。后台读取不得用陈旧的整份 workbench 覆盖较新的图或当前工作区状态。

Agent 运行时如何按稳定工作区身份复用，见 [Agent 与会话生命周期](../agent/agent-session.md)；Run 的精确作用域、硬清理和端口资源语义见[终端会话生命周期](../run/terminal-session.md)与[本地服务端口治理](../run/service-port-management.md)。

## 状态与持久化

`Project` 与 `ProjectRegistry` 当前通过文件系统仓储保存为版本化 JSON。Git 仓库、分支和 worktree 的真实状态来自 `GitWorkspacePort`，但只有经过用例同步并保存后的 `Project` 才是 cleancode 已提交项目状态。

项目登记簿保存有序项目目录和当前项目目录，不拥有项目名称、工作区或 Git 绑定。手动排序通过“把项目移动到另一项目之前”的相对命令表达，目标为空时移动到末尾；该写事务与 remember、forget、select 共享全局登记簿事务协调器，避免旧整表快照覆盖并发更新。应用启动时优先恢复登记簿中的当前项目；旧版登记簿缺少该字段、已选项目无法加载或选择无效时，回退到首个可加载项目并立即修复登记簿；没有可加载项目时清空当前项目。删除登记项不会删除项目目录、Git 分支或 worktree；删除登记前仍须释放项目内 Agent 与 Run 资源，包括明确保留的 Provider session 和 checkpoint，并把两类 lifecycle lease 持有到登记簿保存完成。保存失败时释放 lease，但已经停止的终端不会自动重启。

## 实现入口

| 层级           | 入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | [`Project.ts`](../../../src/contexts/project/domain/aggregates/Project.ts)、[`ProjectRegistry.ts`](../../../src/contexts/project/domain/aggregates/ProjectRegistry.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Application    | [`CreateOrOpenProjectUseCase.ts`](../../../src/contexts/project/application/use-cases/CreateOrOpenProjectUseCase.ts)、[`SelectCurrentProjectUseCase.ts`](../../../src/contexts/project/application/use-cases/SelectCurrentProjectUseCase.ts)、[`ReorderProjectsUseCase.ts`](../../../src/contexts/project/application/use-cases/ReorderProjectsUseCase.ts)、[`CreateBranchWorkspaceUseCase.ts`](../../../src/contexts/project/application/use-cases/CreateBranchWorkspaceUseCase.ts)、[`ProjectWorkspaceTransactionCoordinator.ts`](../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator.ts)、[`WorkspaceRunLifecyclePort.ts`](../../../src/contexts/project/application/ports/WorkspaceRunLifecyclePort.ts) |
| Git lifecycle  | [`CheckoutMainWorkspaceBranchUseCase.ts`](../../../src/contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase.ts)、[`ArchiveBranchWorkspaceUseCase.ts`](../../../src/contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase.ts)、[`SynchronizeProjectGitStateUseCase.ts`](../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase.ts)                                                                                                                                                                                                                                                                                                                                               |
| Infrastructure | [`GitCliWorkspaceAdapter.ts`](../../../src/contexts/project/infrastructure/filesystem/GitCliWorkspaceAdapter.ts)、[`FileSystemProjectRepository.ts`](../../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRepository.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Platform       | [`projectIpcHandlers.ts`](../../../src/platform/electron-main/projectIpcHandlers.ts)、[`loadRememberedWorkbenchList.ts`](../../../src/platform/electron-main/loadRememberedWorkbenchList.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 验证矩阵

| 层级        | 证明内容                                                                                  | 主要测试                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | 聚合不变量、当前项目、项目排序、创建/归档/切换、Git 同步                                  | [`project.remember-workbenches.spec.ts`](../../../tests/unit/contexts/project/project.remember-workbenches.spec.ts)、[`project.reorder-projects.spec.ts`](../../../tests/unit/contexts/project/project.reorder-projects.spec.ts)、[`project.branch-workspaces.spec.ts`](../../../tests/unit/contexts/project/project.branch-workspaces.spec.ts)、[`project.git-workspace-use-cases.spec.ts`](../../../tests/unit/contexts/project/project.git-workspace-use-cases.spec.ts)                                                                                                                                                    |
| Unit / 协作 | checkout 保留运行态、自动同步串行、归档锁确认与恢复、移除项目及 Agent/Run lifecycle lease | [`project.agent-branch-lifecycle.spec.ts`](../../../tests/unit/contexts/project/project.agent-branch-lifecycle.spec.ts)、[`project.run-lifecycle.spec.ts`](../../../tests/unit/contexts/project/project.run-lifecycle.spec.ts)、[`project.archive-branch-workspace-use-case.spec.ts`](../../../tests/unit/contexts/project/project.archive-branch-workspace-use-case.spec.ts)、[`project.archive-locked-worktree.spec.ts`](../../../tests/unit/contexts/project/project.archive-locked-worktree.spec.ts)、[`project.remember-workbenches.spec.ts`](../../../tests/unit/contexts/project/project.remember-workbenches.spec.ts) |
| Integration | JSON 仓储、当前项目恢复和真实 Git/worktree 适配                                           | [`project.filesystem-registry.spec.ts`](../../../tests/integration/contexts/project/project.filesystem-registry.spec.ts)、[`remembered-workbench-loading.spec.ts`](../../../tests/integration/platform/remembered-workbench-loading.spec.ts)、[`project.filesystem-repository.spec.ts`](../../../tests/integration/contexts/project/project.filesystem-repository.spec.ts)、[`project.git-workspace.spec.ts`](../../../tests/integration/contexts/project/project.git-workspace.spec.ts)                                                                                                                                      |
| Contract    | Git 状态同步 IPC 的输入输出                                                               | [`project.git-state-synchronization-ipc.spec.ts`](../../../tests/contract/contexts/project/project.git-state-synchronization-ipc.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| E2E         | 完整退出并重启后恢复最后选择的项目                                                        | [`project-workspaces.e2e.spec.ts`](../../../tests/e2e/project-workspaces.e2e.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 维护规则

改变当前项目、工作区身份、Git 绑定、归档或当前工作区规则时，必须同步对应聚合、相关用例、测试和本文。新增合并、变基、删除分支等能力前，必须先明确它们是否改变现有聚合边界与失败恢复策略。
