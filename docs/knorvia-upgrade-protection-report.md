# T03 交付报告：升级保护、运行历史与便携数据

2026-09-25。对应《Knorvia Studio 开发任务书与迭代路线》T03。规格先于实现，见 `specs/knorvia-upgrade-protection.md`。

## 基线与环境（真实值）

| 项目                                 | 实际值                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 任务书基线                           | `bcc63b6`（`bcc63b6ff684e8ee9b8070f326d70ac007ece19b`）                                                                                                     |
| 本次实现起点（`git rev-parse HEAD`） | `797a76e5b5d471d62432c2129084a83349dff8b5`（T01 之后）                                                                                                      |
| 版本                                 | `0.8.0-preview.2`（根 `package.json`）                                                                                                                      |
| Node                                 | `v26.3.0`（与 `mise.toml` 固定的 24.14.0 不同，属已知环境偏差）                                                                                             |
| 平台                                 | Windows（`win32`）                                                                                                                                          |
| 工作区状态                           | 本任务开始时 `git status --porcelain` 为空；执行期间其他并发代理在 `creation`/`studio-runtime/workflow`/`ui` 等区域产生改动，本报告只列本任务实际改动的文件 |

## 交付物

| 文件                                                                    | 说明                                                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/knorvia-upgrade-protection.md`                                   | 先写的规格：数据所有权四问、迁移顺序、备份规则、失败状态表、便携规则、验收场景、范围外项                                               |
| `packages/services/src/session/tasksDatabase/sqliteSnapshot.ts`         | 新增：`VACUUM INTO` 一致快照（`sqliteSnapshotPath` / `createSqliteSnapshot` / `restoreSqliteSnapshot`），失败抛 `kind:"backup_failed"` |
| `packages/services/src/studio-runtime/adapters/studioDatabase.ts`       | 接线：版本检查 → 迁移前快照 → 切 WAL → `BEGIN IMMEDIATE`；回滚改为按 `isTransaction` 判定，避免回滚异常覆盖首因                        |
| `packages/services/src/session/tasksDatabase/startup.ts`                | 接线：`kind === "upgrade"` 时在 `BEGIN IMMEDIATE` 之前落快照（在 `acquire` 重试内，遇锁沿用既有等待语义）                              |
| `packages/services/src/session/tasksDatabase/migrations.ts`             | 接线：自持事务的调用方（Repo 直接打开旧库）同样先落快照；新增 `lastAppliedTasksMigrationId`、`createTasksDatabaseSnapshot`             |
| `packages/services/test/fixtures/previous-release-data.json`            | 全新脱敏夹具（示例值，无真实数据/路径/凭据）                                                                                           |
| `packages/services/test/fixtures/generate-previous-release-fixtures.ts` | 夹具生成器（Studio 主库按冻结 v1 表结构写入；任务索引退回 `0001+0002` 账本状态）                                                       |
| `packages/services/test/studio-upgrade-protection.test.ts`              | 11 条验收用例                                                                                                                          |
| `packages/desktop/test/portable-upgrade-preserves-data.test.ts`         | 3 条便携升级用例（含真实 `deliver-portable.ps1` 端到端）                                                                               |
| `docs/knorvia-upgrade-protection-report.md`                             | 本报告                                                                                                                                 |

未改动 `scripts/deliver-portable.ps1`：现有脚本已经做到“只覆盖程序文件 + 交付前后对 `data` 逐文件 SHA-256 比对”（`:57` 的 `/XD` 双向排除、`:61-68` 的比对），Lead 后续的真实交付依赖它，本轮不给它加开关以把回归风险保持为零；改为在本任务的 Node 测试里直接调用该脚本做端到端复核（见下）。

## 实际执行的命令与真实结果

全部在 `D:\tools\knorvia-studio`、Node `v26.3.0` 下执行。

| 命令                                                                                                                                                                                                                           | 真实结果                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --experimental-test-module-mocks --import tsx --test packages/services/test/studio-upgrade-protection.test.ts`                                                                                                           | **pass 11 / fail 0**，`duration_ms 3046.1`                                                                                                                                                                                                                                                                           |
| `node --experimental-test-module-mocks --import tsx --test packages/desktop/test/portable-upgrade-preserves-data.test.ts`                                                                                                      | **pass 3 / fail 0**（含 PowerShell 子用例 2092ms），`duration_ms 2620.3`                                                                                                                                                                                                                                             |
| `node --experimental-test-module-mocks --import tsx --test packages/services/test/studio-message-cursors.test.ts packages/services/test/agent-identity-migration.test.ts packages/services/test/tasks-storage-startup.test.ts` | **pass 9 / fail 0**，`duration_ms 1520.5`                                                                                                                                                                                                                                                                            |
| `node --import tsx packages/services/test/fixtures/generate-previous-release-fixtures.ts <临时目录>`                                                                                                                           | 退出 0，生成两个夹具文件（20,480 / 147,456 字节）                                                                                                                                                                                                                                                                    |
| `pnpm exec oxfmt <本任务代码/夹具/规格文件>`                                                                                                                                                                                   | 退出 0，`Finished in 446ms on 9 files`；补跑 `... specs/knorvia-upgrade-protection.md docs/knorvia-upgrade-protection-report.md` 退出 0，`470ms on 2 files`                                                                                                                                                          |
| `pnpm exec oxfmt --check <本任务全部 10 个文件>`                                                                                                                                                                               | 退出 0，`All matched files use the correct format.`（10 files）                                                                                                                                                                                                                                                      |
| `pnpm exec oxlint <本任务 7 个代码文件>`                                                                                                                                                                                       | `Found 0 warnings and 0 errors.`                                                                                                                                                                                                                                                                                     |
| `pnpm exec tsc -b packages/services/tsconfig.json`                                                                                                                                                                             | **退出 1，共 2 个错误**，全部在 `packages/services/src/creation/creationService.ts:20,21`（并发代理正在改的 creation 模块，`providers.js` 尚未导出 `creationQueryCapability` / `queryCreationProvider`）。与本任务文件相关的错误 **0** 条                                                                            |
| `node scripts/architecture/architecture-check.mjs check`                                                                                                                                                                       | **FAILED：2 条违规 / 基线 0**，均为 `max-file-lines`，位置在 `packages/services/src/creation/creationService.ts`（587 行）与 `packages/services/src/creation/providers.ts`（474 行），都属并发代理的改动。本任务文件 **0** 条违规（尤其 `studioDatabase.ts` 通过 `#src/session/...` 引入快照工具未触发 deep-import） |
| 用 `test:studio` 的环境变量（`KNORVIA_ENV=test`、`KNORVIA_DATA_BASE_DIR=<临时目录>`、`KNORVIA_STORAGE_DIR=<临时目录>/cli`、`TSX_TSCONFIG_PATH=packages/ui/tsconfig.json`）合并运行两个新测试文件                               | **pass 14 / fail 0**，`duration_ms 3285.6`；同时确认 `scripts/test-studio.mjs` 的发现规则会收录这两个文件、并忽略 `test/fixtures/` 目录                                                                                                                                                                              |

