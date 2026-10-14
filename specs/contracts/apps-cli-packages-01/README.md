# apps-cli-packages-01 合同（v1：范围与边界）

`apps/cli/packages/adapters`（含 browser、commands、config 等子目录）与 `apps/cli/packages/browser-use-plugin` 的替换合同。计划书「每包流程」第一步的产物。

- 分支：`contract/apps-cli-packages-01`（从 `origin/main` @ `6ea4cbe7` 检出；替换分支 `replace/apps-cli-packages-01`）
- 工作树：`wt/exec-3-adapters`
- 状态：**v1 范围修订（2026-10-15，Lead 裁决见 issue #149 评论）**：`model/` 移出本包，重切为 `apps-cli-packages-01-model`（见文末第十一节）；其余范围与 v0 一致。

## 一、候选范围与继承分类

数据来源：`licensing/current-files.json`（继承口径）。

| 范围                                                                                                                                                     | 全部文件 | 继承文件 | 说明                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------- |
| `apps/cli/packages/adapters/src`（含 browser、commands、config、context、device、fs、image、logging、mailbox、pdf、provider、skills、storage、workflow） | 295      | **63**   | 其余 232 个已登记 `independent-replacement`（**不动**） |
| `apps/cli/packages/browser-use-plugin`（计划书该行提到的插件）                                                                                           | 16       | **16**   |                                                         |
| **合计**                                                                                                                                                 | **311**  | **79**   | **> 60，按计划书必须重切**                              |

`adapters/src` 的分类分布：`independent-replacement` 232、`upstream-modified` 43、`unreviewed` 12、`upstream-unchanged` 8。

**232 个 `independent-replacement` 文件不动**（AGENTS.md「不重复改已独立候选」；它们已过两道相似度门槛）。

## 二、重切（> 60 个继承文件）

按目录内聚与依赖方向切成两个包，两者都 ≤ 60 个继承文件：

| 包 ID                          | 里程碑 | 范围                                                                                                                                                               | 继承文件 | 要点                                                                                                       |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `apps-cli-packages-01`         | M2     | `apps/cli/packages/adapters/src` · ., commands, config, context, device, fs, image, logging, mailbox, pdf, provider, skills, storage, workflow（**不含 browser**） | **55**   | 配置、git 快照、进程探测、图片压缩、**会话存储迁移**、日志保留、技能扫描                                   |
| `apps-cli-packages-01-browser` | M2     | `apps/cli/packages/adapters/src/browser` + `apps/cli/packages/browser-use-plugin`                                                                                  | **24**   | 浏览器适配（Playwright 命令、会话、快照、页命令）与 browser-use 插件（文档、技能、浏览器客户端、构建脚本） |

拆分依据：`browser` 子目录与 `browser-use-plugin` 是同一功能面（浏览器自动化与它的插件外壳），与其余适配器之间没有共享状态；分开后两包各自 ≤ 60，且不产生循环依赖。**分包总表需要按上表加一行 `apps-cli-packages-01-browser` 并修正 `apps-cli-packages-01` 的范围。**（计划书原行写「53 文件 / 9,861 行」，是 `1ac688f7` 的继承口径；当前实测 `adapters/src` 继承 63 个。）

## 三、本包的继承文件清单（79 个）

`apps-cli-packages-01`（55）：

