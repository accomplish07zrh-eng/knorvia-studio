# apps-cli-packages-01 行为规格（behavior.md）

版本 v0（分批编写中）· 2026-10-11 · 基线 `6ea4cbe7` · 分支 `contract/apps-cli-packages-01`

本文描述本包 **55 个继承文件**的可观察行为，是重写依据。编号 B1、B2…发布后不重用。每条给出黑盒可验证断言；条目 → 测试对照见 `README.md`。

**状态所有者总览（本批）：** 会话存储的持久化格式归 SQLite 库文件本身；`SQLITE_MIGRATIONS` 只是**冻结的 SQL 文本账本**（无状态）；`session-store.ts` 是纯 barrel（无状态）；`options.ts` / `rows.ts` 是纯声明。

**范围顺序：** 本文件按风险分批写，先 `storage`（会话存储迁移，计划书点名），再 `config`、`device`+`context/git-snapshot`、`fs`、`image`+`logging`、其余小目录。

---

## A. 会话存储迁移（`storage/session-store*`）

### B1 迁移账本是追加式、有序、按 checksum 记账的冻结文本

- 来源：`storage/session-store/migrations.ts`（`SQLITE_MIGRATIONS`）
- 输入：无（模块级常量）。
- 输出：`readonly SqliteMigration[]`，每项 `{appVersion, id, sql}`；`id` 从 `0001_base_session_store` 到 `0022_backfilled_session_reasoning`，**按 id 升序**且互不重复；`sql` 是字符串常量（0020/0021/0022 从同目录 `migrations/00NN-*.ts` 导入）。
- 错误语义：无（纯数据）。
- 时序与并发：模块加载即固定，运行期不修改。
- 幂等：读取多次结果相同（同一引用）。
- 资源释放：无。
- 平台差异：无（SQL 文本与平台无关）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`ids` 严格升序且无重复；`0022` 之后**没有**更多条目；每一项 `appVersion` 非空、`sql` 非空；把数组与自身比较引用相等（模块级常量不被复制）。

### B2 迁移编号与 checksum 的历史不可变约束

- 来源：`storage/session-store/migrations.ts`（`0019_dwf_journal` 的注释即契约）
- 输入：无。
- 输出：**语义约束**——已发布的迁移只能追加，不得改写；`0019_dwf_journal` 在 beta 之后不可再改（runner 按 checksum 记账）；`0019` 是开发期 `0019–0030` 十二条迁移**压成的单一基线**，形状即压缩后终态；`0020` 起为后续迁移留号。
- 错误语义：改写已发布迁移会让已升级库的 checksum 不匹配（由 runner 报错，不在本文件里）。
- 时序与并发：无。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`SQLITE_MIGRATIONS` 里 `0019` 的 `sql` 与 `0020`/`0021`/`0022` 的 `sql` 都是**非空冻结文本**，且分别与 `PROVIDER_MODEL_SELECTION_MIGRATION_SQL`、`OFFICIAL_GLM_SELECTION_MIGRATION_SQL`、`BACKFILLED_SESSION_REASONING_MIGRATION_SQL` **逐字相同**（引用相等或字符串相等）。

### B3 基础表结构与索引（0001、0002）

- 来源：`migrations.ts`（`0001_base_session_store`、`0002_local_setting`）
- 输入：无。
- 输出：`0001` 建 8 张表：`session`（主键 `id`，含 `project_id`/`workspace_id`/`parent_id`/`slug`/`directory`/`path`/`title`/`version`/`share_url`/`summary_*`/`revert`/`permission`/`time_created`/`time_updated`/`time_compacting`/`time_archived`）、`message`（`data` 为 JSON 文本，外键 `session_id` 级联删除）、`part`、`todo`（主键 `(session_id, position)`）、`session_entry`、`permission`（主键 `project_id`）、`input_history`（含 `kind`，索引按 `project_id, time_created desc, id desc`）；`0002` 建 `local_setting`，主键 `(scope, scope_id, namespace, key)`，索引 `(scope, scope_id)` 与 `(namespace, key)`。
- 错误语义：SQL 以 `create table if not exists` / `create index if not exists` 写成，重复执行安全。
- 时序与并发：由 runner 在事务内按序执行（runner 属已独立文件）。
- 幂等：是（`if not exists`）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：对空库跑迁移后，`sqlite_master` 里存在 `session`、`message`、`part`、`todo`、`session_entry`、`permission`、`input_history`、`local_setting` 八张表与上述索引；再跑一次不报错且结构不变。

### B4 权限规则回填到 local_setting（0003）

- 来源：`migrations.ts`（`0003_backfill_permission_local_setting`）
- 输入：既有 `permission` 表行。
- 输出：`insert or ignore into local_setting` 把 `permission(project_id, data)` 写成 `scope='project'、scope_id=project_id、namespace='permission'、key='ruleset'、value=data、schema_version=1`，时间取原行的 `time_created`/`time_updated`；`data is null` 的行**不迁移**。
- 错误语义：`or ignore` 保证重复执行不报错。
- 时序与并发：在 `0001`/`0002` 之后。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：给旧库插两行 `permission`（一行 `data` 非空、一行 `data` 为 null），跑迁移后 `local_setting` 只多出**一行**且 `schema_version = 1`；`permission` 表本身**不被删除**。

### B5 session_target 两次重建（0004、0005）

- 来源：`migrations.ts`（`0004_session_target`、`0005_session_target_accounting`）
- 输入：`0004` 建 `session_target`（`status` 只允许 `active|paused|complete`）；`0005` 建 `session_target_next`（`status` 增加 `budget_limited`，并新增 `token_budget`（可空）、`tokens_used`（默认 0）、`time_used_seconds`（默认 0）），把旧行迁过去（`token_budget` 置 null、计数置 0），再 `drop table session_target` 并 `rename session_target_next → session_target`。
- 错误语义：改名前的数据已复制，`drop` 只删旧表。
- 时序与并发：两条迁移按序。
- 幂等：`0004` 是 `if not exists`；`0005` **不是**幂等（依赖 `0004` 建出的旧表形状），只在未应用过时跑一次。
- 资源释放：`drop` 释放旧表。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：旧库有 `session_target` 一行时，跑 `0005` 后表名仍是 `session_target`、行还在、新增三列默认值正确；`status` 允许 `budget_limited`。

### B6 输入历史附件列（0006）与工作流表族（0007、0008）

- 来源：`migrations.ts`（`0006_input_history_attachments`、`0007_workflow_script_runtime`、`0008_workflow_definition_scope`）
- 输入：无。
- 输出：`0006` 给 `input_history` 加 `attachments text`（可空）；`0007` 给 `session` 加 `task_type text not null default 'interactive'`，并建 `workflow_definition`（`source` 限 `builtin|user`、`trusted`/`enabled` 为 0/1、`script_hash` 非空）、`workflow_run`（`status` 限 `pending|running|paused|completed|failed|cancelled`，含 `stats_json`/`failure_json`/预算列）、`workflow_activity`（`status` 八态，`unique(run_id, call_path, attempt)`）、`workflow_event`（`unique(run_id, sequence)`）、`session_task_link`（`unique(child_session_id)`）；`0008` 给 `workflow_definition` 加 `scope text not null default 'explicit' check(scope in ('builtin','explicit','project','user'))`。
- 错误语义：`alter table add column` 带默认值，旧行自动填默认。
- 时序与并发：按序。
- 幂等：`0007` 的表用 `if not exists`；`alter` 类**不幂等**（重复执行会因列已存在而报错）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：跑完后 `session.task_type` 的旧行为 `'interactive'`；`workflow_definition.scope` 默认 `'explicit'`；`workflow_event` 的 `(run_id, sequence)` 唯一约束存在。

### B7 会话标题元数据与用量可观测表（0009–0013）

- 来源：`migrations.ts`
- 输入：无。
- 输出：`0009` 给 `session` 加 `title_source`（默认 `first_input`，限 `default|first_input|generated|custom`）、`title_message_id`、`time_title_updated`；`0010` 建 `model_usage`、`turn_usage`（主键 `(session_id, turn_id)`）、`tool_usage` 与各自索引，`tool_usage` 有 `unique(session_id, tool_call_id)`；`0011` 给 `session_target` 加 `summary_title`；`0012` 给 `session` 加 `trace_id` 与索引；`0013` 给 `session_target` 加 `active_input_id`、`active_run_started_at`、`active_run_last_seen_at`。
- 错误语义：同上（`alter` 不幂等）。
- 时序与并发：按序。
- 幂等：否（`alter`）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：旧 `session` 行的 `title_source` 为 `'first_input'`；`model_usage.status` 只接受 `running|completed|error|cancelled`；`tool_usage` 的 `unique(session_id, tool_call_id)` 生效（重复插入报约束错）。

### B8 message/part 的 sequence 回填与触发器（0014、0015）