旁证：既有用例 `studio-message-cursors.test.ts` 在基线代码下从不产生备份；接线后同一条用例的临时目录里出现了真实备份文件 `db.sqlite.pre-v1.20260925T085629481Z.bak`（102,400 字节），说明 v1→v2 迁移确实先落快照。

### 新用例覆盖的验收场景

1. 上一版本夹具 → 迁移 → 读取 → 关闭 → 重开两次：实体、消息、运行、已完成节点、待审批交互、待处理 steering 逐条 deepEqual；数据根里的 `setting.json` 与工作区文件字节不变；重开不重复备份（幂等）。
2. 迁移不触发任务执行：迁移后 `studio_meta` 只有 `revision`/`sequence`，没有执行者租约；`queuedRuns()` 仍返回排队的运行。
3. 迁移前备份合法：可独立打开、`integrity_check = ok`、`user_version` 仍为 1、实体与 `studio_meta` 与迁移前逐条一致。
4. `user_version = 3` 被拒绝：抛「Studio 数据版本较新」，数据与版本不变、**日志模式仍为 `delete`（未触碰）**、不产生备份。
5. 注入 `BEFORE UPDATE` 触发器强制迁移失败：版本仍为 1、数据与备份都不变；移除触发器后重试成功。
6. 迁移中断：子进程在 `BEGIN IMMEDIATE` 内被强杀（`process.exit` 不提交不关闭），已提交数据保留、未提交的迁移不生效；随后把主库改坏再用 `.bak` + `restoreSqliteSnapshot` 恢复回迁移前状态，且恢复后的库可再次升级。
7. 备份目标不可写（用目录占用备份路径）：抛 `kind:"backup_failed"`、错误信息给出备份路径、原库版本与数据不变、日志模式未变；排除故障后重试成功且备份名为 `studio.sqlite.pre-v1.20260102T030405678Z.bak`。
8. 备份写入抛底层 IO 错误（mock `VACUUM INTO`）：同样停止迁移，`cause` 保留首因；恢复 mock 后重试成功。
9. 新建空库不产生备份（首次安装不留垃圾）。
10. 任务索引升级：备份名 `tasks-index.sqlite.pre-0002_provider_selection.<时间戳>.bak`；迁移后 5 条账本齐全、任务行与时间戳保留、坏 JSON 行不触碰、`provider` 归一为 `knorvia`、`modelId` 归正为 `GLM-5.3`、旧列与提示词原样保留。
11. 便携升级：覆盖程序文件后 `data` 的逐文件 SHA-256、字节数与目录结构完全一致，目标端多出来的数据文件不被删除，构建期自带的 `data` 不扩散；反例对照（不加排除地整目录复制）确实被清单比对检出，证明断言非空；PowerShell 可用时用模拟目录调用真实 `scripts/deliver-portable.ps1`，退出 0 且 `data` 清单不变、`构建校验.json` 中 `dataUnchanged = true`。