```text
adapters/src/index.ts                                    u-unchanged
adapters/src/commands/index.ts                           u-modified
adapters/src/commands/roots.ts                           u-modified
adapters/src/config/config-factory.ts                    u-modified
adapters/src/config/config-merger.ts                     u-modified
adapters/src/config/env-config.adapter.ts                u-modified
adapters/src/config/file-config.adapter.ts               u-modified
adapters/src/config/index.ts                             u-modified
adapters/src/config/owners.test.mjs                      unreviewed
adapters/src/config/project-config.adapter.ts            u-modified
adapters/src/config/schema.ts                            u-modified
adapters/src/context/git-snapshot.ts                     u-modified
adapters/src/context/index.ts                            u-modified
adapters/src/device/cli-device-mid.ts                    u-modified
adapters/src/device/process-probe-darwin.ts              u-modified
adapters/src/device/process-probe-linux.ts               u-modified
adapters/src/device/process-probe-shared.ts              u-modified
adapters/src/device/process-probe-windows.ts             u-modified
adapters/src/device/process-probe.ts                     u-modified
adapters/src/fs/file-search-paths.ts                     unreviewed
adapters/src/fs/index.ts                                 u-modified
adapters/src/fs/node-file-io.ts                          unreviewed
adapters/src/fs/node-file-policy.ts                      unreviewed
adapters/src/fs/node-search.ts                           unreviewed
adapters/src/fs/ripgrep-plan.ts                          unreviewed
adapters/src/fs/ripgrep-worker.ts                        unreviewed
adapters/src/fs/text-line-window.ts                      unreviewed
adapters/src/fs/text-metadata.ts                         u-modified
adapters/src/fs/text-range-reader.ts                     u-modified
adapters/src/fs/text-search-lines.ts                     unreviewed
adapters/src/fs/text-search-results.ts                   unreviewed
adapters/src/image/image-budget.ts                       u-modified
adapters/src/image/index.ts                              u-modified
adapters/src/image/jimp-compression.ts                   u-modified
adapters/src/image/jimp-media.ts                         u-modified
adapters/src/image/webp-passthrough.ts                   u-modified
adapters/src/logging/entry.ts                            unreviewed
adapters/src/logging/file-sink.ts                        unreviewed
adapters/src/logging/index.ts                            u-modified
adapters/src/logging/retention.ts                        u-modified
adapters/src/logging/serialize.ts                        u-modified
adapters/src/mailbox/index.ts                            u-modified
adapters/src/pdf/index.ts                                u-modified
adapters/src/provider/index.ts                           u-unchanged
adapters/src/skills/index.ts                             u-modified
adapters/src/skills/roots.ts                             u-modified
adapters/src/skills/scan.ts                              u-modified
adapters/src/storage/session-store.ts                    u-modified
adapters/src/storage/session-store/migrations.ts         u-unchanged
adapters/src/storage/session-store/migrations/0020-provider-model-selection.ts  u-unchanged
adapters/src/storage/session-store/migrations/0021-official-glm-selection.ts    u-unchanged
adapters/src/storage/session-store/migrations/0022-backfilled-session-reasoning.ts u-unchanged
adapters/src/storage/session-store/options.ts            u-unchanged
adapters/src/storage/session-store/rows.ts               u-unchanged
adapters/src/workflow/index.ts                           u-modified
```

`apps-cli-packages-01-browser`（24）：

```text
adapters/src/browser/descriptor.ts            u-modified
adapters/src/browser/executable.ts            u-modified
adapters/src/browser/index.ts                 u-modified
adapters/src/browser/page-command.ts          u-modified
adapters/src/browser/playwright-command.ts    u-modified
adapters/src/browser/request.ts               u-modified
adapters/src/browser/session.ts               u-modified
adapters/src/browser/snapshot.ts              u-modified
browser-use-plugin/.gitignore                 u-unchanged
browser-use-plugin/.knorvia-plugin/plugin.json unreviewed
browser-use-plugin/docs/api.json              u-modified
browser-use-plugin/docs/documents.json        u-modified
browser-use-plugin/docs/LICENSE.txt           unreviewed
browser-use-plugin/docs/overview.md           u-modified
browser-use-plugin/docs/recording.md          u-modified
browser-use-plugin/docs/screenshots.md        unreviewed
browser-use-plugin/docs/workflow.md           u-modified
browser-use-plugin/package.json               u-modified
browser-use-plugin/README.md                  u-modified
browser-use-plugin/scripts/build.mjs          u-modified
browser-use-plugin/skills/control-browser/SKILL.md u-modified
browser-use-plugin/skills/web-gui-tester/SKILL.md  u-modified
browser-use-plugin/src/browser-client.ts      u-modified
browser-use-plugin/tsconfig.json              u-unchanged
```

## 四、风险与要点（写合同时必须覆盖）

- **会话存储迁移必须继续读旧数据**（`storage/session-store.ts` 与 `storage/session-store/{migrations.ts,migrations/00*,options.ts,rows.ts}`）：合同要有**旧写 → 新读 → 新写 → 旧读**往返测试，夹具用脱敏的旧版存储；**数据格式、localStorage 键、数据目录一律不变**（计划书选择 8）。
- **配置层级与优先级**（`config/*`）：system / user / project / session / CLI 参数 / 环境变量，安全相关配置要能追踪来源；`env-config.adapter.ts` 里出现的环境变量名**不得改名**。
- **进程探测的平台差异**（`device/process-probe-{windows,linux,darwin,shared}.ts`）：Windows 与 POSIX 都要过，macOS 写未实机验证。
- **git 快照**（`context/git-snapshot.ts`）：只读命令与失败路径；不得改动 git 状态。
- **图片压缩**（`image/*`：jimp 压缩、webp 直通、预算）：字节预算语义与格式支持不变。
- **日志保留**（`logging/*`）：轮转/保留策略与脱敏；日志里不得出现凭据与用户数据。
- **技术选型红线**：不复制、不改名照搬、不逐行改写；不放宽测试；不推 main、不合并 PR。