- 来源：`migrations.ts`（`0014_message_part_sequence`、`0015_message_part_sequence_backfill_and_guard`）
- 输入：既有 `message`/`part` 行。
- 输出：`0014` 加 `sequence` 列并按 `row_number() over (partition by … order by time_created, rowid) - 1` 全量回填，然后建 `(session_id, sequence, time_created, id)` 等索引。`0015` **只补 NULL 行**：序号从各 scope 现有 `max(sequence)+1` 起（`coalesce(max(sequence), -1) + row_number()`），排序仍是 `time_created, rowid`；并建两个 `AFTER INSERT` 触发器（`message_sequence_autofill`、`part_sequence_autofill`），当 `new.sequence is null` 时补当前 scope 队尾。
- 错误语义：`0015` 的注释明确了**不能复用 0014 的写法**——`row_number()-1` 按全量编号会与既有 sequence 撞号并把 NULL 行重排到前面；本迁移的增量写法与读路径 fallback（`sequence is null` 排在非空之后）一致，backfill 前后 hydrate 顺序不变。
- 时序与并发：`0015` 在 `0014` 之后；触发器对**新代码路径无效果**（其 sequence 恒非空），只兜底旧二进制写入。
- 幂等：`0015` 的 backfill 是「只处理 `sequence is null`」，重复执行安全；`create trigger if not exists`。
- 资源释放：无。
- 平台差异：无（SQLite ≥ 3.25 的窗口函数；与平台无关）。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：造一个混有非空与 NULL `sequence` 的库，跑 `0015` 后 NULL 行拿到 `max+1` 起的连续序号且**排在既有行之后**（与读路径一致）；插入一条 `sequence` 为 NULL 的 `message` 后触发器把它补成 `max+1`。

### B9 session_input 输入账本与两次 CHECK 放宽（0016–0018）

- 来源：`migrations.ts`（`0016_session_input_ledger`、`0017_session_input_start_now_delivery`、`0018_session_input_failed_status`）
- 输入：无。
- 输出：`0016` 建 `session_input`：`delivery` 限 `guide|queue`，`status` 限 `admitted|promoted|cancelled|discarded`，含 `admitted_sequence`、`promoted_sequence`、`promoted_message_id`、`status_reason`，索引 `(session_id, admitted_sequence)` 与 `(session_id, status)`。`0017` 因 SQLite 不能原地改 CHECK，**重建表**：`delivery` 增加 `startNow`，整表数据搬迁后 `drop` 旧表并重建两个索引（注意：重建时索引**不加 `if not exists`**，因为旧表已删）。`0018` 同样重建表，`status` 增加 `failed`。
- 错误语义：两次重建都保全全部旧行；重建期间依赖 `rename-then-create` 顺序。
- 时序与并发：按序；`0017`（`startNow`）先于 `0018`（`failed`）。
- 幂等：每条只应用一次（重建类迁移重复执行会因表已改名而失败）。
- 资源释放：`drop` 旧表。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：旧库有 `delivery='queue'`、`status='admitted'` 的行时，依次跑 `0017`/`0018` 后该行仍在；`delivery='startNow'` 与 `status='failed'` 可写入；两个索引存在。

### B10 动态工作流 journal 的四张表与索引形状（0019）

- 来源：`migrations.ts`（`0019_dwf_journal`）
- 输入：无。
- 输出：建 `dwf_run`（`status` 限 `pending|running|completed|failed|cancelled`，`caps_max_concurrency` 非空、`spent_tokens` 默认 0；`parent_session_id`/`session_id` 类列**纯 text、不加外键**）、`dwf_actor`（`id` 自增，`unique(run_id, site_id, ordinal)`）、`dwf_node`（`id` 自增，`kind` 限 `ask|world-read|world-run|report|artifact`，`status` 限 `running|completed|failed`，`unique(run_id, site_id, ordinal)`）、`dwf_event`（`id` 自增，`unique(run_id, sequence)`）；索引：`dwf_run_cwd_idx(cwd, time_updated)`、`dwf_actor_run_idx(run_id)`、`dwf_node_run_idx(run_id)`、`dwf_node_artifact_idx(run_id, artifact_id)`、`dwf_event_artifact_idx(run_id, json_extract(payload_json,'$.artifactId'), sequence)`。
- 错误语义：不加外键是刻意的——子代理会话跑在内存 event store 上、没有 `session` 行，而 runner 开着 `pragma foreign_keys = on`，加 FK 会挡掉合法 journal 记录。
- 时序与并发：无。
- 幂等：`create table/index if not exists`；表用 `if not exists`，索引也用。
- 资源释放：无。
- 平台差异：表达式索引需要 SQLite ≥ 3.9。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：四张表存在且 `dwf_run` 无外键约束（`pragma foreign_key_list('dwf_run')` 为空）；`dwf_event_artifact_idx` 存在且是表达式索引；`unique(run_id, sequence)` 生效。

### B11 0020：历史模型选择的身份映射与「不越过错行」

- 来源：`storage/session-store/migrations/0020-provider-model-selection.ts`（`PROVIDER_MODEL_SELECTION_MIGRATION_SQL`）
- 输入：旧库的 `message.data`（用户行的 `model.*`、assistant 行的 `providerID`/`modelID`/`variant` 或 `providerId`/`modelId`/`reasoningLevel`）、`session_entry`（`type='runtime/model_selection'`）、`part.data`（`timeline/model_change` 的 `fromModel`/`toModel`、`subtask` 的 `model`）。
- 输出：一段冻结 SQL，做四件事：① 在没有 `runtime/model_selection` entry 的会话上，用「最后一个明确消息来源」生成 `session_entry`（id 为 `<session_id>:runtime-model-selection`，`on conflict do nothing`）；② 对已有 entry 按同一身份规则补写 `modelSelection`；③ 给未发布的 user 消息补 `modelSelection`；④ 把 assistant 消息的 `providerID`/`modelID`/`variant` 补成 `providerId`/`modelId`/`reasoningLevel`；并把 `part` 上的三个旧字段迁成 `*ModelSelection`。
- 身份映射表（固定，**不可按当前连接改写**）：`builtin:bigmodel→bigmodel-api`、`builtin:zai→zai-api`、`builtin:bigmodel-start-plan→account:bigmodel-start-plan`、`builtin:zai-start-plan→account:zai-start-plan`、`builtin:bigmodel-coding-plan→account:bigmodel-individual-coding-plan`、`builtin:zai-coding-plan→account:zai-individual-coding-plan`；其余 `builtin:` 前缀（不在表内）映射为 **NULL（不迁移）**；非 `builtin:` 原样保留。
- 完整性规则：只取 `row_number() … rank = 1` 的**最后一个**候选，**不越过损坏/明确空选择去找更早的值**；`provider` 与 `model` 都必须是非空文本才生成选择；`options.reasoningLevel` 与 `label` 只在是非空文本时带上。
- 错误语义：`json_valid(data) and json_type(data)='object'` 前置过滤，坏 JSON 行被跳过（不影响启动）。
- 时序与并发：单条迁移。
- 幂等：entry 插入用 `on conflict do nothing`；其余是 `update`，重复执行结果一致。
- 资源释放：无。
- 平台差异：无（依赖 SQLite 的 JSON1 与窗口函数）。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：造旧库（一条 user 消息带 `model.providerID='builtin:zai'`、`model.modelID='x'`），跑迁移后 `session_entry` 出现 `modelSelection.providerId='zai-api'`；把 provider 换成表外的 `builtin:zzz` 时不生成 entry；已有 `runtime/model_selection` entry 的会话不被覆盖（`on conflict do nothing`）。

### B12 0021：官方 GLM 选择的大小写规范化表

- 来源：`storage/session-store/migrations/0021-official-glm-selection.ts`
- 输入：`session_entry` 中 `type='runtime/model_selection'` 且 `modelSelection.providerId` 属于六个 `account:*` 官方 provider 的行。
- 输出：把 `modelSelection.modelId` 按固定 22 项映射从小写改成规范大小写（如 `glm-5.3→GLM-5.3`、`glm-4.7-flashx→GLM-4.7-FlashX`）；不在表内的模型名**原样保留**；provider 不在这六个之内的行**不动**。
- 错误语义：`CASE WHEN json_valid(data) THEN … ELSE 0 END`，坏 JSON 行不影响启动。
- 时序与并发：在 `0020` 之后。
- 幂等：是（映射的幂等：规范名再跑一次仍命中 `WHEN` 分支或 `ELSE` 保持原值）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：`glm-5.3` + `account:zai-start-plan` → `GLM-5.3`；同样的 modelId 配 `bigmodel-api` → 不变；表外模型名 → 不变；坏 JSON 行不报错。

### B13 0022：只给「迁移后未动过」的会话补档位

- 来源：`storage/session-store/migrations/0022-backfilled-session-reasoning.ts`
- 输入：`message`（最后一个 user 行的 `modelSelection`）、`session_entry`（`runtime/model_selection`）、`session`、`schema_migration`（`id='0020_provider_model_selection'` 的 `time_applied`）。
- 输出：只对满足全部条件的 entry 写 `modelSelection.options.reasoningLevel`：entry 的 `id = session_id || ':runtime-model-selection'`、`entry.time_updated <= 0020.time_applied`、`session.time_updated <= 0020.time_applied`（**未被此后修改过**）、entry 上四个「新字段」全为 NULL 而两个 `modelSelection` 字段是非空文本、且与最后一个 user 行的 provider/model（按 0020 的同一映射规范化后）**相等**；档位取 user 行的 `options.reasoningLevel`（必须是非空文本）。
- 错误语义：坏 JSON 用 `'{}'` 兜底参与判断，不报错。
- 时序与并发：在 `0021` 之后。
- 幂等：是（写入后再跑一次条件不再满足）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：SQLite 库。
- 日志级别：无。
- 可测断言：造「0020 之后未动过」的 entry + 同模型同 provider 的 user 行带档位 → 档位被写入；把 `session.time_updated` 改成晚于 `0020.time_applied` → 不写入；模型不匹配 → 不写入。