## 未执行项（不得当作通过）

- `pnpm typecheck`（仓库级）与 `pnpm lint`（仓库级）、`pnpm fmt:check`（仓库级）：并发代理正在改动 `creation`、`studio-runtime/workflow`、`ui` 等区域，仓库级结果无法归因；只做了上面列出的 scoped 等价检查。`packages/services` 的类型检查有 2 个**他人文件**的错误（见上表）。
- `pnpm test:studio`：任务规则明确禁止本轮运行。
- 真实安装包的便携升级实机验证（解压新构建覆盖旧安装目录、再启动 Electron）：需要 Lead 的打包与交付流水线；本轮的 Windows 端到端只在**模拟目录**上跑通了交付脚本。
- Agent 会话库（`apps/cli/packages/adapters/src/storage/session-store/migration-runner.ts:159-201`）的迁移前备份：不在本任务写入范围。
- 非 Windows 平台的实跑：本机只有 Windows。`packages/desktop/test/portable-upgrade-preserves-data.test.ts` 的前两条用例是纯 Node，跨平台可跑；第三条会在非 Windows 或没有 PowerShell 时 skip（`t.skip`），不会误报通过。
- 覆盖率/性能基线：与本次行为无关，未运行。

## 已知风险

1. **Agent 会话库仍无迁移前备份**（最高优先级遗留）：Studio 主库与任务索引已受保护，`apps/cli` 的会话库仍直接就地迁移。需要单独任务补，不应混入本改动。
2. **任务索引不识别“更新的账本”**：`inspectTasksMigrationKind` 只检查已知 5 条定义。若更新的版本写了 `0006_*`，旧版本构建会判定 `none` 并继续使用新库（“静默降级解释”）。Studio 主库没有这个问题（`user_version >= 3` 直接拒绝）。建议后续在 runner 里增加“账本存在未知 id 即拒绝”。
3. **磁盘将满时启动会失败**（行为变化，属于刻意取舍）：备份需要与库体积相当的可用空间；`VACUUM INTO` 失败即拒绝迁移，因此磁盘将满时应用不再“先迁移再说”，而是启动失败。这是“数据安全优先于可用性”的选择，恢复方式见下。若不希望这样，需要 Lead 明确授权放宽规则。
4. **备份文件不会自动清理**：每升级一次留下一个 `.bak`（Studio 主库与任务索引各一个）。大库长期累积会占空间；清理是用户显式动作，代码不自动删除（自动轮转会让回退点不可预期）。
5. **快照与写锁之间存在窗口**：快照在 `BEGIN IMMEDIATE` 之前完成，理论上另一写入者可在快照之后、取锁之前提交。当前每个库同一时刻只有一个写入者（Studio 走单例仓库，任务索引走启动单飞），窗口不可达；若将来引入多写入者，应把快照移入锁内（`VACUUM INTO` 不能在事务内执行，需要用 SQLite 的备份 API 替代）。
6. **备份路径同毫秒冲突**：同名备份文件存在时顺延 `-1`、`-2`；被目录等非文件占用时直接失败（`backup_failed`），不会悄悄换名掩盖问题。
7. **恢复函数的使用前提**：`restoreSqliteSnapshot` 会先删掉 `-wal`/`-shm` 再覆盖主库，必须在应用完全退出（没有连接）时使用；热恢复会导致未定义结果。
8. **未验证 Node 24 运行时**：`@types/node@25` 声明了 `DatabaseSync.location()`，本机 Node 26.3.0 实测可用；`mise.toml` 固定的 24.14.0 未实跑（该 API 自 Node 23.5 起存在，风险低但未实测）。

