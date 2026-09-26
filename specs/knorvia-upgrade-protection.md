# Knorvia Studio 升级保护、运行历史与便携数据

2026-09-25。依据《Knorvia Studio 开发任务书与迭代路线》T03 编写；本规格先于实现。当前仓库 `0.8.0-preview.2`，任务书基线 `bcc63b6`，本次实现起点为 `797a76e`（T01 之后）。

## 背景与现状（已核对源码）

下面带 `:行号` 的引用都指改动前基线 `797a76e` 的 `studioDatabase.ts` / `tasksDatabase/*.ts`；本任务改动后这些行号会平移，实现位置以 `specs/` 之外的源码为准。

- Studio 主库：`packages/services/src/studio-runtime/adapters/studioDatabase.ts` 同时承担 schema、迁移与仓库；路径为 `<dataRoot>/studio/studio.sqlite`（`packages/services/src/studio-runtime/node.ts:51-53`）。基线开库后先设 `busy_timeout=5000`、`journal_mode=WAL`、`synchronous=FULL`（`:20`），再用 `BEGIN IMMEDIATE` 开启事务（`:21`），版本取自 `PRAGMA user_version`，只接受 `0/1/2`（`:23-25`），更高版本直接抛「Studio 数据版本较新，请使用较新版本打开。」。DDL `:26-41`，v1→v2 重排顺序 `:42-52`，`PRAGMA user_version=2` 与 `COMMIT` 在 `:53-58`，失败时 `ROLLBACK` 并关闭连接 `:59-63`。本任务把 `journal_mode=WAL` 移到版本检查与迁移前快照之后，其余顺序不变。
- 任务与运行历史索引：`packages/services/src/session/tasksDatabase/`，路径 `<dataRoot>/.knorvia-studio/v2/tasks-index.sqlite`（`packages/services/src/paths.ts` 的 `getTasksIndexDatabasePath`）。账本 `tasks_schema_migration(id,checksum,time_applied)`，5 条冻结定义 `migrations.ts:48-77`，在 `BEGIN IMMEDIATE`（`:87`）… `COMMIT`（`:138`）内逐条应用；启动路径由 `prepareTasksIndexStorage`（`startup.ts:76-77`）以 `transactionOpen: true` 把已开启的事务交给 runner。checksum 为 sha256（`:108-120`），不匹配抛 `kind:"checksum_mismatch"`（`:115-120`、`:185-192`）。本任务在 `startup.ts` 与 `runTasksDatabaseMigrations` 自持事务的分支里各加一次迁移前快照。
- 今天**没有任何迁移前备份**：Studio 主库、任务索引，以及 Agent 会话库（`apps/cli/packages/adapters/src/storage/session-store/migration-runner.ts:159-201`）都直接在原库上迁移。这是本任务要补的核心缺口。
- 便携数据根：`packages/desktop/src/main/desktopProfile.ts:5` 定义标记 `knorvia-portable.json`；`:15-28` 便携模式下数据根为 `<exe 所在目录>/data`；`:43-49` 导出 `KNORVIA_DATA_BASE_DIR/KNORVIA_HOME/KNORVIA_STORAGE_DIR`。目前唯一的“只覆盖程序文件”保证是 `scripts/deliver-portable.ps1:57` 的 `robocopy /E /XD <source>\data <target>\data` 加 `:61-68` 的哈希比对。
- `scripts/stage1-portable-smoke.mjs:13-15` 在 `<root>/data` 已存在时直接拒绝运行，因此现有冒烟脚本无法验证“在已有数据上升级”。

## 数据所有权四问