### B14 `options.ts` 的公开选项与调试计数

- 来源：`storage/session-store/options.ts`
- 输入：`SqliteSessionStoreOptions`（`dbPath?`、`forkCommitFaultAt?`、`startupLockTimeoutMs?`）。
- 输出：`forkCommitFaultAt` 的类型是七个阶段 `afterChild|afterMessages|afterGoal|afterEntries|afterInput|afterCommandFact|beforeCommit` 之一，**仅供事务原子性测试，生产调用不得设置**；`startupLockTimeoutMs` 仅供启动锁等待边界测试，生产用默认值；`SessionStoreDebugCounts` 是 13 个计数字段：`sessions`、`messages`、`parts`、`todos`、`targets`、`sessionEntries`、`permissions`、`localSettings`、`schemaMigrations`、`inputHistory`、`modelUsage`、`toolUsage`、`turnUsage`。
- 错误语义：类型层约束。
- 时序与并发：无。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：编译期断言这 13 个字段都required；`forkCommitFaultAt` 的七个字面量齐全（用 `satisfies` 或类型测试文件锁定）。

### B15 `rows.ts` 的行类型就是持久化格式

- 来源：`storage/session-store/rows.ts`
- 输入：无。
- 输出：`SessionRow`（含 `workspace_id`/`parent_id`/`trace_id`/`task_type`/`title_source`/`title_message_id`/`time_title_updated` 等可空列）、`MessageRow`（`sequence: number | null`）、`PartRow`（`sequence: number | null`）、`SessionEntryRow`、`TodoRow`、`PermissionRow`、`LocalSettingRow`、`SchemaMigrationRow`、`InputHistoryRow`（`attachments: string | null`）。
- 错误语义：类型层。
- 时序与并发：无。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：这些接口的**字段名与可空性**与 `migrations.ts` 建出的列一一对应（用脚本比对列名集合，不靠目测）；`MessageRow.sequence` 与 `PartRow.sequence` 必须允许 `null`（旧库仍有 NULL 的历史可能）。

### B16 `session-store.ts` 是兼容面 barrel

- 来源：`storage/session-store.ts`
- 输入：无。
- 输出：值导出 `createSqliteSessionStore`、`getDefaultSessionDbPath`、`openStartupSqliteSessionStore`、`SqliteSessionStore`、`createDwfJournalStore`、`SqliteSessionMigrationError`；类型导出 `DwfArtifactItem`、`DwfArtifactItemsQuery`、`DwfListRunsQuery`、`DwfNodeStatusCounts`、`DwfRunIntrospectionQueries`、`DwfRunDetailRow`、`DwfRunListItem`、`DwfRunSessionListItem`、`DwfRunSessionRow`、`DwfRunTimestamps`、`DwfWorldNodeRow`、`SqliteSessionMigrationErrorKind`、`SqliteSessionMigrationErrorOptions`、`SessionStoreDebugCounts`、`SqliteSessionStoreOptions`、`AsyncSqliteMigrationOptions`、`SqliteMigrationProgress`。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：上述 6 个值导出与 17 个类型导出逐个存在（编译期引用 + 运行时检查值导出的 `typeof`）；`storage/session-store.ts` 的实现体只含 re-export（不含本地逻辑）。

### B17 旧数据必须继续可读（会话存储迁移的往返契约）

- 来源：本批全部 `storage/session-store*` 文件 + 计划书选择 8
- 输入：脱敏的旧版 SQLite 库（含迁移后的表与数据）。
- 输出：**旧写 → 新读 → 新写 → 旧读**四步都必须成功且内容等价：新实现读得懂旧库；新实现写入的行，旧实现的读路径（列名、JSON 字段名、`schema_migration` 记账）仍能读回；**数据格式、数据库文件路径、localStorage 键、数据目录一律不变**。
- 错误语义：任何一步失败都算契约未满足。
- 时序与并发：迁移在启动时按 `SQLITE_MIGRATIONS` 顺序、按 checksum 记账执行一次。
- 幂等：重复启动不重复应用已记账的迁移，也不改数据。
- 资源释放：迁移结束后连接按既有所有权释放（runner 属已独立文件）。
- 平台差异：路径与文件系统差异由调用方传入的 `dbPath` 承担；本包不改默认路径规则（`getDefaultSessionDbPath` 属已独立文件）。
- 状态所有者：SQLite 库文件。
- 日志级别：迁移进度由 runner 记录（属已独立文件）。
- 可测断言：见第 5 步的往返测试——用脱敏旧库夹具跑「旧写 → 新读 → 新写 → 旧读」，四步的会话/消息/part 计数与关键 JSON 字段逐项相等；数据库文件路径与表名不变。

---

## B. 配置（`config/`）

状态所有者：`ConfigStore` 实例（每个 `ConfigPortImpl` 一个）独占键值表与观察者集合；`mergeConfigs` / `parseEnvConfig` / `loadProjectConfigs` 都是**纯函数或一次性读取**，不保存状态。

### B18 `KNORVIA_*` 环境变量的解析面（键名不可改）

- 来源：`config/env-config.adapter.ts`（`parseEnvConfig`、`DEFAULT_PREFIX`）
- 输入：`Record<string, string | undefined>`（默认 `process.env`）与可选 `{prefix}`（默认 `"KNORVIA_"`）。
- 输出：只处理以 prefix 开头、且值**不是 `undefined`** 的键；去掉 prefix 后按固定表映射：
  - `STORAGE_DIR → storage.dir`；`SESSION_DB_PATH` 或 `SESSION_DB → storage.sessionDbPath`
  - `HTTP_PROXY → network.httpProxy`；`NO_PROXY → network.noProxy`；`AGENT_CA_CERT → network.caCertFile`；`HTTP_TIMEOUT` 或 `TIMEOUT → network.timeout`
  - `LOG_FORMAT → logging.format`（经 `normalizeLogFormat`）
  - `MAX_TOOL_CONCURRENCY → toolConcurrency.maxConcurrency`
  - 其他键**忽略**（不报错、不警告）