## 用户恢复指引（可直接照做）

1. 完全退出应用（确认任务管理器里没有 `Knorvia Studio.exe`）。
2. 找到备份：Studio 主库在 `<dataRoot>\studio\` 下的 `studio.sqlite.pre-v1.<时间戳>.bak`；任务索引在 `<dataRoot>\.knorvia-studio\v2\` 下的 `tasks-index.sqlite.pre-<迁移id>.<时间戳>.bak`。有多个时选最新（文件名里时间戳可排序）。
3. 执行（PowerShell；便携版 `<dataRoot>` 是 exe 同级的 `data`）：

```powershell
$db = '<dataRoot>\studio\studio.sqlite'
Copy-Item -LiteralPath $db -Destination "$db.broken" -Force
Remove-Item -LiteralPath "$db-wal", "$db-shm" -Force -ErrorAction SilentlyContinue
$backup = Get-ChildItem -LiteralPath (Split-Path $db) -Filter 'studio.sqlite.pre-*.bak' |
  Sort-Object Name -Descending | Select-Object -First 1
Copy-Item -LiteralPath $backup.FullName -Destination $db -Force
```

4. 任务索引同理，把 `$db` 换成 `<dataRoot>\.knorvia-studio\v2\tasks-index.sqlite`，过滤 `tasks-index.sqlite.pre-*.bak`。
5. 重新启动应用：它会再次迁移，并生成新的 `.bak`。若迁移本身会再次弄坏数据，请保留 `.bak` 与 `*.broken`，用上一个已发布版本打开恢复后的库，并把问题报回来。
6. 磁盘将满导致 `backup_failed`：先腾出空间（可移动/删除更早的 `.bak` 或 `*.broken`），再启动；不要删除 `studio.sqlite` 本体。

## 回滚说明

- **代码回滚**：本任务改动是增量的。回退 `studioDatabase.ts`、`startup.ts`、`migrations.ts` 三个文件即可回到“无备份直接迁移”的旧行为；`sqliteSnapshot.ts`、夹具与两个测试文件是新增，删除不影响既有路径。
- **数据回滚**：新代码写出的 `.bak` 是普通 SQLite 文件，不被任何产品逻辑读取；即使程序回滚，备份仍可继续用于人工恢复。
- **程序回滚（便携）**：用旧构建覆盖程序文件即可，交付规则保证 `data` 不被替换；若旧的已发布构建比当前数据版本旧（例如回退到 Studio 主库仍是 v1 时代的构建），它会按设计拒绝打开 v2 库，此时用 `studio.sqlite.pre-v1.*.bak` 恢复回 v1。
- **不需要回滚的部分**：`data` 目录、`构建校验.json`、既有迁移账本与 checksum 都未被本任务修改。