## 五、后续步骤（一步一提交）

1. ✅ 范围与继承分类、重切决定（本文）。
2. 导出与调用方清单：`pnpm architecture:context <module-id>` + `pnpm dep:refs --list-exports`（对报「源文件未加载到 project」的路径改用 ts-morph 等价分析并写明方法）。
3. 本包内 knip 确认无用的代码删除（单独提交；`debug` 已在 M0-5 删除，不再删）。
4. `README` / `behavior.md`（B 编号）/ `interface.md` / `callers.md` 初稿。
5. `tests/` + `fixtures/`（含会话存储迁移往返测试）。
6. `stubs/` + 旧门（源码入口与 dist 入口都过）→ `gate-old.json` → `known-differences.md` / `acceptance.md` → PR `contract: apps-cli-packages-01 v1`。

门禁顺序：`fmt` → `fmt:check` → `provenance:report` → `provenance:check` → commit。

## 六、第 3 步：本包内 knip 无用代码复核（结论：不删）

命令：`pnpm knip`（Node 24.14.0）。只看本包范围（`apps/cli/packages/adapters/**`、`apps/cli/packages/browser-use-plugin/**`）的结果：

**knip 的 `Unused files` 与本包相交的只有 1 个**：`apps/cli/packages/adapters/src/config/owners.test.mjs`（继承分类 `unreviewed`）。其余 2 个 `adapters/src/model/*` 不在本包的 55 个继承文件里（属已登记 `independent-replacement`），不动。

**决定：保留，不删。** 依据计划书默认裁决表「不确定某段代码是否还有用 → 保留并写进合同，不删」，以及红线「不跳过、不禁用、不放宽测试」：

- 该文件是**测试文件**，虽然 `scripts/test-studio.mjs` 只收集 `apps/cli/packages/adapters/test`（不含 `src/`），因此当前没有 runner 执行它；knip 判它无入口、全仓 `git grep "owners.test"` 命中 0 次。
- 在替换包里删掉一个测试文件，会与「不放宽测试」的红线产生歧义；把它写进合同、由第 5 步的契约测试覆盖同等行为（配置 owners 的归属与优先级）更稳妥。**到本包重写时由契约测试替代后再删除**，不在第 3 步删。

**knip 报的「无用导出」落在本包 55 个文件里的（同样不删，留待重写时逐符号确认）**：

| 文件                        | 导出                                                                | 类型      |
| --------------------------- | ------------------------------------------------------------------- | --------- |
| `device/process-probe.ts`   | `PROCESS_PROBE_SAMPLE_TIMEOUT_MS`                                   | 常量      |
| `config/config-factory.ts`  | `McpServerConfigSource`、`PluginConfigScope`、`PluginConfigSources` | 类型/接口 |
| `fs/text-search-lines.ts`   | `LineMatches`                                                       | 接口      |
| `fs/text-search-results.ts` | `SearchHits`                                                        | 接口      |
| `fs/file-search-paths.ts`   | `matchesType`                                                       | 函数      |
| `image/image-budget.ts`     | `ImageBudget`                                                       | 类型      |

不删的理由：这些是**导出**，删掉就是改兼容面，而 `interface.md` 是重写的输入；`pnpm dep:refs` 对本包不可用（见第 2 步），无法用工具在符号级确认「全仓无引用」。计划书第 3 步允许删无用导出，但本包选择**保守**：重写时按 `interface.md` 逐个判定，knip 的这一批作为「可以不复现」的候选。

**结论：第 3 步没有可安全删除的文件或导出，本次提交只记录证据与决定，不删任何文件。**

## 七、第 4 步：behavior.md 分批进度

`behavior.md` 已在写，按风险从高到低分批提交（每批一次 commit + push）：