- 数值归一：`Number(value)`，`NaN` → `0`（不抛错）；日志格式只接受 `text`/`json`（大小写不敏感），其他一律 `text`。
- 错误语义：不抛错。
- 时序与并发：纯函数；遍历顺序不影响结果（同一 key 不会出现两次）。
- 幂等：是。
- 资源释放：无。
- 平台差异：环境变量名大小写在 Windows 上不敏感、POSIX 上敏感——实现按**传入对象的键**精确匹配，不做大小写折叠。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{KNORVIA_STORAGE_DIR: "/x"}` → `{storage:{dir:"/x"}}`；`{KNORVIA_HTTP_TIMEOUT: "abc"}` → `timeout: 0`；`{KNORVIA_LOG_FORMAT: "JSON"}` → `"json"`、`{KNORVIA_LOG_FORMAT: "yaml"}` → `"text"`；`{KNORVIA_UNKNOWN: "1"}` → `{}`；`{KNORVIA_STORAGE_DIR: undefined}` → `{}`；`{prefix: "APP_"}` 时 `APP_STORAGE_DIR` 生效而 `KNORVIA_STORAGE_DIR` 被忽略。

### B19 工具并发配置的独立入口

- 来源：`config/env-config.adapter.ts`（`getToolConcurrencyConfig`）
- 输入：无（读 `process.env.KNORVIA_MAX_TOOL_CONCURRENCY`）。
- 输出：`{maxConcurrency: normalizeNumber(值 ?? "10")}`；未设置时是 **10**，非法值归一为 0。
- 错误语义：不抛错。
- 时序与并发：每次调用重新读环境变量（不缓存）。
- 幂等：是。
- 资源释放：无。
- 平台差异：同 B18。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：环境变量缺席时返回 `{maxConcurrency: 10}`；设为 `"4"` 时返回 4；设为 `"x"` 时返回 0。

### B20 配置作用域优先级

- 来源：`config/config-merger.ts`（`getScopePriority`、`createPrioritizedConfig`）
- 输入：`ConfigScope`。
- 输出：优先级数值取自 `ConfigScopePriority[scope]`（契约里的固定表）；`createPrioritizedConfig` 返回 `{config, scope, priority}`。
- 错误语义：未知 scope 得到 `undefined` 优先级（排序时按 `NaN` 处理，行为不确定）——重写时**不得**改成抛错，也不得改这张表。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：同一个 scope 两次调用得到同一个数值；`createPrioritizedConfig(c, s).priority === getScopePriority(s)`；`mergeConfigs` 的结果只取决于优先级数值而不取决于传入顺序（见 B21）。

### B21 `mergeConfigs` 的合并语义

- 来源：`config/config-merger.ts`（`mergeConfigs`）
- 输入：任意多个 `PrioritizedConfig`。
- 输出：先按 `priority` **升序稳定排序**（低优先级先应用、高优先级覆盖），再逐项合并。分区语义：
  - 浅覆盖（`Object.assign` 后再整体复制）：`modelStream`、`permission`、`storage`、`network`、`features`、`memory`、`logging`、`toolConcurrency`、`modelAnomalyGuard`、`ui`、`skills`、`skillOverrides`、`commandOverrides`；`mcp` 额外把 `servers` 复制一层。
  - **`plugins`**：`dirs` 取**并集**（保序，`Set` 去重）；`enabledPlugins`、`extraKnownMarketplaces` 逐键合并（后者被覆盖）；`options` 按 plugin **逐插件浅合并**；其余字段浅覆盖。**当该层 scope 是 `ConfigScope.Project` 时，先删掉 `plugins.extraKnownMarketplaces`**（项目层不允许声明额外市场）。
  - **`hooks`**：`enabled` 取**逻辑或**（`previous === true || incoming === true`）；`events` 是 `previous` 的浅拷贝，且**只在 `incoming.enabled !== false`** 时把新事件的匹配器**追加**（`[...已有, ...新]`），即同事件不覆盖而是累加。
- 错误语义：不抛错；输入数组不被修改（内部先 `[...configs]`）。
- 时序与并发：纯函数。
- 幂等：**不是**对所有分区都幂等——`plugins.dirs` 与 `hooks.events` 是累加语义，重复合并同一份配置会重复追加（`dirs` 因 `Set` 去重而稳定，`hooks.events` 会变长）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：低优先级 `{storage:{dir:"a"}}` + 高优先级 `{storage:{dir:"b"}}` → `dir === "b"`；交换传入顺序结果相同；同事件的两个 matcher 在两份配置里 → 合并后**长度相加**；任一份 `hooks.enabled === true` → 结果 `enabled === true`；`incoming.enabled === false` 时该份的 `events` **不被追加**；Project scope 的 `extraKnownMarketplaces` 被丢弃。

### B22 `ConfigStore` 的键值与来源

- 来源：`config/index.ts`（`ConfigStore`，内部类）
- 输入：`set(key, value, scope, source?)`、`get(key)`、`has(key)`、`getSources(key)`。
- 输出：`set` 总是**整体替换**该键的条目：`{value, sources:[{scope, key, value, path: source}]}`——即 `sources` **只保留最后一次写入的一条**（不是历史列表）；`get` 返回 `entry?.value`（键不存在时 `undefined`）；`has` 只看键是否存在；`getSources` 返回该条目的一条来源数组。
- 错误语义：不抛错。
- 时序与并发：同步。
- 幂等：`set` 同值重复调用结果相同（但每次都会触发通知，见 B23）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：`ConfigStore` 实例。
- 日志级别：无。
- 可测断言：`set("a",1,system)` 后 `get("a") === 1`、`has("a") === true`、`getSources("a").length === 1`；再 `set("a",2,project)` 后 `getSources("a").length` 仍是 **1**（不是 2）。

### B23 通知顺序与订阅生命周期

- 来源：`config/index.ts`（`set`、`subscribe`、`subscribeAll`）
- 输入：`set` 触发的通知；`subscribe(key, handler)`；`subscribeAll(handler)`。
- 输出：`set` 内**先**通知该键的 key-handlers（参数 `(value, prev)`，`prev` 是覆盖前的值），**再**通知 all-handlers（参数 `(key, value, prev)`）；两者都在 `set` 内**同步**调用。`subscribe` / `subscribeAll` 返回 `Unsubscribe`，退订后再不收到通知；重复退订安全。
- 错误语义：处理器抛错会**冒泡**出 `set`（不吞）。
- 时序与并发：同步、按注册顺序（`Set` 迭代顺序 = 插入顺序）；同一 handler 重复注册只保留一份（`Set`）。
- 幂等：`Unsubscribe` 幂等。
- 资源释放：退订释放集合内的引用。
- 平台差异：无。
- 状态所有者：`ConfigStore`。
- 日志级别：无。
- 可测断言：观察者收到 `(newValue, previousValue)`；同一 `set` 里 key-handler 先于 all-handler（用调用序号断言）；退订后不再触发；handler 抛错时 `set` 抛出且另一类 handler 不再被调用（或按实现顺序记录实际行为，测试锁定）。

### B24 `merge(patch)` 的键映射

- 来源：`config/index.ts`（`ConfigStore.merge`）
- 输入：`RuntimeConfigPatch` 与 `scope`。
- 输出：把 patch 逐字段映射到 `ConfigKey` 并 `set(...)`。必须逐项保持的**判空规则**差异（truthy vs `!== undefined`）：
  - truthy 才写：`modelStream.idleTimeoutMs`（`!== undefined`）、`permission.mode`、`permission.allowedTools`、`permission.disallowedTools`、`storage.dir`、`storage.sessionDbPath`、`logging.level`（都是 truthy）；而 `permission.autoApproveHighRisk`、`permission.allowMediumRiskInAuto`、`network.*`、`features.*`、`memory.use`、`mcp.servers`、`plugins.*`、`skills.*`、`logging.format`、`toolConcurrency.maxConcurrency`、`ui.locale`、`ui.theme` 用 `!== undefined`（写 0/`false`/空串也会落库）。
  - `skillOverrides` / `commandOverrides` 用 `!== undefined`（传 `{}` 也落库）。
  - `modelAnomalyGuard`：与**当前值**（缺席时取 `DefaultConfig.modelAnomalyGuard`）浅合并后写入。
  - `hooks`：与当前值（缺席时 `DefaultConfig.hooks`）浅合并，且 `events: config.hooks.events ?? previous.events`。
- 错误语义：不抛错（未知字段忽略）。
- 时序与并发：同步；每个键各触发一次通知。
- 幂等：对多数分区是（同 patch 重复 merge 结果相同），但前一条的合并语义使 `hooks`/`modelAnomalyGuard` 为「累积式浅合并」。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：`ConfigStore`。
- 日志级别：无。
- 可测断言：`{features:{compact:false}}` 会写入 `FeatureCompact=false`（`!== undefined` 判据）；`{permission:{mode:""}}` **不**写入（truthy 判据）；`{network:{timeout:0}}` 写入 0；`modelAnomalyGuard` 二次 merge 保留第一次的键。

### B25 `ConfigPortImpl` 的读取与缺省

- 来源：`config/index.ts`（`ConfigPortImpl.get`、`getAll`）
- 输入：`new ConfigPortImpl(initial?)`（缺席时用 `DefaultRuntimeConfig`）；`get(key)`；`getAll()`。
- 输出：`get` 先查 store，未命中再查默认值，仍未命中**抛 `Config key not found: ${key}`**；`getAll()` 返回完整 `RuntimeConfig`，其中 `features.*` 缺省为 **`true`**、`storage.dir`/`sessionDbPath`、`network.timeout`、`memory.use`、`mcp.servers`、`plugins.*` 取 `DefaultRuntimeConfig`（`plugins.dirs`/`enabled`/`enabledPlugins`/`extraKnownMarketplaces`），`permission.*` 与 `network.httpProxy/noProxy/caCertFile` **不兜底**（按 store 值，可能是 `undefined`）。
- 错误语义：`get` 抛错只发生在既无 store 值又无默认值的键。
- 时序与并发：同步。
- 幂等：`getAll` 每次重新拼装（返回新对象）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：`ConfigStore`（由 `ConfigPortImpl` 持有）。
- 日志级别：无。
- 可测断言：`new ConfigPortImpl({}).get(ConfigKey.FeatureCompact) === true`；`getAll().features.compact === true`；未知 key 抛出的消息**逐字**为 `Config key not found: <key>`；`new ConfigPortImpl({features:{compact:false}}).getAll().features.compact === false`。

### B26 项目配置发现与 baseDir 规则

- 来源：`config/project-config.adapter.ts`（`loadProjectConfigs`、`loadProjectConfigFile`、`summarizeProjectConfigs`）
- 输入：`workingDirectory?`（默认 `process.cwd()`）、`explicitProjectConfigPath?`。
- 输出：
  - 候选路径来自 `discoverWorkspaceHookConfigPaths({workingDirectory, explicitProjectConfigPath?})`（属 `@knorvia/shared`），按返回顺序逐个 `loadProjectConfigFile`，`discoveryOrder` 即数组下标。
  - **`baseDir`**：若配置文件所在目录的 basename 是 `.knorvia-studio`，则取其**父目录**，否则取所在目录本身。
  - patch 处理：**`hooks` 从 config patch 中删除**（项目 hooks 走信任流程，不直接生效），并追加一条 `warning` 诊断，code 为 `config_project_hooks_pending_trust`、message 为 `Project hooks are pending workspace trust and remain blocked`、path 为 `hooks`；`stdio` 类型的 MCP server 的 `cwd` 若是相对路径则按 `baseDir` 解析（缺省 `.`），非 `stdio` 原样返回。
  - hooks 存在时用 `workspaceHooksConfigSchema.parse(hooks)` 校验并构造 `hookCandidate`（`workingDirectory` 取 `options.workingDirectory ?? baseDir` 的 `resolve` 结果）。
  - `summarizeProjectConfigs`：只保留 `loaded` 的文件；`mcpServerNames` 是这些文件 `config.mcp.servers` 键的**去重并集**；`paths` 是已加载文件的路径；`loaded` 为「已加载文件数 > 0」；`diagnostics`、`hookCandidates` 按文件顺序拼接。
- 错误语义：schema 校验失败会抛（`parse` 不吞）。
- 时序与并发：同步文件读取。
- 幂等：是（同样的文件系统状态给出同样结果）。
- 资源释放：无（`loadFileConfig` 内部负责）。
- 平台差异：路径用 `node:path` 的 `resolve`/`dirname`/`isAbsolute`；Windows 盘符与分隔符由它们处理。
- 状态所有者：无（每次调用新建）。
- 日志级别：无（诊断以数据结构返回，由调用方呈现）。
- 可测断言：`.knorvia-studio/knorvia.json` 的 `baseDir` 是其父目录；同目录的 `knorvia.json` 的 `baseDir` 是自身目录；带 `hooks` 的配置文件的 patch **没有** `hooks` 键且诊断里有一条 `config_project_hooks_pending_trust`；`stdio` server 的相对 `cwd` 被解析成绝对路径；`summarizeProjectConfigs` 里未加载文件不进 `paths`。

### B27 `config/index.ts` 的导出面

- 来源：`config/index.ts`
- 输入：无。
- 输出：`ConfigStore` **不导出**（内部类）；导出 `ConfigPortImpl` 与 `config/index.ts` 里其余对外声明（见 `interface.md`）。`env-config.adapter.ts` / `config-merger.ts` / `project-config.adapter.ts` / `file-config.adapter.ts` / `schema.ts` / `config-factory.ts` 的导出名按 `interface.md` 保持。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`import { ConfigPortImpl } from "…/config/index.js"` 成功；`interface.md` 里该文件的导出名集合与源码逐字一致（第 5 步用脚本比对）。

### B28 配置文件 schema 的顶层结构与字段约束

- 来源：`config/schema.ts`（`KnorviaConfigFileSchema`）
- 输入：任意 `unknown`（来自 `knorvia.json` 的 JSON 解析结果）。
- 输出：顶层字段固定为 `$schema`、`modelStream`、`permission`、`storage`、`network`、`features`、`memory`、`mcp`、`plugins`、`skills`、`skill`、`command`、`logging`、`ui`、`toolConcurrency`、`modelAnomalyGuard`、`hooks`；根对象是 **passthrough**（未知顶层键通过校验，但不进入 `RuntimeConfigPatch`）；**嵌套对象默认被 zod 剥离未知键**（只有 `mcp.*` 的三种 server、`plugins.extraKnownMarketplaces.*`、`plugins.options` 的值、`hooks.events` 与钩子条目用 `.strict()`）。约束（逐字保持）：`storage.dir`/`storage.sessionDbPath` 是 `min(1)` 字符串；`network.timeout`、`modelStream.idleTimeoutMs`、`toolConcurrency.maxConcurrency`、`skills.metadataBudget`、`mcpServerBaseSchema.timeoutMs` 是有限正数；`logging.level ∈ {debug,info,warn,error}`、`logging.format ∈ {text,json}`、`ui.locale ∈ {auto,en-US,zh-CN}`、`ui.theme ∈ {auto,dark,light}`、`permission.mode ∈ {plan,build,edit,yolo,auto}`；`modelAnomalyGuard.toolCallWarningThreshold`/`repeatedToolCallWarningThreshold` 是正整数、`maxBudgetWarningsPerTurn` 是非负整数。
- 错误语义：顶层或嵌套字段不合法时 `zod` 的 `parse` **抛错**（调用方按 `config_file_invalid` 处理）；`mcp.servers` 是唯一被逐项降级成诊断的分区（见 B30）。
- 时序与并发：纯同步解析。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无（诊断以数据返回）。
- 可测断言：`{unknown:1}` 解析成功且 `config` 为 `{}`；`{storage:{dir:""}}`、`{storage:{dir:"a",extra:1}}` 中前者抛错、后者解析出的 `config.storage` 为 `{dir:"a"}`（未知键被剥离）；`{logging:{format:"yaml"}}`、`{features:{compact:"yes"}}` 抛错；`{mcp:"x"}` 抛错（`mcp` 非对象不走逐项诊断）；`{plugins:{extraKnownMarketplaces:{m:{source:{source:"npm",package:"p",extra:1}}}}}` 抛错。

### B29 MCP server 输入归一化

- 来源：`config/schema.ts`（`normalizeMcpServerConfigInput`，被 `mcpServerSchema` 的 `preprocess` 调用）
- 输入：单个 server 的原始值。
- 输出（按固定顺序，做成新对象，原对象不改）：
  - `env` 缺失且 `environment` 存在 → `env = environment`；随后删除 `environment`。
  - 只要 `enable` 或 `enabled` 里有一个是布尔 → `enabled = (enable === false ? false : (enabled ?? true))`，随后删除 `enable`。即 **`enable:false` 优先于残留的 `enabled:true`**（停用优先）。
  - 无条件删除 `timeout` 与 `startup_timeout_sec`（外部 MCP 配置的供应商字段，不迁移、也不再触发 strict 报错）。
  - `type === "remote"` → `type = "http"`；`type` 不是字符串时：`command` 去掉首尾空白后非空 → `"stdio"`，否则 `url` 非空 → `"http"`，两者都不满足则保持原样（随后被 strict 联合判为无效）。
  - `type ∈ {http, sse}` 且 `headers === undefined` 且 `http_headers !== undefined` → `headers = http_headers`；随后删除 `http_headers`。
- 错误语义：不抛错；非对象（`null`、数组、字符串）原样返回。
- 时序与并发：纯函数。
- 幂等：是（归一化后的结果再归一化不变）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{type:"stdio",command:"c",environment:{K:"v"}}` → `config.mcp.servers.<n>.env` 为 `{K:"v"}` 且没有 `environment` 键；`{type:"stdio",command:"c",enable:false,enabled:true}` → `enabled === false`；`{type:"stdio",command:"c",enable:true}` → `enabled === true`；`{type:"remote",url:"https://mcp.example.invalid/m"}` → `type === "http"`；`{command:"c"}`（无 `type`）→ `type === "stdio"`；`{url:"https://mcp.example.invalid/m"}` → `type === "http"`；`{type:"http",url:"https://mcp.example.invalid/m",http_headers:{A:"b"}}` → `headers` 为 `{A:"b"}`；`{type:"stdio",command:"c",timeout:5,startup_timeout_sec:6}` 解析成功且结果里没有这两个键。

