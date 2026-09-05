# 国际化规范

## 文档地位

本文是 cleancode 国际化实现、文案归属和 AI 协作约束的唯一事实来源。语言入口、偏好恢复和切换结果属于 [UI 契约](../product/ui-contract.md)；本文只维护这些行为所需的 locale 与文案实现规则。

当前国际化实现位于 `src/presentation/i18n/`。第一方 UI 文案只允许由 locale catalog 持有，组件和其他表现层模块不得建立第二套文案事实来源。

## 支持范围

应用固定支持以下 locale：

- `zh-CN`：简体中文。
- `en`：英文。

默认 locale、显式偏好持久化、语言菜单交互和切换不变量由 UI 契约定义。新增 locale、复数规则、日期或数字格式化、回退链，或引入第三方国际化框架，都属于需要独立 Spec 的能力变化，不得作为普通文案修改顺手加入。

## 代码结构与事实归属

```txt
src/presentation/i18n/
  catalogs/
    zh-CN/
      index.ts            # 中文 catalog 组装出口与 MessageKey 事实来源
      common.ts           # 应用外壳、通用动作、语言名称和通知
      settings.ts         # 主题与应用设置
      project.ts          # 项目、分支、工作区和侧边栏
      canvas.ts           # 画布、工具栏、小地图和快捷执行
      templates.ts        # 收藏模板
      terminal.ts         # 终端、表单、校验和终端组合
      workflow.ts         # 工作流执行与服务状态
      agent.ts            # Agent、Provider 和审批
      diagnostics.ts      # 问题反馈与诊断导出
      errors.ts           # 用户可见错误映射
    en/
      index.ts            # 英文 catalog 组装出口，完全匹配 MessageKey
      ...                 # 与 zh-CN 同名、同归属的文案分片
  I18nProvider.tsx         # locale 状态与翻译函数注入
  locale.ts               # locale 登记、名称 key、系统语言匹配前缀与默认回退
  localePreference.ts     # 显式偏好持久化与初始语言解析
  messages.ts             # catalog 注册、插值与公共类型
  useI18n.ts               # 表现层读取入口
```

`catalogs/zh-CN/index.ts` 组装后的键集合定义 `MessageKey`。其他语言的每个分片以中文同名分片的键集合做类型检查，组装出口再使用 `MessageCatalog` 做完整性检查。不得另行手工维护一份 key 清单。`messages.ts` 只负责注册和解析，不得重新承载任何语言的文案。

每个 locale 必须只有一个目录和一个 `index.ts` 统一出口，按稳定的界面或文案 owner 拆成同语言分片并显式组装。所有语言使用相同的分片名称和 key 归属；新文案先进入对应 owner 的现有分片，需要新增 owner 时同步建立各语言的同名分片。不得把多个语言写入同一文件，也不得按“基础文案”“运行时文案”等技术阶段建立跨语言混合字典。

`locale.ts` 的 `localeDefinitions` 是支持语言及其菜单名称 key、系统语言匹配前缀的统一登记入口，`Locale` 和菜单顺序由该登记派生。语言菜单和初始语言解析必须消费该登记，不得各自维护“中文，否则英文”等分支。名称文案仍只存在于 catalog 中。系统首选语言匹配与默认回退保持 UI 契约的含义，不得顺手改成扫描全部系统语言或翻译缺失回退链。

## Message key 与插值

Message key 使用稳定语义和点分层级，例如 `terminalForm.save`、`workflow.failureTitle`。key 必须描述用户看到的语义，不得使用组件文件名、DOM 位置、中文原文或 `text1`、`label2` 等序号命名。

所有语言的同一 key 必须使用相同的命名插值变量，例如：

```ts
'approval.targetId': 'ID {id}'
```

组件通过 `t('approval.targetId', { id })` 提供值。变量值属于用户数据或运行时事实时只参与插值，不得被翻译、重写或改变大小写。不得依靠字符串拼接组装句子；不同语言需要不同语序时，应让每个 catalog 持有完整句式。

当前插值只提供命名变量的字面替换。需要复数、选择分支或 locale-aware 格式化时必须先扩展规范、类型和测试，不得把语法规则散落到组件条件分支中。

## 必须进入 catalog 的内容

以下第一方内容必须先定义 MessageKey，再由 `t(...)` 读取：