| 批次 | 范围                                                                                         | 条目      | 状态                  |
| ---- | -------------------------------------------------------------------------------------------- | --------- | --------------------- |
| A    | `storage/session-store*`（会话存储迁移，计划书点名）                                         | B1–B17    | **已完成** `2bd3671b` |
| B1   | `config/`：env 解析、作用域优先级、合并语义、`ConfigStore`/`ConfigPortImpl`、项目配置发现    | B18–B27   | **已完成** `cd22bf61` |
| B2   | `config/`：schema、MCP normalization、`config-factory`（provenance）、`owners.test`          | B28–B48   | **已完成** `e76494f7` |
| C    | `config/file-config.adapter.ts`、`context/*`（git 快照与 context barrel）                    | B49–B70   | **已完成** `00a6ff48` |
| D    | `commands/*`、`device/*`（进程探测、deviceMid）、`image/*`（图片压缩）                       | B71–B94   | **已完成** `a7fb063f` |
| D2   | `fs/*`（文件 IO、搜索、ripgrep、文本窗口）、`logging/*`（日志、保留、脱敏）                  | B95–B121  | **已完成** `2b977ba8` |
| E    | 会话存储迁移的夹具与断言组织说明；`mailbox`、`pdf`、`provider`、`skills`、`workflow`、barrel | B122–B134 | **已完成** `860bd3be` |
| F    | `tests/`、`fixtures/`、`stubs/`、`known-differences.md`、`acceptance.md`、`gate-old.json`    | —         | **已完成**（本提交）  |

批次按「先高风险、后外围」推进：B1/B2 覆盖配置（含 `KNORVIA_*` 键名与来源追踪），C/D/D2 覆盖与文件系统、进程、图片、日志打交道的适配器，E 收口会话存储迁移的夹具组织（B17 的往返契约已在批次 A 写出），F 落地契约测试与旧门。编号只追加、不复用、不重排：批次 B2 从 B28 续到 B48（含 `owners.test.mjs` 的覆盖与删除依据条目）。

批次 A 的 17 条覆盖：迁移账本的追加式与不可变约束、0001–0019 各批表结构与索引形状、0020/0021/0022 三条冻结迁移的身份映射与判据、`options.ts`/`rows.ts` 的公开声明、`session-store.ts` barrel 兼容面，以及**旧数据必须继续可读**的往返契约（B17）。

**条目 → 测试对照表**等第 5 步（`tests/`）落地后补进本 README，届时每行给出测试文件与用例名，不留空行。

## 八、条目 → 测试对照表

每个 B 条目至少一个用例；表由 `node specs/contracts/apps-cli-packages-01/tests/build-case-map.mjs` 生成（`--check` 在缺条目时退出码非 0，用来防止对照表出现空行）。

<!-- CASE-MAP:START -->