### B30 MCP servers 的逐项诊断与部分保留

- 来源：`config/schema.ts`（`normalizeConfigFileInput`、`formatMcpServerError`）与 `parseConfigFileToRuntimePatchWithDiagnostics`
- 输入：配置文件的 JSON 值。
- 输出：`mcp.servers` 存在且**不是普通对象**（数组、字符串等）→ 丢弃全部 MCP server，`mcp.servers` 置 `{}`，其余顶层配置继续解析；单个 server 用 `mcpServerSchema.safeParse` 校验，失败则**只跳过该 server**，其余 server 与其他顶层分区照常进入 `RuntimeConfigPatch`。
- 诊断形状：`{code:"config_mcp_server_invalid", severity:"warning", path, message}`；整体非对象时 `path === "mcp.servers"`、`message` 逐字为 `mcp.servers must be a JSON object; ignoring all MCP servers.`；单个 server 时 `path === "mcp.servers.<name>"`、`message` 由 zod issues 按 `<issuePath 或 <server>>: <issue.message>` 用 `"; "` 连接（issue 无 path 段时用逐字 `<server>`）。
- 错误语义：不抛错；`mcp` 本身非对象或 `servers === undefined` 时归一化阶段**不介入**（由 B28 的 schema 决定：非对象抛错、`servers` 缺失视为无）。
- 时序与并发：纯函数；诊断按 `Object.entries(servers)` 的插入顺序追加。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无（诊断由 `config-factory` 转成 `warn` 日志，见 B42）。
- 可测断言：`{mcp:{servers:[]}, storage:{dir:"/tmp/x"}}` → 1 条诊断（`code`/`path`/`message` 逐字如上）且 `config.storage.dir === "/tmp/x"`、`config.mcp.servers` 为 `{}`；`{mcp:{servers:{ok:{type:"stdio",command:"c"}, bad:{type:"stdio"}}}}` → 1 条诊断且 `path === "mcp.servers.bad"`、`message` 以 `command:` 开头、`config.mcp.servers` 只有 `ok`；`{mcp:{servers:{bad:{type:"stdio",extra:1}}}}` → 诊断 `message` 以 `extra:` 开头（strict 未知键）。

### B31 MCP 三种传输、OAuth 与基础字段的严格形状

- 来源：`config/schema.ts`（`mcpStdioServerSchema`、`mcpHttpServerSchema`、`mcpSseServerSchema`、`mcpOAuthSchema`）
- 输入：归一化后的单个 server。
- 输出：三种传输都是 `.strict()`：
  - 公共字段 `protocolVersion ∈ {auto,legacy,2026-07-28}`、`enabled?: boolean`、`timeoutMs?: 有限正数`。
  - `stdio`：`command` 必填 `min(1)`；`args?: string[]`；`cwd?: min(1)`；`env?: Record<string,string>`。
  - `http` / `sse`：`url` 必填 `min(1)`；`headers?: Record<string,string>`；`oauth?`。
  - `oauth` 是两种 `.strict()` 变体的联合：`{type:"client_credentials", clientId, clientSecret, clientName?, scope?}`（前两者必填）与 `{type:"authorization_code", clientId?, clientSecret?, clientName?, redirectPath?, scope?}`（可全缺）。
