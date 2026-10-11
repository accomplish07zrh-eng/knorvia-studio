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