| 条目 | 测试文件                                                     | 用例                                                                        |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| B1   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B1/B2/B123 迁移账本是追加式、有序、按 checksum 记账的冻结文本               |
| B2   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B1/B2/B123 迁移账本是追加式、有序、按 checksum 记账的冻结文本               |
| B3   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B4   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B5   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B6   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B7   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B8   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B9   | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B10  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）                     |
| B11  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）（另有 1 处）        |
| B12  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）（另有 1 处）        |
| B13  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B3–B13 各批迁移的关键 DDL 形状（0001、0019 与冻结编号）（另有 1 处）        |
| B14  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B14/B15 类型模块与 barrel 的兼容面                                          |
| B15  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B14/B15 类型模块与 barrel 的兼容面                                          |
| B16  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B16/B134 会话存储 barrel 的兼容面                                           |
| B17  | [tests/session-store.test.ts](./tests/session-store.test.ts) | B17/B124 旧写 → 新读 → 新写 → 旧读 往返                                     |
| B18  | [tests/config.test.ts](./tests/config.test.ts)               | B18 环境变量解析：键名映射、数值归一与未知键忽略                            |
| B19  | [tests/config.test.ts](./tests/config.test.ts)               | B19 工具并发配置：默认 10、非法值归一为 0、每次重读                         |
| B20  | [tests/config.test.ts](./tests/config.test.ts)               | B20 作用域优先级：取值来自 ConfigScopePriority 且顺序无关                   |
| B21  | [tests/config.test.ts](./tests/config.test.ts)               | B21 mergeConfigs：浅覆盖、插件并集/逐键、hooks 追加与 Project 丢弃额外市场  |
| B22  | [tests/config.test.ts](./tests/config.test.ts)               | B22 ConfigStore 键值与来源：set 只保留最后一次来源                          |
| B23  | [tests/config.test.ts](./tests/config.test.ts)               | B23 通知顺序与订阅生命周期：key 先于 all、退订后静默、handler 抛错冒泡      |
| B24  | [tests/config.test.ts](./tests/config.test.ts)               | B24 merge(patch) 的判空差异、累积式钩子与异常守护合并                       |
| B25  | [tests/config.test.ts](./tests/config.test.ts)               | B25 ConfigPortImpl 读取与缺省：features 缺省 true、未知 key 逐字消息        |
| B26  | [tests/config.test.ts](./tests/config.test.ts)               | B26 项目配置发现：baseDir、hooks 待信任诊断与 stdio cwd 解析                |
| B27  | [tests/config.test.ts](./tests/config.test.ts)               | B27 config/index.ts 的导出面                                                |
| B28  | [tests/config.test.ts](./tests/config.test.ts)               | B28 配置文件 schema 顶层字段与约束                                          |
| B29  | [tests/config.test.ts](./tests/config.test.ts)               | B29 MCP server 输入归一化                                                   |
| B30  | [tests/config.test.ts](./tests/config.test.ts)               | B30 MCP servers 逐项诊断与部分保留                                          |
| B31  | [tests/config.test.ts](./tests/config.test.ts)               | B31 MCP 三种传输与 OAuth 的 strict 形状                                     |
| B32  | [tests/config.test.ts](./tests/config.test.ts)               | B32 plugins 与额外市场 schema                                               |
| B33  | [tests/config.test.ts](./tests/config.test.ts)               | B33 skills/skill/command 的解析与覆盖映射                                   |
| B34  | [tests/config.test.ts](./tests/config.test.ts)               | B34 插件 id 规范化与别名                                                    |
| B35  | [tests/config.test.ts](./tests/config.test.ts)               | B35 配置文件里的插件别名迁移                                                |
| B36  | [tests/config.test.ts](./tests/config.test.ts)               | B36 配置文件到 RuntimeConfigPatch 的映射与诊断                              |
| B37  | [tests/config.test.ts](./tests/config.test.ts)               | B37 createConfig 装配顺序与来源优先级                                       |
| B38  | [tests/config.test.ts](./tests/config.test.ts)               | B38 项目发现元数据与 UI 来源路径                                            |
| B39  | [tests/config.test.ts](./tests/config.test.ts)               | B39 plugins 来源归属                                                        |
| B40  | [tests/config.test.ts](./tests/config.test.ts)               | B40 MCP 生效表与来源归属                                                    |
| B41  | [tests/config.test.ts](./tests/config.test.ts)               | B41 hooks 来源标记                                                          |
| B42  | [tests/config.test.ts](./tests/config.test.ts)               | B42 配置诊断告警日志：映射、顺序与抛错中断                                  |
| B43  | [tests/config.test.ts](./tests/config.test.ts)               | B43 项目发现三个入口分支                                                    |
| B44  | [tests/config.test.ts](./tests/config.test.ts)               | B44 工作区 hook 运行时根与快照                                              |
| B45  | [tests/config.test.ts](./tests/config.test.ts)               | B45 resolveWorkspaceStorageDir 优先级：env → 最后项目文件（空串也算）→ 默认 |
| B46  | [tests/config.test.ts](./tests/config.test.ts)               | B46 skipUserConfig 与来源元数据                                             |
| B47  | [tests/config.test.ts](./tests/config.test.ts)               | B47 config-factory 导出面：运行时只暴露 2 个函数、内部函数不导出            |
| B48  | [tests/config.test.ts](./tests/config.test.ts)               | B48 owners.test.mjs 的归属行为由本包契约测试覆盖                            |
| B49  | [tests/config.test.ts](./tests/config.test.ts)               | B49 配置路径解析与默认路径                                                  |
| B50  | [tests/config.test.ts](./tests/config.test.ts)               | B50 loadFileConfig 加载、诊断与默认补全                                     |
| B51  | [tests/config.test.ts](./tests/config.test.ts)               | B51 读取时的 CUA 别名迁移与尽力而为落盘                                     |
| B52  | [tests/config.test.ts](./tests/config.test.ts)               | B52 写回路径的读取与原子保存契约                                            |
| B53  | [tests/config.test.ts](./tests/config.test.ts)               | B53 updateUiLocaleInFileConfig 的读写语义                                   |
| B54  | [tests/config.test.ts](./tests/config.test.ts)               | B54 updatePluginEnabledInFileConfig 别名清理与显式取值                      |
| B55  | [tests/config.test.ts](./tests/config.test.ts)               | B55 enablePluginsByDefaultInFileConfig 只补未声明项                         |
| B56  | [tests/config.test.ts](./tests/config.test.ts)               | B56 updatePluginOptionsInFileConfig 基线选择与清理键                        |
| B57  | [tests/config.test.ts](./tests/config.test.ts)               | B57 removePlugin\* 的删除语义与无命中不写                                   |
| B58  | [tests/config.test.ts](./tests/config.test.ts)               | B58 suppressedBuiltins 的登记与移除                                         |
| B59  | [tests/config.test.ts](./tests/config.test.ts)               | B59 file-config 导出面：运行时 12 个函数、内部类型与函数不导出              |
| B60  | [tests/context.test.ts](./tests/context.test.ts)             | B60 git 快照只跑只读命令且失败被吞                                          |
| B61  | [tests/context.test.ts](./tests/context.test.ts)             | B61 仓库快照字段与 dirty/clean 判定                                         |
| B62  | [tests/context.test.ts](./tests/context.test.ts)             | B62 git status 的 2k 截断与平台提示                                         |
| B63  | [tests/context.test.ts](./tests/context.test.ts)             | B63 主分支候选顺序：origin/HEAD → main → master → 兜底 main                 |
| B64  | [tests/context.test.ts](./tests/context.test.ts)             | B64 NodeContextSourceAdapter 的快照装配与请求覆盖                           |
| B65  | [tests/context.test.ts](./tests/context.test.ts)             | B65 detectEnvInfo 的 shell 与版本字段                                       |
| B66  | [tests/context.test.ts](./tests/context.test.ts)             | B66 用户指令发现顺序与合并                                                  |
| B67  | [tests/context.test.ts](./tests/context.test.ts)             | B67 指令内容按字节截断                                                      |
| B68  | [tests/context.test.ts](./tests/context.test.ts)             | B68 项目根标记与项目类型探测                                                |
| B69  | [tests/context.test.ts](./tests/context.test.ts)             | B69/B70 context 导出面：barrel 与 git-snapshot                              |
| B70  | [tests/context.test.ts](./tests/context.test.ts)             | B69/B70 context 导出面：barrel 与 git-snapshot                              |
| B71  | [tests/commands.test.ts](./tests/commands.test.ts)           | B71 默认根发现顺序与优先级                                                  |
| B72  | [tests/commands.test.ts](./tests/commands.test.ts)           | B72 extraRoots 的 ~/ 展开与根对象形状                                       |
| B73  | [tests/commands.test.ts](./tests/commands.test.ts)           | B73 discoverCommands 的扫描、禁用、去重与排序                               |
| B74  | [tests/commands.test.ts](./tests/commands.test.ts)           | B74 目录枚举规则：.md 大小写、非目录根、缺失根与深度上限                    |
| B75  | [tests/commands.test.ts](./tests/commands.test.ts)           | B75 元数据解析、校验与诊断                                                  |
| B76  | [tests/commands.test.ts](./tests/commands.test.ts)           | B76 loadCommand 的查找、截断与正文                                          |
| B77  | [tests/commands.test.ts](./tests/commands.test.ts)           | B77 取消语义：Custom command operation cancelled                            |
| B78  | [tests/commands.test.ts](./tests/commands.test.ts)           | B78 commands 导出面                                                         |
| B79  | [tests/device.test.ts](./tests/device.test.ts)               | B79 进程探测的失败预算与单次截止                                            |
| B80  | [tests/device.test.ts](./tests/device.test.ts)               | B80 sampleProcessTrees 的入口处理与平台分派                                 |
| B81  | [tests/device.test.ts](./tests/device.test.ts)               | B81 sampleProcessGroup 的平台与 PID 约束                                    |
| B82  | [tests/device.test.ts](./tests/device.test.ts)               | B82 共享纯函数与命令契约                                                    |
| B83  | [tests/device.test.ts](./tests/device.test.ts)               | B83 Linux /proc 解析契约                                                    |
| B84  | [tests/device.test.ts](./tests/device.test.ts)               | B84 Windows tasklist CSV 解析                                               |
| B85  | [tests/device.test.ts](./tests/device.test.ts)               | B85 Darwin ps 解析                                                          |
| B86  | [tests/device.test.ts](./tests/device.test.ts)               | B86 device 导出面                                                           |
| B87  | [tests/device.test.ts](./tests/device.test.ts)               | B87 设备标识生成、单飞与落盘                                                |
| B88  | [tests/image.test.ts](./tests/image.test.ts)                 | B88 resizeToFit 的尺寸与直通语义                                            |
| B89  | [tests/image.test.ts](./tests/image.test.ts)                 | B89 prepareForModel 的入口校验与空数据                                      |
| B90  | [tests/image.test.ts](./tests/image.test.ts)                 | B90 原图直通与 WebP 直通                                                    |
| B91  | [tests/image.test.ts](./tests/image.test.ts)                 | B91 图片预算计算与判定                                                      |
| B92  | [tests/image.test.ts](./tests/image.test.ts)                 | B92 媒体类型工具与取消语义                                                  |
| B93  | [tests/image.test.ts](./tests/image.test.ts)                 | B93 压缩策略选择与结果语义                                                  |
| B94  | [tests/image.test.ts](./tests/image.test.ts)                 | B94 image 导出面                                                            |
| B95  | [tests/fs.test.ts](./tests/fs.test.ts)                       | B95 门面错误转换与基础操作                                                  |
| B96  | [tests/fs.test.ts](./tests/fs.test.ts)                       | B96 readTextFile 的编码、行尾与截断                                         |
| B97  | [tests/fs.test.ts](./tests/fs.test.ts)                       | B97 readBinaryFile 的大小上限与短读推进                                     |
| B98  | [tests/fs.test.ts](./tests/fs.test.ts)                       | B98 writeTextFile 的 revision、父目录与原子写                               |
| B99  | [tests/fs.test.ts](./tests/fs.test.ts)                       | B99 readTextFileRange 的选行与流式扫描                                      |
| B100 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B100 listDirectory 的排序与计时                                             |
| B101 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B101 searchFiles 的 glob 遍历、排序与分页                                   |
| B102 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B102 searchText 的引擎选择与降级                                            |
| B103 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B103 glob、类型过滤与排序工具                                               |
| B104 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B104 walk 的递归规则与取消                                                  |
| B105 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B105 ripgrep 参数计划                                                       |
| B106 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B106 ripgrep worker 的超时、取消与错误分类                                  |
| B107 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B107 prefix / bounded / publish 读写原语                                    |
| B108 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B108 错误策略与 revision/大小格式化                                         |
| B109 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B109 编码检测与行尾工具                                                     |
| B110 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B110 TextLineWindow 的行窗口语义                                            |
| B111 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B111 matchContent 与匹配片段                                                |
| B112 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B112 搜索结果截断、解析与失败分类                                           |
| B113 | [tests/fs.test.ts](./tests/fs.test.ts)                       | B113 fs 导出面                                                              |
| B114 | [tests/logging.test.ts](./tests/logging.test.ts)             | B114 NodeFileLogger 的级别门控与写入路径                                    |
| B115 | [tests/logging.test.ts](./tests/logging.test.ts)             | B115 createNodeLoggerFactory 的默认值与调度                                 |
| B116 | [tests/logging.test.ts](./tests/logging.test.ts)             | B116 日志条目字段投影                                                       |
| B117 | [tests/logging.test.ts](./tests/logging.test.ts)             | B117 日志文件追加与失败吞掉                                                 |
| B118 | [tests/logging.test.ts](./tests/logging.test.ts)             | B118 脱敏器与保留键剥离                                                     |
| B119 | [tests/logging.test.ts](./tests/logging.test.ts)             | B119 序列化、console 行与错误链                                             |
| B120 | [tests/logging.test.ts](./tests/logging.test.ts)             | B120 日志保留清理与调度                                                     |
| B121 | [tests/logging.test.ts](./tests/logging.test.ts)             | B121 logging 导出面                                                         |
| B122 | [tests/session-store.test.ts](./tests/session-store.test.ts) | B122 夹具脱敏：只含合成占位值（另有 1 处）                                  |
| B123 | [tests/session-store.test.ts](./tests/session-store.test.ts) | B1/B2/B123 迁移账本是追加式、有序、按 checksum 记账的冻结文本               |
| B124 | [tests/session-store.test.ts](./tests/session-store.test.ts) | B17/B124 旧写 → 新读 → 新写 → 旧读 往返                                     |
| B125 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B125 会话信箱的目录迁移语义                                                 |
| B126 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B126 技能根发现（与 commands 同构，但 ~/ 用真实 homedir）                   |
| B127 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B127 技能目录扫描（异步与同步同结果）                                       |
| B128 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B128 技能元数据解析、发现与加载                                             |
| B129 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B129 PDF 渲染适配器                                                         |
| B130 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B130/B131 工作流 run 侧与定义存储                                           |
| B131 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B130/B131 工作流 run 侧与定义存储                                           |
| B132 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B132/B133 provider 空模块与根 barrel 的导出面                               |
| B133 | [tests/misc.test.ts](./tests/misc.test.ts)                   | B132/B133 provider 空模块与根 barrel 的导出面                               |
| B134 | [tests/session-store.test.ts](./tests/session-store.test.ts) | B16/B134 会话存储 barrel 的兼容面                                           |