- 错误语义：任一项不满足 → 该 server 校验失败 → 变成 B30 的逐项诊断，**不抛错**。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{type:"stdio",command:"c",args:[1]}` → 诊断；`{type:"http",url:"https://mcp.example.invalid/m",headers:{A:1}}` → 诊断；`{type:"http",url:"https://mcp.example.invalid/m",oauth:{type:"client_credentials",clientId:"id"}}` → 诊断（缺 `clientSecret`）；`oauth:{type:"authorization_code"}` → 通过；`{type:"sse",url:"https://mcp.example.invalid/s"}` → 通过且 `type === "sse"`；`{type:"stdio",command:"c",protocolVersion:"legacy"}` → 通过。

### B32 plugins 与额外市场 schema

- 来源：`config/schema.ts`（`pluginsSchema`、`pluginMarketplaceSourceSchema`、`pluginOptionValueSchema`）
- 输入：`plugins` 分区。
- 输出：`enabled?: boolean`；`dirs?: string[]`（每项 `min(1)`）；`enabledPlugins?: Record<string, boolean>`；`extraKnownMarketplaces?: Record<非空字符串, {source: <六选一>}>`（外层对象与 source 值 `.strict()`）；`options?: Record<string, Record<string, string|number|boolean>>`；`suppressedBuiltins?: string[]`（每项 `min(1)`）。
- 市场 source 变体（`.strict()`，多余字段即失败）：`{source:"url", url, headers?}`、`{source:"github", repo, ref?, path?, sparsePaths?}`、`{source:"git", url, ref?, path?, sparsePaths?}`、`{source:"npm", package}`、`{source:"file", path}`、`{source:"directory", path}`。
- 错误语义：不合法 → 顶层 `parse` 抛错（`plugins` 不参与逐项诊断）。
- 时序与并发：纯函数。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{plugins:{dirs:[""]}}`、`{plugins:{extraKnownMarketplaces:{m:{source:{source:"npm",package:"p",extra:1}}}}}`、`{plugins:{extraKnownMarketplaces:{m:{source:{source:"github"}}}}}`（缺 `repo`）都抛错；`{plugins:{enabledPlugins:{a:true},options:{a:{n:1,b:false,s:"x"}},suppressedBuiltins:["x"],extraKnownMarketplaces:{m:{source:{source:"directory",path:"/tmp/m"}}}}}` 解析成功。

### B33 skills / skill / command 的解析与覆盖映射

- 来源：`config/schema.ts`（`skillsSchema`、`skillCommandOverridesSchema`、`parseSkillsRuntimeConfig`、`parseSkillOverridesFromPluralSkills`、`mergeSkillCommandOverrides`）
- 输入：`skills`（含 catchall）、`skill`、`command` 三个分区。
- 输出：
  - `skills` 的四个声明字段 `enabled`/`includeInstructions`/`metadataBudget`/`roots` 中**至少一个存在**才写 `config.skills`；全部缺席则不写该键（`config.skills === undefined`）。
  - `skills` 的其余键（catchall，值是 `{enable?: boolean}`）与 `skill` 分区（`Record<路径, {enable?}>`，允许未知键）里**只有绝对路径 key** 才进 `skillOverrides`：`path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path)`；值必须是「对象且 `enable` 缺席或是布尔」。
  - `skillOverrides` 的合并顺序是 `skills`（plural）先、`skill` 后 → 同 key 以 `skill` 为准；合并结果为空则不写该键。
  - `command` 分区原样写入 `config.commandOverrides`（不筛绝对路径）。
- 错误语义：不抛错（非法子值被当作不可识别条目跳过）。
- 时序与并发：纯函数；`Object.entries` 顺序。
- 幂等：是。
- 资源释放：无。
- 平台差异：Windows 盘符路径 `C:\x\SKILL.md` 与 POSIX `/x/SKILL.md` 都算绝对；`\x` 开头的路径也算。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{skills:{"/a/SKILL.md":{enable:false},rel:{enable:true},enabled:false}}` → `config.skills === {enabled:false}`、`config.skillOverrides === {"/a/SKILL.md":{enable:false}}`；`{skills:{"C:\\a\\SKILL.md":{enable:false}}}` → 进入 `skillOverrides`；`{skill:{"/a":{enable:true}},skills:{"/a":{enable:false}}}` → `{"/a":{enable:true}}`；`{command:{"/c.md":{enable:false}}}` → `config.commandOverrides` 同值；`{skills:{enabled:true}}` → `config.skills` 只有 `enabled`；`{skills:{}}` → `config.skills === undefined`。

### B34 插件 id 规范化与别名

- 来源：`config/schema.ts`（`LEGACY_CUA_PLUGIN_ID`、`CANONICAL_CUA_PLUGIN_ID`、`canonicalizePluginId`、`pluginIdAliases`）
- 输入：任意插件 id 字符串。
- 输出：`LEGACY_CUA_PLUGIN_ID` 逐字 `cua@knorvia-plugins-bundled`、`CANONICAL_CUA_PLUGIN_ID` 逐字 `computer-use@knorvia-plugins-bundled`；`canonicalizePluginId` 只把 legacy 换成 canonical，其它输入（含已经是 canonical 的）原样返回；`pluginIdAliases` 当 `canonicalizePluginId(input) === CANONICAL_CUA_PLUGIN_ID` 时返回 `[CANONICAL_CUA_PLUGIN_ID, LEGACY_CUA_PLUGIN_ID]`（**顺序固定**），否则返回 `[input]`。
- 错误语义：不抛错（空串按非 CUA 处理）。
- 时序与并发：纯函数。
- 幂等：`canonicalizePluginId` 幂等；`pluginIdAliases(CANONICAL)[0]` 仍是 canonical。
- 资源释放：无。
- 平台差异：无（大小写敏感，不做折叠）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`canonicalizePluginId("cua@knorvia-plugins-bundled") === "computer-use@knorvia-plugins-bundled"`；`canonicalizePluginId("other@x") === "other@x"`；`pluginIdAliases("cua@knorvia-plugins-bundled")` 深度等于 `["computer-use@knorvia-plugins-bundled","cua@knorvia-plugins-bundled"]`；`pluginIdAliases("other@x")` 深度等于 `["other@x"]`；`pluginIdAliases("Computer-Use@knorvia-plugins-bundled")`（大小写不同）→ `["Computer-Use@knorvia-plugins-bundled"]`。

### B35 配置文件里的插件别名迁移

- 来源：`config/schema.ts`（`normalizePluginConfig`，由 `parsedConfigFileToRuntimePatch` 调用）
- 输入：已通过 `pluginsSchema` 的 `plugins` 分区。
- 输出（三者独立处理，都是**先迁移再删除 legacy 键**）：
  - `enabledPlugins`：`enabledPlugins[LEGACY] !== undefined` 时，**只有 `enabledPlugins[CANONICAL] === undefined`** 才写入 legacy 的值；随后删除 legacy 键（已有 canonical 时 legacy 值被丢弃）。
  - `options`：同一规则（canonical 已有则丢 legacy）。
  - `suppressedBuiltins`：逐项把 legacy 换成 canonical，**只对 canonical id 去重**（保留首次出现顺序）；未声明的其它字符串照原样保留。原数组不改，返回新数组。
- 错误语义：不抛错（`plugins` 缺失时返回 `{}`）。
- 时序与并发：纯函数；按 `enabledPlugins` → `suppressedBuiltins` → `options` 的顺序构造返回对象，其余字段用展开保留。
- 幂等：是（迁移后不再出现 legacy 键）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{enabledPlugins:{"cua@knorvia-plugins-bundled":true}}` → `{"computer-use@knorvia-plugins-bundled":true}` 且无 legacy 键；`{enabledPlugins:{"cua@knorvia-plugins-bundled":true,"computer-use@knorvia-plugins-bundled":false}}` → canonical 为 `false`；`{suppressedBuiltins:["cua@knorvia-plugins-bundled","computer-use@knorvia-plugins-bundled","other"]}` → `["computer-use@knorvia-plugins-bundled","other"]`；`{options:{"cua@knorvia-plugins-bundled":{x:1}}}` → `{"computer-use@knorvia-plugins-bundled":{x:1}}`；输入对象本身在调用后仍含 legacy 键（不就地修改）。

### B36 配置文件到 `RuntimeConfigPatch` 的映射与诊断

