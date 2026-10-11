# apps-cli-packages-01 合同（v0：范围与边界）

`apps/cli/packages/adapters`（含 browser、commands、config 等子目录）与 `apps/cli/packages/browser-use-plugin` 的替换合同。计划书「每包流程」第一步的产物。

- 分支：`contract/apps-cli-packages-01`（从 `origin/main` @ `6ea4cbe7` 检出）
- 工作树：`wt/exec-3-adapters`
- 状态：**范围已定，需要重切**（见下）。behavior/interface/callers/tests/stubs/旧门待做。

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

| 批次 | 范围                                                                                         | 条目     | 状态                  |
| ---- | -------------------------------------------------------------------------------------------- | -------- | --------------------- |
| A    | `storage/session-store*`（会话存储迁移，计划书点名）                                         | B1–B17   | **已完成** `2bd3671b` |
| B1   | `config/`：env 解析、作用域优先级、合并语义、`ConfigStore`/`ConfigPortImpl`、项目配置发现    | B18–B27  | **已完成** `cd22bf61` |
| B2   | `config/`：schema、MCP normalization、`config-factory`（provenance）、`owners.test`          | B28–B48  | **已完成** `e76494f7` |
| C    | `config/file-config.adapter.ts`、`context/*`（git 快照与 context barrel）                    | B49–B70  | **已完成** `00a6ff48` |
| D    | `commands/*`、`device/*`（进程探测、deviceMid）、`image/*`（图片压缩）                       | B71–B94  | **已完成** `a7fb063f` |
| D2   | `fs/*`（文件 IO、搜索、ripgrep、文本窗口）、`logging/*`（日志、保留、脱敏）                  | B95–B121 | **已完成**（本提交）  |
| E    | 会话存储迁移的夹具与断言组织说明；`mailbox`、`pdf`、`provider`、`skills`、`workflow`、barrel | —        | 待写                  |
| F    | `tests/`、`fixtures/`、`stubs/`、`known-differences.md`、`acceptance.md`、`gate-old.json`    | —        | 待写                  |

批次按「先高风险、后外围」推进：B1/B2 覆盖配置（含 `KNORVIA_*` 键名与来源追踪），C/D/D2 覆盖与文件系统、进程、图片、日志打交道的适配器，E 收口会话存储迁移的夹具组织（B17 的往返契约已在批次 A 写出），F 落地契约测试与旧门。编号只追加、不复用、不重排：批次 B2 从 B28 续到 B48（含 `owners.test.mjs` 的覆盖与删除依据条目）。

批次 A 的 17 条覆盖：迁移账本的追加式与不可变约束、0001–0019 各批表结构与索引形状、0020/0021/0022 三条冻结迁移的身份映射与判据、`options.ts`/`rows.ts` 的公开声明、`session-store.ts` barrel 兼容面，以及**旧数据必须继续可读**的往返契约（B17）。

**条目 → 测试对照表**等第 5 步（`tests/`）落地后补进本 README，届时每行给出测试文件与用例名，不留空行。