<!-- CASE-MAP:END -->

## 九、旧门与桩替换（结果见 `gate-old.json`）

命令（仓库根目录，Node v24.14.0）：

```text
pnpm build:cli-packages
node specs/contracts/apps-cli-packages-01/tests/run-old-gate.mjs --with-stubs
```

| 项                                         | 结果                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 用例数 / 测试文件                          | 118 / 9                                                                                         |
| 源码入口                                   | 118 通过、0 失败、0 跳过                                                                        |
| dist 入口（`KNORVIA_ADAPTERS_ENTRY=dist`） | 118 通过、0 失败、0 跳过                                                                        |
| 预登记差异                                 | 0                                                                                               |
| 断言放宽                                   | 无                                                                                              |
| 桩替换（`stubs/apply.mjs --apply`）        | 0 通过 / 118 失败（`allFail: true`），随后 `--restore`                                          |
| 桩替换时的包级 lint                        | 194 warnings / 1 error（1 个 error 是非本包文件既有的 `max-lines`，warning 全是桩的未使用参数） |

唯一无法通过桩替换变成失败的条目是 B14/B15（`options.ts`/`rows.ts` 是纯类型模块），理由与证据见
`known-differences.md` 第二节；该条目所在的用例仍带行为断言，因此在桩替换下整体失败。