- 来源：`config/schema.ts`（`parsedConfigFileToRuntimePatch`、`parseConfigFileToRuntimePatchWithDiagnostics`）
- 输入：任意 `unknown`。
- 输出：返回 `{config, diagnostics}`。`config` 只含被显式声明的分区（条件写入）：`modelStream`、`permission`、`storage`、`network`、`features`、`memory`、`mcp`、`plugins`（经 B35 迁移）、`skills`（经 B33）、`skillOverrides`、`commandOverrides`、`logging`、`ui`、`toolConcurrency`、`modelAnomalyGuard`、`hooks`；`$schema` 与未知顶层键**不写入**；`diagnostics` 只来自 `mcp.servers` 归一化（B30），顺序即追加顺序。
- 错误语义：顶层/嵌套校验失败时 `parse` 抛错（返回值为 `undefined` 之前的异常），调用方拿到的是 zod 错误而不是诊断。
- 时序与并发：纯同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`parseConfigFileToRuntimePatchWithDiagnostics({})` → `{config:{},diagnostics:[]}`；`({$schema:"x",unknown:1,storage:{dir:"/tmp/s"}})` → `config` 的 own keys 为 `["storage"]`；`({mcp:{servers:{bad:{}}}})` → `config.mcp.servers` 为 `{}` 且 `diagnostics.length === 1`。

### B37 `createConfig` 的装配顺序与来源优先级

- 来源：`config/config-factory.ts`（`createConfig`）
- 输入：`ConfigFactoryOptions`（`userConfigPath`、`projectConfigPath`、`workingDirectory`、`workspaceIdentity`、`env`、`cliOverrides`、`skipUserConfig`、`loggerFactory`）。
- 输出：按 `createPrioritizedConfig` 顺序装配再 `mergeConfigs`：① `DefaultRuntimeConfig`（`System`）② 用户配置（`User`，仅当 `loaded === true`）③ 每个项目配置文件各一条（`Project`，顺序即发现的 `files` 顺序）④ 环境变量（`Env`，仅当解析出的 patch 至少有一个键）⑤ `cliOverrides`（`Cli`，只要是对象就压入，`{}` 也算）。因此同键的生效顺序是 system < user < 项目文件（后者覆盖前者）< env < cli。
- 错误语义：见 B42（诊断日志抛错会中断装配）。
- 时序与并发：同步读文件；顺序固定如上。
- 幂等：给定同样的文件系统与入参，结果相同。
- 资源释放：无（文件读取由下游负责）。
- 平台差异：`workingDirectory` 缺省用 `process.cwd()`（见 B44）。
- 状态所有者：`ConfigPortImpl`（由 `createConfigPort(merged)` 创建）。
- 日志级别：见 B42。
- 可测断言：用户配 `storage.dir="user"`、两个项目文件依次 `"p1"`、`""`、env 设 `"env"` → `config.storage.dir === "env"`；同上去掉 env → `""`（后一个项目文件用空串覆盖，说明判据是 `!== undefined` 而不是 truthy）；`cliOverrides:{storage:{dir:"cli"}}` → `"cli"`；`skipUserConfig:true` 时用户层不参与（`sources.user.loaded === false`）。

### B38 项目发现的元数据与 UI 来源路径

- 来源：`config/config-factory.ts`（`projectSummary`、`createConfig` 里的 `uiLocalePath`/`uiThemePath`）
- 输入：同 B37。
- 输出：`sources.project.path` 是**最后一个**已发现文件的路径（无文件时 `undefined`）；`paths` 是 `discovery.paths` 原数组；`loaded` 等价于「文件数 > 0」；`hasMcpServers`/`hasUiLocale`/`hasUiTheme` 看**合并后**的项目 patch 上对应键是否存在（区分 `undefined`）；`mcpServerNames` 来自 `discovery.mcpServerNames`（去重并集）；`uiLocalePath`/`uiThemePath` 是**逆序**扫描 `files` 后第一个 `ui.locale !== undefined` / `ui.theme !== undefined` 的文件路径（即最后一个声明者）。
- 错误语义：不抛错（文件读取失败由 `file-config` 变成诊断）。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：路径由 `file-config`/发现逻辑产出，不在本文件改写。
- 状态所有者：无（每次 `createConfig` 产出一份快照）。
- 日志级别：无。
- 可测断言：两个项目文件，前者 `ui.locale` 后者 `ui.theme` → `uiLocalePath` 指前者、`uiThemePath` 指后者；两个文件都设 `ui.locale` → `uiLocalePath` 指**后者**；无项目文件时 `path === undefined`、`loaded === false`、`paths` 为空数组。

### B39 plugins 的来源归属

- 来源：`config/config-factory.ts`（`describePlugins`）
- 输入：用户 patch、项目合并 patch、用户配置路径、项目路径（`projectResult.path`）。
- 输出：`dirs` = `{user: 用户 plugins.dirs ?? [], workspace: 项目 plugins.dirs ?? []}`（数组引用直接透传）；`enabled` 先登记用户 `enabledPlugins` 的键为 `"user"`、再登记项目 `enabledPlugins` 的键为 `"workspace"`（同名以 workspace 为准）；`marketplaces` **只看用户** `extraKnownMarketplaces` 的键并标 `"user"`（项目层的额外市场不登记，因为项目层在合并时被丢弃，见 B21）；`options` 先用户后 workspace 逐插件逐选项标归属（同插件同选项 workspace 覆盖，同插件不同选项各留）；`paths` = `{user: userPath, workspace: projectPath}`（无项目文件时 `workspace` 为 `undefined`）。
- 错误语义：不抛错。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：用户 `enabledPlugins:{a:false}` 且项目 `enabledPlugins:{a:true}` → `enabled.a === "workspace"`；项目 `extraKnownMarketplaces:{m:{}}` → `marketplaces` 里**没有** `m`；用户 `options:{a:{user:1}}` 与项目 `options:{a:{workspace:2}}` → `options.a` 为 `{user:"user", workspace:"workspace"}`；用户 `dirs:["u"]` → `dirs.user` 与该数组同一引用。

### B40 MCP server 的生效表与来源归属

- 来源：`config/config-factory.ts`（`effectiveMcp`、`createConfig` 末尾的 `merged.mcp` 覆写）
- 输入：项目合并 patch、用户 patch、env patch、`cliOverrides`。
- 输出：按 `system`（`DefaultRuntimeConfig`）→ `project` → `user` → `env` → `cli` 顺序把各层 `mcp.servers` 的条目写入同一张表，同名后者覆盖；`serverSources[name]` 是**最后一次**写入该名字的来源；最终 `config.mcp.servers` 被替换为这张生效表（`merged.mcp = { ...merged.mcp, servers: mcp.servers }`），而 `mergeConfigs` 关于 `mcp.servers` 的浅合并结果不作为最终值。
- 错误语义：不抛错。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：用户与项目都定义 `same`、env 也定义 `same`、cli 也定义 → `config.mcp.servers.same` 是 cli 的对象、`serverSources.same === "cli"`；只在用户定义 `userOnly` → `serverSources.userOnly === "user"`；`DefaultRuntimeConfig.mcp.servers` 当前为空对象，因此 `serverSources` 里通常不出现 `"system"`；项目定义 `p`、用户定义 `u` → 两者都在 `config.mcp.servers` 里。

### B41 hooks 的来源标记

- 来源：`config/config-factory.ts`（`tagHooks`）
- 输入：一个 `RuntimeConfigPatch` 与 `HookConfigSource`。
- 输出：`patch.hooks?.events` 缺失（`hooks` 或 `events` 缺席）时**原样返回同一个对象**；否则返回新 patch，`events` 逐事件逐 matcher 逐 hook 地写 `source: hook.source ?? source`——即已有 `source` 的 hook 保留**原引用**（不被覆盖），没有的写上新来源。用户层来源是 `{kind:"user", path: userResult.path}`，env 与 cli 层是 `{kind:"internal"}`。
- 错误语义：不抛错。
- 时序与并发：纯函数。
- 幂等：是（第二次给同一来源不再改变）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：用户配置文件里带 hooks 时 `config.hooks.events.<E>[i].hooks[j].source` 深度等于 `{kind:"user",path:<用户配置路径>}`，同时**原始** `userResult.config` 上该 hook 的 `source` 仍是 `undefined`（不就地修改）；`cliOverrides` 里已有 `source` 的 hook 在结果里保持同一对象引用；`cliOverrides` 里的 hook 没有 `source` 时得到 `{kind:"internal"}`；`hooks:{enabled:true}`（无 `events`）时 `tagHooks` 返回原对象。

### B42 配置诊断的告警日志

- 来源：`config/config-factory.ts`（`warnDiagnostics`）
- 输入：`options.loggerFactory`（可选）、用户诊断、项目诊断。
- 输出：仅当用户或项目诊断**至少一条**时建 logger：`(options.loggerFactory ?? createNodeLoggerFactory({env: options.env})).createLogger("knorvia").child({module: "adapters.config"})`；随后**先遍历全部用户诊断、再遍历全部项目诊断**，每条调用一次 `logger.warn(message, fields)`：`message` 按 `code` 映射——`config_mcp_server_invalid` → 逐字 `MCP server config skipped`、`config_project_hooks_pending_trust` → 逐字 `Project hooks pending workspace trust`、其余 → 逐字 `Config file failed to load`；`fields` 固定为 `{configPath, configScope("user"|"project"), diagnosticCode, diagnosticMessage, diagnosticPath, event, severity}`，`event` 逐字为 `config.mcp_server.skipped` / `config.project_hooks.pending_trust` / `config.file.invalid`。
- 错误语义：`logger.warn` 抛出的异常**冒泡**并中断 `createConfig`（此时后续步骤如 env 解析、`createConfigPort` 都不会发生）。
- 时序与并发：同步、按上述固定顺序。
- 幂等：只读日志，不改变配置结果。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：`warn`（唯一的配置诊断日志级别）。
- 可测断言：用注入的 `loggerFactory` 记录调用序列 → 用户 1 条 + 项目 1 条时得到 `[["logger","knorvia"],["child",{module:"adapters.config"}],["warn",...],["warn",...]]` 且两条的 `configScope` 依次为 `"user"`、`"project"`；`logger.warn` 抛错时 `createConfig` 抛出同一错误对象且后续 `env` 解析未发生；两侧诊断都为空时**不调用** `createLogger`（`loggerFactory` 的调用序列里没有 `logger` 项）。

