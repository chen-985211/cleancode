# 参与贡献

感谢你帮助建设 cleancode。

cleancode 仍在快速演进，欢迎直接通过 Pull Request 提交范围明确的小型修复。
如果你希望新增产品能力、调整架构或协议，或者进行大范围重构，请先提交功能
建议或发起讨论。这样可以在实现之前共同确认预期行为和职责边界。

## 开始之前

修改仓库前，请先阅读：

- [`AGENTS.md`](AGENTS.md)：根据实际改动确定需要遵循的规则。
- [`docs/README.md`](docs/README.md)：文档职责与导航入口。
- [`docs/engineering/development.md`](docs/engineering/development.md)：
  开发流程和验证要求。
- [`docs/engineering/architecture.md`](docs/engineering/architecture.md)：
  限界上下文、依赖方向和事实来源。

其余上下文、测试、UI、日志或国际化文档，只需按照 `AGENTS.md`
对本次目标路径和行为的路由结果按需阅读。

## 开发环境

环境要求：

- Node.js 24
- pnpm 10.33.0

```sh
git clone https://github.com/chen-985211/cleancode.git
cd cleancode
pnpm install
pnpm dev
```

## 提交改动

1. 每次改动只聚焦一个用户目标或工程问题。
2. 修改行为前，先确认对应的限界上下文和事实来源。
3. 按照开发协作规范执行 Small 或 Large 变更流程。
4. 行为变化需要新增或更新最低有效层级的测试。
5. 稳定规则或当前能力变化时，更新负责该事实的文档。
6. 明确区分当前已经实现的行为与未来路线图候选。

如果存在负责生成文件的脚本，请勿手动编辑生成物。不要绕过应用用例直接修改
已经持久化的积木图、项目、运行时或 Agent 状态。

## 验证

修改生产代码、测试、配置、工程工具或依赖时，运行：

```sh
pnpm pre-commit
```

修改构建、打包、Electron 入口、Vite 配置或运行时装配时，还需要运行：

```sh
pnpm build
```

仅修改 Markdown 文档时，运行：

```sh
pnpm check:docs
pnpm exec prettier --check <本次修改的 Markdown 文件>
git diff --check
```

开发过程中可以使用范围更小的测试快速反馈，但它们不能替代最终要求的完整门禁。

## 提交 Pull Request

Pull Request 应说明：

- 本次解决的用户问题或工程问题。
- 影响的限界上下文和层级。
- 事实来源与重要不变量。
- 已执行的测试和验证命令。
- 已知限制和后续工作。

请勿在同一个 Pull Request 中混入无关的格式化、重构或行为改动。

## 报告缺陷与提出功能建议

请使用仓库提供的 Issue 模板，并尽可能附上最小复现。提交日志或截图前，请移除
访问令牌、私有路径、私有源代码、敏感终端输出及其他敏感信息。

安全漏洞不应通过公开 Issue 报告，请按照
[`SECURITY.md`](SECURITY.md) 私下提交。