## 十、替换阶段交接

1. **重写按 `GATE-PLAYBOOK.md`**（Lead 汇总）：换模块切法、换控制流形态、换内部数据形状，注释/日志/错误
   文案全部重写，不沿用旧文件边界；纯声明与桶文件按 `interface.md` 剔兼容名后把残留包含率压到 0；
   必要重合（`KNORVIA_*` 键名、`.knorvia-studio`、schema/列名、逐字错误消息）写进 `known-differences.md`
   并给理由与测试。门槛不调。
2. **`interface.md` 是重写的输入**：55 个文件的模块路径与导出签名不得变；新实现内部怎么拆文件自定。
3. **每个新文件 ≤ 400 行**（AGENTS.md），并且不能新增包级 `oxlint src` 的问题（见 `known-differences.md` §三）。
4. **删除顺序**：先用桩替换确认契约测试全部失败（本 PR 已记录），再删旧文件与 `owners.test.mjs`
   （依据 B48），最后跑两道相似度门槛与接入门禁。

## 十一、v1 范围修订：`model/` 移出为独立分包（不在本合同范围的相邻文件）

**依据**：计划书默认裁决表「包太大或依赖成环 → 按依赖重切，单包不超过 60 个文件」。替换阶段实测本包继承数远超上限（model 44 + plugins 33 + mcp 31 + exec 20 + storage 15+），其中 `model/` 整体未开工、边界干净（只被同包内的 provider/exec/workflow 适配层调用，无反向依赖），因此移出（Lead 裁决 2026-10-15，issue #149 评论）。