### B43 项目发现的三个入口分支

- 来源：`config/config-factory.ts`（`readProjects`）
- 输入：`workingDirectory?`、`projectConfigPath?`。
- 输出：① 有 `workingDirectory` → `loadProjectConfigs(workingDirectory, projectConfigPath)`；② 没有 `workingDirectory` 且没有 `projectConfigPath` → `summarizeProjectConfigs([])`（空发现：`files`/`diagnostics`/`paths`/`hookCandidates`/`mcpServerNames` 全空、`loaded` 为 `false`）；③ 没有 `workingDirectory` 但有 `projectConfigPath` → `summarizeProjectConfigs([loadProjectConfigFile(projectConfigPath, {discoveryOrder: 0, explicitProjectConfig: true})])`（只读这一个文件）。
- 错误语义：文件读取问题由 `file-config` 转成诊断（`loaded:false`）；本函数不额外包装。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：`projectConfigPath` 的相对路径由 `file-config`/发现逻辑解析。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：不传 `workingDirectory`/`projectConfigPath` → `sources.project.loaded === false`、`paths` 为空数组、`config.projectConfigPath` 不影响；只传一个存在的 `projectConfigPath`（临时目录里的配置文件）→ `loaded === true`、`paths` 长度为 1 且 `path` 等于该文件路径。

### B44 工作区 hook 的运行时根与快照

- 来源：`config/config-factory.ts`（`createConfig` 中的 `resolveWorkspaceHookRuntimeRoot` / `buildWorkspaceHookBundleSnapshot` / `createWorkspaceHookBundleSnapshot`）
- 输入：同 B37，外加项目发现的 `hookCandidates`。
- 输出：`runtimeRoot = resolveWorkspaceHookRuntimeRoot([DefaultRuntimeConfig.hooks, userResult.config.hooks, ...discovery.hookCandidates.map(c => c.hooks), envConfig.hooks, options.cliOverrides?.hooks])`（顺序固定，缺席项为 `undefined`）；`workspacePath = resolve(options.workingDirectory ?? process.cwd())`；`workspaceIdentity = options.workspaceIdentity?.trim() || workspacePath`（空串/全空白退回路径）；`snapshotData = buildWorkspaceHookBundleSnapshot({workspaceIdentity, workspacePath, sources: discovery.hookCandidates, runtimeRoot})`，只有返回非空才 `createWorkspaceHookBundleSnapshot(snapshotData)`。`sources.project.workspaceHookRuntimeRoot` **总是**存在；`sources.project.workspaceHookSnapshot` 只在快照非空时作为 own property 出现（否则该键不存在，而不是 `undefined`）。
- 错误语义：不抛错（由 `@knorvia/shared` 的实现决定）。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：`resolve` 处理 Windows 盘符与分隔符；`workspaceIdentity` 的 trim 是跨平台一致的。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`workspaceIdentity:" id "` → `sources.project.workspaceHookSnapshot.workspaceIdentity === "id"`；不传 `workspaceIdentity` → 等于 `resolve(workingDirectory)`；没有任何 hook 候选时 `Object.hasOwn(sources.project, "workspaceHookSnapshot") === false` 且 `workspaceHookRuntimeRoot` 已被定义。

### B45 `resolveWorkspaceStorageDir` 的优先级

- 来源：`config/config-factory.ts`（`resolveWorkspaceStorageDir`）
- 输入：`{env?, workingDirectory}`。
- 输出：`env ?? project ?? base`。`base = createConfig({env: input.env}).config.storage.dir`（系统默认 `~/.knorvia-studio`，除非 env 覆盖）；`project` 遍历 `loadProjectConfigs(workingDirectory).files`，取**最后一个** `file.config.storage?.dir`，判据是 `!== null && !== undefined`（**空串也算值**，会覆盖前面的）；`env` 是 `parseEnvConfig(env ?? process.env).storage?.dir`。环境变量优先级最高。
- 错误语义：不抛错。
- 时序与并发：同步读文件。
- 幂等：是。
- 资源释放：无。
- 平台差异：`~` 的展开由 `storage.dir` 的下游消费方处理，本函数不改写路径。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：env 有 `KNORVIA_STORAGE_DIR` → 返回它；env 无而最后一个项目文件写 `storage.dir: ""` → 返回 `""`（不是系统默认）；env 无、项目无 → 返回 `DefaultRuntimeConfig.storage.dir`（`~/.knorvia-studio`）。

### B46 用户配置的跳过与来源元数据

- 来源：`config/config-factory.ts`（`createConfig` 的 `skipUserConfig` 分支与 `sources.user`）
- 输入：`skipUserConfig?`、`userConfigPath?`。
- 输出：`skipUserConfig === true` 时用户结果固定为 `{config: {}, diagnostics: [], path: getDefaultConfigPath(), loaded: false}`（**不读文件**，`userConfigPath` 被忽略）；否则 `loadFileConfig(options.userConfigPath)`（`undefined` 表示默认路径）。`sources.user` 固定五+一个字段：`diagnostics`（原数组引用）、`path`、`loaded`、`hasMcpServers`（`userResult.config.mcp?.servers !== undefined`）、`hasUiLocale`、`hasUiTheme`、`mcpServerNames`（`Object.keys(userResult.config.mcp?.servers ?? {})`）。另外 `sources.env` 是「env patch 至少一个键」的布尔，`sources.cli` 是「`cliOverrides` 为真值」的布尔。
- 错误语义：不抛错（文件读取失败在 `loadFileConfig` 内变诊断）。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：默认路径由 `file-config.adapter` 解析（`~/.knorvia-studio/cli/config.json` 形态，见批次 C）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`skipUserConfig:true` 且 `userConfigPath` 指向不存在的文件 → `sources.user.loaded === false`、`sources.user.path === getDefaultConfigPath()`、`sources.user.diagnostics` 为空；`skipUserConfig:false`（缺省）且路径不存在 → `loaded === false` 且 `diagnostics.length >= 1`；`cliOverrides:{}` → `sources.cli === true`、不传 → `false`。

### B47 `config-factory.ts` 的导出面

- 来源：`config/config-factory.ts`
- 输入：无。
- 输出：按 `interface.md` 导出 `ConfigFactoryOptions`、`ConfigResult`、`McpServerConfigSource`、`PluginConfigScope`、`PluginConfigSources`、`createConfig`、`resolveWorkspaceStorageDir` 共 7 个声明；`tagHooks`、`readProjects`、`warnDiagnostics`、`projectSummary`、`describePlugins`、`effectiveMcp` 都是**内部函数**，不得导出。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`import * as factory from "…/config/config-factory.js"` 后 `Object.keys(factory).sort()` 与 `interface.md` 的 7 个名字一致；`factory.tagHooks === undefined`、`factory.describePlugins === undefined`。

### B48 `owners.test.mjs` 锁定的归属行为由本批与相邻条目覆盖

- 来源：`config/owners.test.mjs`（`unreviewed`，806 行，0 导出；当前不被 `pnpm test:studio` 收集——`scripts/test-studio.mjs` 只收集 `apps/cli/packages/adapters/test`，不含 `src/`）
- 输入：它用 TypeScript 转译 + `vm` 注入端口的方式，分别加载 `config-merger`、`project-config.adapter`、`file-config.adapter`、`config-factory` 四个 owner，锁定：作用域优先级与「同优先级后者覆盖」、`mergeConfigs` 的普通替换/插件键/钩子追加（B20、B21）、项目发现的 baseDir 与 stdio `cwd` 归一化、诊断顺序与失败筛查（B26）、文件配置的读取/保存顺序与错误包装、键保留与别名迁移（批次 C）、工厂的来源优先级、元数据、hook 标记与日志顺序（B37–B46）。
- 输出：本包把这些行为**逐条写进合同并由契约测试在真实公开入口上重放**；`owners.test.mjs` 本身不导出任何东西，不能作为契约测试的一部分。
- 错误语义：不适用（测试文件）。
- 时序与并发：不适用。
- 幂等：不适用。
- 资源释放：不适用。
- 平台差异：它的 `vm` 夹具硬编码 `/virtual/...` 路径，只覆盖 POSIX 形态；契约测试必须用临时目录同时覆盖 Windows 与 POSIX。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：本文件在替换阶段的删除依据是「同等行为已被 B20、B21、B26、B37–B46 与批次 C 的文件配置条目覆盖」——对应测试见 README 的「条目 → 测试」对照表；在第 5 步契约测试跑通（源码与 dist 双入口）之前不得删除该文件。