1. **谁拥有数据**：用户。`<dataRoot>/studio/studio.sqlite` 与 `<dataRoot>/.knorvia-studio/v2/tasks-index.sqlite` 是用户数据，程序文件不是。便携目录中 `data/` 整体归用户，交付过程对它只有“不触碰”的义务，没有重建、清空或改写的权利。
2. **谁写数据**：同一路径同一时刻只有一个写入者。Studio 主库的写入统一走 `StudioRepository` 事务（`studioDatabase.ts:136-156`），迁移由构造器在 `BEGIN IMMEDIATE` 内完成；任务索引的写入统一走 `TaskIndexRepo`/`AutomationRepo`，迁移由 `prepareTasksIndexStorage` 在 `BEGIN IMMEDIATE` 内完成。升级保护不新增写入者，只在既有写入者之前增加一个只读快照动作。
3. **谁读数据**：迁移代码只读 schema 与账本（`PRAGMA user_version`、`tasks_schema_migration`、`sqlite_master`）来判断“要不要迁移”。备份文件不对产品逻辑开放，只由用户或恢复流程读取。
4. **失败怎么恢复**：任何一步失败都不得让用户数据比升级前更差。迁移本身用事务回滚保证原子性；备份保证“迁移逻辑之外的意外”（进程被杀、断电、磁盘故障、迁移后才发现数据不对）仍有回退点。原始库文件永不被清空、永不被新库覆盖。

## 迁移顺序（不可颠倒）

对每个 SQLite 库固定为：

```text
打开连接 → 设置连接级 PRAGMA（busy_timeout / synchronous）
  → 读版本（Studio: PRAGMA user_version；索引: tasks_schema_migration 账本）
  → 版本过新？→ 抛错，关闭连接，未做任何写操作
  → 需要迁移且库中已有数据？→ 生成迁移前快照（VACUUM INTO）
       备份失败 → 抛错，关闭连接，未做任何写操作
  → PRAGMA journal_mode=WAL
  → BEGIN IMMEDIATE
  → 应用迁移 + 写版本/账本
  → COMMIT
  → （失败）ROLLBACK + 关闭连接；原库保持迁移前状态
```

Studio 主库的 `journal_mode=WAL` 刻意排在快照之后：被拒绝的过新库、以及备份失败时的原库，连日志模式都不会被改动，可以直接判定为“拒绝前零写入”。任务索引的 WAL 由启动流程设置，快照同样在 `BEGIN IMMEDIATE` 之前完成。

要点：

1. **迁移前备份规则**：只要库中已经存在应用表，且本次将要执行迁移（Studio：`user_version < 2`；任务索引：`kind === "upgrade"`），就必须在 `BEGIN IMMEDIATE` **之前**写出一份一致快照。空库（刚创建、没有任何应用表）不产生备份，避免首次安装留垃圾文件。
2. **快照必须来自 SQLite 自身的一致性路径**：使用 `VACUUM INTO`，不得只复制 `.sqlite` 主文件。WAL 生效时主文件不包含最新已提交数据，单独复制得到的不是一致快照。`VACUUM INTO` 在只读事务下把当前已提交状态整体写成一个新的、可直接打开的单文件库，并保留 `user_version`。
3. **可预测命名**：`<db 文件全路径>.pre-<起点标识>.<UTC 时间戳>.bak`。起点标识：Studio 主库为 `v<迁移前 user_version>`；任务索引为最后一次已应用迁移 id（如 `0003_official_glm_selection`），账本缺失时为 `unversioned`。时间戳为 `YYYYMMDDTHHMMSSmmmZ`（去掉了 Windows 文件名不允许的 `:`）。同一毫秒内重复调用时顺延 `-1`、`-2`，绝不覆盖已存在的备份。
4. **备份失败必须停机**：快照写不出（磁盘只读、空间不足、目标不可写）时抛 `kind: "backup_failed"` 的可识别错误，直接停止启动流程。不删除原库、不改版本号、不继续迁移、不用“跳过备份”兜底。
5. **永不覆盖原库为空库**：任何恢复/初始化路径都不得“删掉原库再建新库”。迁移是就地更新；发现版本过新或备份失败时只是拒绝启动，原文件原样留在磁盘上。
6. **永不静默降级解释**：读到高于本版本支持的 `user_version`（Studio `>= 3`）必须报错退出，绝不按低版本语义去解释新数据，也不得写入任何内容。任务索引遇到账本 checksum 不匹配同样报错，不得跳过。
7. **备份不自动删除**：迁移成功后不清理旧备份。用户看到 `.bak` 就是回退点；自动轮转删除会让“回退点”变成不可预期的东西。清理属于用户显式操作，见恢复说明。
8. **备份不是第二种写入路径**：快照文件不参与产品读写，`StudioDatabase`、`TaskIndexRepo` 等不会去读它，避免出现第二个事实来源。