| 项       | 内容                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 移出范围 | `apps/cli/packages/adapters/src/model/**`（实测 51 个文件，其中继承 44 个，约 6.5k 行）               |
| 新包 ID  | `apps-cli-packages-01-model`（M2，由 Lead 另派线按「每包流程」从选包+合同做起，不与本包并行改同目录） |
| 分包总表 | 替换 PR 描述中补一行：`apps-cli-packages-01-model`，44 继承 / 约 6.5k 行                              |

**调用方与依赖衔接**（保持替换期间包边界稳定）：

1. **模块路径不变**：`model/` 仍是 `apps/cli/packages/adapters` 包内的源码目录（`src/model/…`），新包按就地路径替换，`@knorvia/adapters` 的 `./model` 导出面（`package.json` exports）不动；
2. **包内调用方**：`provider/`、`exec/`、`workflow/` 等适配层通过相对路径 `../model/…` 引用，签名以新包自己的 `interface.md` 为准；本包改写时**不改动**这些引用的模块路径与导出名；
3. **跨包调用方**：`packages/services` 等经 `@knorvia/adapters/model` 公开入口调用，属稳定兼容面，两个包的替换都不改变它；
4. **旧门与契约证据**：`model/` 的相似度计分与登记随新包进行；本包 `gate-old.json`/契约测试（118 用例）不覆盖 `model/`，本次移出**不减少**既有契约面。

（v0 → v1：仅范围边界修订；`behavior.md`/`interface.md`/`callers.md` 的 B 条目与用例映射不变，第十一节为新增。）