- JSX 可见文本、菜单项、按钮、标题、空状态和说明。
- `aria-label`、`aria-description`、`title`、`placeholder`、`alt` 等用户可访问文本。
- 表单校验、错误映射、通知、对话框和操作结果反馈。
- 应用生成且会展示给用户的默认名称、状态名称和动作名称。
- 当前界面未直接展示、但已经作为稳定第一方反馈返回给表现层的文案。

不得因为中文和英文恰好相同就直接硬编码；品牌或稳定产品术语仍应进入 catalog，以保持文案归属单一。

## 禁止翻译的内容

以下内容不是第一方文案，不得为了通过门禁而搬进 catalog 或调用 `t(...)`：

- 项目名、分支名、路径、工作区名和用户保存的终端或 Agent 名称。
- 用户输入、启动命令、终端输出、Agent 输出和外部系统返回内容。
- 代码标识符、事件名、状态值、CSS class、测试 ID、协议载荷和错误码。
- 只用于开发诊断且不会呈现给用户的异常消息。

`HTTP`、`HTTPS`、`TCP` 是当前允许直接展示且禁止翻译的协议标识。这个集合由 `scripts/check-i18n.mjs` 和对应测试共同约束；新增例外必须先证明它是稳定机器术语，同步更新本文和门禁测试，不得用通用白名单、忽略注释或改写拼接方式绕过检查。

## AI 修改规则

开发协作 AI 新增或修改用户界面时必须按以下顺序执行：

1. 判断字符串是第一方文案、用户或外部内容，还是稳定机器术语。
2. 第一方文案在所有 locale 的同名 owner 分片中增加同一个语义 key；中文组装出口定义其类型事实。
3. 组件、hook、通知映射和错误映射只使用 `t(...)` 或传入的 `Translate`。
4. 为变化补充最低有效层级的行为测试；修改门禁边界时先写失败的 fixture 单元测试。
5. 运行 `pnpm check:i18n`、相关单元测试和开发协作规范要求的完整质量门禁。

AI 不得在组件中临时硬编码后承诺以后翻译，不得复制已有文案到局部常量，不得通过 Unicode 转义、字符串数组、模板拼接或动态属性规避检查，也不得自行扩大例外集合。

如果门禁误报，必须先确认内容归属。只有确定内容不是第一方文案时，才可以通过有名称的窄规则和正反例测试修正检查器；不得加入文件级跳过、行级忽略或任意字符串 allowlist。

## 静态门禁

`pnpm check:i18n` 执行 `scripts/check-i18n.mjs`，并已纳入 `pnpm pre-commit`。检查器使用 TypeScript AST 扫描所有生产表现层以及 renderer bootstrap，只有 `src/presentation/i18n/catalogs/<locale>/*.ts` 是文案豁免位置。平铺在 `catalogs/` 的旧文件和其他表现层目录自行建立的 `i18n/catalogs/` 不得获得豁免。

当前门禁检查：

- catalog 外的中文字符串字面量。
- 直接渲染的中英文 JSX 文本。
- 用户可见 JSX 属性中的中英文字符串。
- 通知等用户可见对象字段中的中英文字符串。
- 浏览器或桌面对话 API 接收的中英文字符串。

违规输出必须包含文件、行号、规则名称和修复提示，并以非零状态退出。检查器的 fixture 测试位于 `tests/unit/support/check-i18n.spec.ts`。

`tests/unit/presentation/i18n/catalogs.spec.ts` 必须从支持语言登记派生测试矩阵，检查所有组装 catalog 的 key 集合、非空文案和同 key 的插值变量集合。该运行时完整性检查补充 TypeScript 对对象展开属性的检查边界，不得仅比较写死的两个 locale。

静态检查只能证明已覆盖的语法位置，不能证明任意字符串的数据流最终是否可见。因此门禁不能替代代码评审和修改后自检；AI 仍必须检查所有新字符串的事实归属。

## 修改清单

完成 i18n 相关修改前必须确认：

- 所有 locale 的分片结构与 key 归属对称，组装 catalog 的 key 完全一致。
- 第一方文案没有留在 catalog 外。
- 用户、命令和运行时内容没有被翻译或重写。
- 插值变量名称和语义在所有语言中一致。
- 新增不可翻译例外具有文档、窄规则和正反例测试。
- `pnpm check:i18n`、相关测试和完整质量门禁通过。