## 失败状态与处理

| 状态                 | 触发条件                                         | 必须的行为                                                                  | 用户可见结果                                       |
| -------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------- |
| 版本过新             | `user_version >= 3`                              | 抛「Studio 数据版本较新」；关闭连接；不写任何字节                           | 提示改用较新版本打开；原库完好                     |
| 备份失败             | 目标目录不可写 / 空间不足 / 备份路径被非文件占用 | 抛 `kind:"backup_failed"`，含库路径与目标备份路径；不进入 `BEGIN IMMEDIATE` | 启动失败并给出可操作路径；原库完好，磁盘恢复可重试 |
| 迁移中断             | 进程在 `BEGIN IMMEDIATE` 与 `COMMIT` 之间被杀    | SQLite 自身回滚未提交事务；下次启动重新迁移                                 | 数据仍是迁移前状态；备份仍在                       |
| 迁移失败             | 迁移 SQL 报错（触发器、约束、磁盘）              | `ROLLBACK` 后抛首因，不被回滚异常覆盖；不写版本号                           | 数据仍是迁移前状态，可修复后重试                   |
| 迁移后才发现数据不对 | 迁移已提交但结果不符合预期                       | 用 `<db>.pre-<起点>.<时间戳>.bak` 覆盖回主库，并先清掉 `-wal`/`-shm`        | 回到迁移前状态                                     |
| 交付覆盖程序文件     | 便携目录升级                                     | 只覆盖程序文件，`data/` 整体排除；覆盖前后对 `data/` 做逐文件 SHA-256 比对  | 数据目录字节级不变                                 |

## 便携数据根规则

1. **程序文件与数据分离**：便携目录 `<root>/` 中，`<root>/data` 是用户数据，其余是程序文件。交付 = 用新构建的程序文件覆盖 `<root>` 下除 `data` 以外的内容，绝不写入、删除或重建 `<root>/data`。
2. **构建产物里的 `data` 不参与交付**：构建目录可能自带一个 `data`（首次启动生成的空库等）。交付时必须双向排除：不复制 `<source>/data`，也不覆盖 `<target>/data`。
3. **只增不删**：程序文件覆盖采用“复制源目录全部程序文件”的语义，不删除目标端多出来的文件；是否清理历史程序文件由交付脚本另行决定，不在本规则内。
4. **可验证**：交付前后对 `<root>/data` 生成清单（相对路径、字节数、SHA-256）并比对，任何一项不同都必须报错停止。程序文件逐一比对 SHA-256 与构建一致。
5. **相对路径必须由遍历得出，不得用字符串长度截取**：调用方给的路径可能是 8.3 短名（Windows CI 的 `%TEMP%` 常是 `C:\Users\RUNNER~1\...`），而 `Get-ChildItem` 返回的 `FullName` 是长名；两者长度不同，`FullName.Substring($Root.Length + 1)` 会算出被截断的相对路径（CI 上曾报出 `ld\Knorvia Studio.exe`）。因此相对路径只能在遍历时由目录名逐级拼接得到；失败诊断必须输出双方完整路径与根，以便区分“找错目标文件”和“内容确实不同”。
6. **Node 层可独立证明**：该规则必须能在不依赖 PowerShell 的情况下用 Node 复现并断言（见验收场景 8），PowerShell 脚本作为真实交付路径另行端到端复核。
7. **`stage1-portable-smoke.mjs` 的边界**：该脚本要求在空 `data` 上运行，只证明“首次启动能创建数据”，不证明升级。升级场景由本轮新增的测试与 `deliver-portable.ps1` 承担，不修改该脚本的拒绝语义。

## 验收场景

1. 用上一版本夹具打开 Studio 主库 → 迁移 → 读取 → 关闭 → 重开两次，第二次开库不再改动任何数据（幂等）：实体、消息、运行、已完成节点、待审批交互与 steering 全部逐条保留。
2. 迁移过程不触发任务执行：迁移后不出现 executor 租约，`run`/`active` 记录集合与状态不变，`queued` 运行仍待执行。
3. 迁移前备份存在，且本身是一份合法的迁移前快照：可独立打开、`PRAGMA integrity_check` 为 `ok`、`user_version` 仍是迁移前版本、数据与迁移前逐条一致。
4. `user_version >= 3` 被拒绝：抛错且原库 `user_version`、表与数据不变，也不产生备份。
5. 强制迁移失败（注入 `BEFORE UPDATE` 触发器）：原库 `user_version` 仍为迁移前值、数据不变、迁移前快照仍在；移除故障后重试成功。
6. 模拟迁移中断：进程在 `BEGIN IMMEDIATE` 内被强杀后原库仍可读、未提交的迁移不生效（已提交数据保留）；主库被写坏时用备份覆盖回主库（同时清掉 `-wal`/`-shm`）后重新打开读到的是迁移前数据与版本，且仍可再次升级。
7. 备份不可写（备份目标被目录占用 / `VACUUM INTO` 失败）：抛出可识别错误，原库不变、无 `user_version` 变更，故障排除后可重试成功。
8. 便携升级：以“程序文件集合 + `data` 排除 + 哈希清单”模型模拟覆盖，`data` 目录逐文件 SHA-256 与目录内容在升级前后完全一致；构建目录自带的 `data` 哨兵文件不出现在目标 `data` 中；程序文件确实被更新为新构建的字节。
9. 便携升级的反例对照：故意把源 `data` 也复制进目标，清单比对必须检出差异（证明第 8 条的检查不是空断言）。
10. 任务索引升级同样先备份：对上一版本索引夹具执行启动迁移，生成的备份可独立打开并保留 `tasks_schema_migration` 账本与业务行。
11. 路径表示反例（真实脚本端到端）：Source 用 8.3 短名、末尾带分隔符、路径含空格与中文时都必须交付成功且 `data` 不变；该卷未启用 8.3 时该用例跳过并说明原因，不得静默通过。
12. 程序文件篡改反例：同长度且与源同时间戳的篡改会被 robocopy 判为“无需复制”，此时哈希校验必须让交付失败，并在诊断中给出相对路径、双方完整路径与两个哈希。若篡改能被复制阶段修复，则该反例不成立，不能当作已覆盖。

## 不在本轮范围

- Agent 会话库（`apps/cli/packages/adapters/src/storage/session-store/`）的迁移前备份。其迁移框架与 Studio 两库不同源，本轮不跨域改动，作为已知风险记入报告。
- 任务索引对未来新增迁移编号的拒绝：账本里出现本条构建不认识的 id（更新的版本写入）时，`inspectTasksMigrationKind` 只看已知 5 条定义，会判定为 `none` 并放行。本轮不修改这一判定（属中心迁移逻辑），作为已知风险记入报告。
- 备份保留策略/自动轮转、压缩与异地副本。
- 便携目录整体回滚（把新程序文件回退到旧版本）——只保证数据不丢，程序文件回退由用户重新解压旧构建完成。
- GUI 中的恢复入口；本轮恢复方式是文件级操作，见 `docs/knorvia-upgrade-protection-report.md`。
