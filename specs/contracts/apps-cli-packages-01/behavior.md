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
- 输入：已应用 `0003` 及之前迁移、且可能已有 `session_target` 行的旧库。
- 输出：`0004` 建 `session_target`（`status` 只允许 `active|paused|complete`）；`0005` 建 `session_target_next`（`status` 增加 `budget_limited`，并新增 `token_budget`（可空）、`tokens_used`（默认 0）、`time_used_seconds`（默认 0）），把旧行迁过去（`token_budget` 置 null、计数置 0），再 `drop table session_target` 并 `rename session_target_next → session_target`——迁移后表名仍是 `session_target`，列是两个版本的并集。
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
- 错误语义：`get` 抛错只发生在既无 store 值又无默认值的键；`has` 是 `store.has(key) || 该键有默认值`（因此 `permission.mode`、`features.*` 等有默认值的键即使没写过也返回 `true`，判定「本次是否写入」要用 `getSources(key).length`）。
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
  - `skillOverrides` 的合并顺序是 `skill` 分区在前、`skills`（plural）的 catchall 键在**后** → 同 key 以 plural `skills` 为准；合并结果为空则不写该键。
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
- 输出：`env ?? project ?? base`。`base = createConfig({env: input.env}).config.storage.dir`（系统默认 `~/.knorvia-studio`，除非 env 覆盖）；`project` 遍历 `loadProjectConfigs(workingDirectory).files`，取**最后一个** `file.config.storage?.dir`，判据是 `!== null && !== undefined`（空串在实现判据里算值，但 schema 的 `storage.dir: min(1)` 让空串在真实配置文件里不可达）；`env` 是 `parseEnvConfig(env ?? process.env).storage?.dir`。环境变量优先级最高。
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

## C. 文件配置与上下文（`config/file-config.adapter.ts`、`context/`）

状态所有者：无长期状态。`file-config.adapter` 每次调用都「读文件 → 改内存对象 → 原子写回」，写回是**整个文件的替换**（临时文件 + `rename`），不带锁；`context/` 每次调用重算快照，不缓存、不写盘。

### B49 配置路径的解析与默认路径

- 来源：`config/file-config.adapter.ts`（`resolvePath`、`getDefaultConfigPath`、`hasDefaultConfigFile`）
- 输入：路径字符串；或 `{baseDir?, configFileName?}`。
- 输出：`resolvePath` 只把**以 `~/` 开头**的路径展开成 `join(homedir(), path.slice(2))`，其余一律 `resolve(path)`（因此单独的 `"~"` 被当作相对路径解析成 `<cwd>/~`）；默认基目录是**模块加载时**算出的 `join(resolveKnorviaDataRoot(), "cli")`，默认文件名逐字 `config.json`；`getDefaultConfigPath()` 返回默认基目录下的该文件名；`hasDefaultConfigFile()` 只做一次 `existsSync`。
- 错误语义：不抛错。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：`homedir()`/`resolve`/`join` 都是 `node:os`/`node:path` 语义，Windows 盘符与分隔符由其处理；`~/` 只在 POSIX 形态下被展开。
- 状态所有者：无（默认目录是模块常量）。
- 日志级别：无。
- 可测断言：`resolvePath("~/config.json") === join(homedir(), "config.json")`；`resolvePath("~") === resolve("~")`（不等于 `homedir()`）；`getDefaultConfigPath()` 等于 `join(resolve(join(resolveKnorviaDataRoot(), "cli")), "config.json")` 且以 `config.json` 结尾；`hasDefaultConfigFile()` 返回布尔。

### B50 `loadFileConfig` 的加载、诊断与默认补全

- 来源：`config/file-config.adapter.ts`（`loadFileConfig`、`invalidMessage`）
- 输入：`filePath?`（给定时优先）或 `options.baseDir`/`options.configFileName`；缺省用默认基目录与 `config.json`。
- 输出：文件不存在 → `{config:{}, diagnostics:[], path, loaded:false}`；存在且可解析 → `{config: <schema 映射结果>, diagnostics: <归一化诊断且每条补上 filePath>, path, loaded:true}`，其中**只有 `filePath === undefined` 的诊断**被补成该文件路径；解析/读取任一步抛错 → `{config:{}, diagnostics:[{code:"config_file_invalid", filePath, message, severity:"error"}], path, loaded:false}`。
- 错误语义（逐字保持）：zod 错误的消息按 `<issue.path 或 <config>>: <issue.message>` 用 `"; "` 连接；非 zod 的 `Error` 用其 `message`；其它值用逐字 `Unable to parse config file.`。读取失败与 JSON 解析失败都走同一分支（都变成该单条 error 诊断，不抛给调用方）。
- 时序与并发：同步；`existsSync` 在读取前。
- 幂等：是（不写文件，见 B51 的迁移例外）。
- 资源释放：无（同步读取随作用域结束）。
- 平台差异：路径来自 `resolvePath`；CJK/多字节内容按 `utf-8` 读取。
- 状态所有者：无。
- 日志级别：无（诊断以数据返回，由 `config-factory` 打 `warn`）。
- 可测断言：`loadFileConfig(<临时目录里不存在的文件>)` → `loaded === false`、`config` 为 `{}`、`diagnostics` 为 `[]`、`path` 等于解析后的绝对路径；写一个内容为 `{"storage":{"dir":"/tmp/a"},"unknown":1}` 的文件 → `loaded === true`、`config.storage.dir === "/tmp/a"`；写内容为非 JSON（如 `{`）→ `loaded === false`、`diagnostics[0].code === "config_file_invalid"`、`severity === "error"`、`filePath` 等于该文件路径；`loadFileConfig("", {baseDir, configFileName:""})`（空文件名）→ `path` 等于 `baseDir` 解析后的目录本身，且文件不存在时 `loaded === false`。

### B51 读取时的 CUA 别名迁移与「尽力而为」落盘

- 来源：`config/file-config.adapter.ts`（`migration`、`saveMigration`）
- 输入：从文件里 `JSON.parse` 出来的**原始**值。
- 输出：只有「值是对象且 `value.plugins` 是对象」时才检查；对 `enabledPlugins` 与 `options` 两个字段：该字段是对象且**自有** `LEGACY_CUA_PLUGIN_ID` 键时，做一次浅拷贝，`CANONICAL` 缺失才把 legacy 的值赋给它，然后删除 legacy 键；对 `suppressedBuiltins`：是数组时把其中的 legacy 逐项换成 canonical，**只有字符串化结果与原文不同**才算改动。整体只有 `changed === true` 才返回新对象（`{...value, plugins}`），否则返回 `undefined`（不落盘）。
- 落盘方式（逐字保持）：`saveMigration` 写 `path + ".migrate." + process.pid + "." + Date.now() + ".tmp"`，内容 `JSON.stringify(value, null, 2) + "\n"`、编码 `utf-8`、`mode: 0o600`，然后 `renameSync` 覆盖原文件；**任何失败都被吞掉**（`catch` 里只尝试 `unlinkSync(temp)`，失败也不再抛）。
- 关键点：`loadFileConfig` 把**原始**（未迁移）值交给 `parseConfigFileToRuntimePatchWithDiagnostics`，迁移只影响落盘的文件内容，不影响本次返回值。
- 错误语义：迁移失败静默；调用方拿不到迁移异常。
- 时序与并发：同步；在解析配置之前发生；两个进程同时迁移可能互相覆盖（没有锁，也没有重读校验）。
- 幂等：是（迁移后文件里不再有 legacy 键，第二次读取不再改动、不落盘）。
- 资源释放：临时文件在成功时被 `rename` 消耗，失败时尽力删除。
- 平台差异：路径拼接用字符串 `+`（临时文件与原文件同目录）；Windows 上 `renameSync` 覆盖已存在文件由 Node 保证。
- 状态所有者：配置文件（`knorvia.json` 的 `plugins` 分区）。
- 日志级别：无（静默迁移，这是「尽力而为」的既有语义）。
- 可测断言：文件内容 `{"plugins":{"enabledPlugins":{"cua@knorvia-plugins-bundled":true}}}}` → 读取后文件内容变成 `plugins.enabledPlugins` 只有 `computer-use@knorvia-plugins-bundled`（且 JSON 为 2 空格缩进 + 末尾换行）；同时 `loadFileConfig` 的返回值里若 schema 判定 legacy 键有效则保留 legacy 语义（返回值按原始值解析）；第二次调用不再改写文件（比较写入前后 `mtime`/内容不变）；`suppressedBuiltins:["cua@knorvia-plugins-bundled"]` → 落盘为 `["computer-use@knorvia-plugins-bundled"]`；文件里没有 legacy 键时不产生任何 `.migrate.*.tmp` 残留。

### B52 写回路径的读取与原子保存契约

- 来源：`config/file-config.adapter.ts`（`readJson`、`readJsonOrEmpty`、`saveJson`）
- 输入：目标路径（调用方已 `resolvePath`）。
- 输出：读取失败抛逐字 `Unable to read config file: <path>`（`cause` 是原始错误）；JSON 解析失败抛逐字 `Unable to parse config file as JSON: <path>`；解析结果不是普通对象抛逐字 `Config file must contain a JSON object: <path>`。`readJsonOrEmpty` 只把 `cause.code === "ENOENT"` 的读取失败当成 `{}`，其它错误照抛。`saveJson` 先 `mkdir(dirname(path), {recursive:true})`，再写临时文件 `join(dir, "." + basename(path) + "." + process.pid + "." + Date.now() + "." + Math.random().toString(16).slice(2) + ".tmp")`（**与原文件同目录**、文件名以 `.` 开头、以 `.tmp` 结尾），内容 `JSON.stringify(value, null, 2) + "\n"`、`mode: 0o600`，成功后 `rename` 到目标；写入或 `rename` 失败时先尽力 `unlink` 临时文件，再抛逐字 `Unable to write config file: <path>`（`cause` 是原始错误）。
- 错误语义：`mkdir` 在 `try` 之外，其失败**原样冒泡**（不带包装、不删临时文件，因为还没创建）；`unlink` 的失败被吞掉。
- 时序与并发：异步；每次保存都是「先写临时文件再 rename」，不存在「先截断原文件」的窗口；没有锁，并发保存后写者胜。
- 幂等：内容相同则写出相同字节（但临时文件名不同）。
- 资源释放：`readFile`/`writeFile`/`rename`/`unlink` 都是 `node:fs/promises`，句柄随调用释放；临时文件在异常路径被清理。
- 平台差异：临时文件通过 `join` 构造，避免手写分隔符；`mode: 0o600` 在 Windows 上被忽略（不报错）。
- 状态所有者：配置文件。
- 日志级别：无。
- 可测断言：对空目录里的新路径调用 `updateUiLocaleInFileConfig` → 目录被递归创建、文件内容逐字等于 `{\n  "ui": {\n    "locale": "en"\n  }\n}\n`、目录里没有残留 `*.tmp`；对内容为 `"[]"` 的文件调用任一更新函数 → 抛 `Config file must contain a JSON object: <path>`；对内容为 `not json` → 抛 `Unable to parse config file as JSON: <path>` 且 `cause` 是 `SyntaxError`；目标路径的父目录不可创建（例如父路径是一个已存在的**文件**）→ 抛出的是 `mkdir` 的原始 `Error`（`message` 不含 `Unable to write config file:`）。

### B53 `updateUiLocaleInFileConfig` 的读写语义

- 来源：`config/file-config.adapter.ts`（`updateUiLocaleInFileConfig`）
- 输入：`filePath`、`locale`（`UiLocale`）。
- 输出：读入现有 JSON（缺失文件按 `{}`），写回 `{...value, ui: {...record(value.ui), locale}}`——即保留全部未知顶层键与 `ui` 下其它键，只覆盖/新增 `locale`；返回 `{locale, path}`（`path` 是 `resolvePath(filePath)` 的结果，`locale` 原样回传）。
- 错误语义：读/写错误按 B52 抛错（错误消息里带解析后的路径）。
- 时序与并发：异步、单次读改写。
- 幂等：是（同值重复调用内容相同）。
- 资源释放：同 B52。
- 平台差异：同 B52。
- 状态所有者：配置文件。
- 日志级别：无。
- 可测断言：`{"unknown":{"keep":1},"ui":{"theme":"dark"}}` + `updateUiLocaleInFileConfig(p,"zh-CN")` → 文件里 `unknown` 与 `ui.theme` 保留、`ui.locale === "zh-CN"`；返回值为 `{locale:"zh-CN", path:<绝对路径>}`；文件不存在时创建 `{"ui":{"locale":...}}`。

### B54 `updatePluginEnabledInFileConfig` 的别名清理与显式取值

- 来源：`config/file-config.adapter.ts`（`updatePluginEnabledInFileConfig`、`deleteAliases`）
- 输入：`filePath`、`pluginId`、`enabled`。
- 输出：`canonical = canonicalizePluginId(pluginId)`；把现有 `plugins.enabledPlugins` 的**全部别名键**（`pluginIdAliases(canonical)`，即 CUA 时的 canonical + legacy）先删掉，再写入 `enabledPlugins[canonical] = enabled`（显式 `true`/`false`，不做「缺省即启用」的省略）；`plugins` 下其它键与文件其它顶层键保留。返回 `{enabled, path, pluginId}`——`pluginId` 是**调用方传入的原值**（不做规范化）。
- 错误语义：`enabledPlugins` 不是对象时按 `{}` 处理（不抛错）；读写错误按 B52。
- 时序与并发：异步；一次读改写。
- 幂等：是。
- 资源释放：同 B52。
- 平台差异：无（插件 id 大小写敏感）。
- 状态所有者：配置文件。
- 日志级别：无。
- 可测断言：文件里 `{"plugins":{"enabledPlugins":{"cua@knorvia-plugins-bundled":false,"other":false},"options":{"cua@knorvia-plugins-bundled":{"keep":1}}}}` 上调 `(p,"cua@knorvia-plugins-bundled",true)` → 文件里只有 `{"other":false,"computer-use@knorvia-plugins-bundled":true}`，`options` 未被本次调用改动；返回值 `pluginId === "cua@knorvia-plugins-bundled"`；对非 CUA id 调用只影响该 id 一个键。

### B55 `enablePluginsByDefaultInFileConfig` 的「只补未声明项」

- 来源：`config/file-config.adapter.ts`（`enablePluginsByDefaultInFileConfig`）
- 输入：`filePath`、`pluginIds`（只读数组）。
- 输出：`pluginIds` 为空 → **不读文件、不写文件**，直接返回 `{enabledIds: [], path}`；否则读入现有 `enabledPlugins`（非对象按 `{}`），`enabledIds = pluginIds.filter(id => !owns(current, id))`（**保留重复项与顺序**，只看键是否存在，不看值）；`enabledIds` 非空才写回 `{...current, ...每个 id: true}`（后出现的重复 id 在对象里合并）；返回 `{enabledIds, path}`，其中 `enabledIds` 是过滤后的数组（含重复）。
- 错误语义：读写错误按 B52。
- 时序与并发：异步；一次读改写。
- 幂等：是（第二次调用 `enabledIds` 为空、不再写文件）。
- 资源释放：同 B52。
- 平台差异：无。
- 状态所有者：配置文件。
- 日志级别：无。
- 可测断言：现有 `{"other":false}` + `["other","fresh","fresh"]` → 返回 `enabledIds` 深度等于 `["fresh","fresh"]`，文件里 `enabledPlugins` 为 `{other:false, fresh:true}`；`[]` → 不产生任何写（可用只读目录或 `mtime` 不变验证）；同一次再次调用 → `enabledIds` 为空数组且不写。

### B56 `updatePluginOptionsInFileConfig` 的基线选择与清理键

- 来源：`config/file-config.adapter.ts`（`updatePluginOptionsInFileConfig`）
- 输入：`filePath`、`pluginId`、`options`、`clearOptionKeys = []`。
- 输出：`canonical = canonicalizePluginId(pluginId)`、`aliases = pluginIdAliases(canonical)`；基线 `current` 取**先 canonical 后 legacy**：`outer[canonical]` 是对象就用它，否则用 `outer[aliases[1]]`（非 CUA 时 `aliases[1]` 不存在 → `{}`）；从基线里删掉 `clearOptionKeys` 的键，再与传入 `options` 做 `{...retained, ...options}`（传入值覆盖）；原 `options` 的两个别名键都被删除后写入 `options[canonical]`；返回 `{clearedOptionKeys: clearOptionKeys, options, path, pluginId}`——`options` 是**调用方传入的对象原引用**，`pluginId` 是传入原值。
- 错误语义：基线值不是对象按 `{}`；读写错误按 B52。
- 时序与并发：异步；一次读改写。
- 幂等：是同值时（但清理键会持续生效）。
- 资源释放：同 B52。
- 平台差异：无。
- 状态所有者：配置文件。
- 日志级别：无。
- 可测断言：文件里 `options:{"cua@…":{"keep":"yes","drop":"no"},"other":{"v":3}}` 上调 `(p,"cua@…",{drop:"readded",new:1},["drop"])` → 文件里 canonical 的 options 为 `{keep:"yes",drop:"readded",new:1}`、`other` 不变、legacy 键消失；返回 `clearedOptionKeys` 与传入数组同一引用；传 `[]` 的 `clearOptionKeys` → 只做覆盖合并。

### B57 `removePluginFromFileConfig` 与 `removePluginEnabledFromFileConfig` 的删除语义

- 来源：`config/file-config.adapter.ts`（`removePluginFromFileConfig`、`removePluginEnabledFromFileConfig`）
- 输入：`filePath`、`pluginId`。
- 输出：两者都用 `pluginIdAliases(pluginId)`（**不先规范化**，传入 legacy 时同时命中 canonical 与 legacy）；`removePluginFromFileConfig` 的 `removedEnabled`/`removedOptions` 用 `alias in table` 判定（含值 `false` 的键也算命中），任一为真才写回（同时清理 `enabledPlugins` 与 `options` 的别名键），返回 `{path, pluginId, removedEnabled, removedOptions}`；`removePluginEnabledFromFileConfig` 用 `owns(current, alias)` 判定，只清理 `enabledPlugins`，返回 `{path, pluginId, removedEnabled}`。两者在没有任何命中时**不写文件**。
- 错误语义：读写错误按 B52；表不是对象按 `{}`。
- 时序与并发：异步；一次读改写。
- 幂等：是（第二次调用两个 flag 都是 `false`，不写）。
- 资源释放：同 B52。
- 平台差异：无。
- 状态所有者：配置文件。
- 日志级别：无。
- 可测断言：对不存在的 id 调用 `removePluginEnabledFromFileConfig` → 返回 `removedEnabled === false` 且文件 `mtime`/内容不变；对 `{"enabledPlugins":{"other":false},"options":{"cua@…":{"x":1}}}` 调用 `removePluginFromFileConfig(p,"cua@…")` → `{removedEnabled:false, removedOptions:true}`，文件里 `enabledPlugins` 保留 `other`、`options` 里 legacy 键被删。

### B58 抑制内置插件（suppressedBuiltins）的登记与移除

- 来源：`config/file-config.adapter.ts`（`addSuppressedBuiltinInFileConfig`、`removeSuppressedBuiltinInFileConfig`、`stringList`）
- 输入：`filePath`、`pluginId`。
- 输出：读取时用 `stringList`——非数组按 `[]`，数组里**只保留字符串**项（非字符串被静默丢弃）。`add…` 用 `canonicalizePluginId` + `pluginIdAliases(canonical)`：先删掉所有别名项，若「没有删掉任何项」且「原数组已含 canonical」则**不写**；否则写回 `[...retained, canonical]`（canonical 追加到末尾），返回 `{path, pluginId, suppressed: true}`。`remove…` 用 `pluginIdAliases(pluginId)`（不规范化）：过滤掉别名项，长度变化才写回，返回 `{path, pluginId, suppressed: false}`。
- 错误语义：读写错误按 B52；非字符串项被丢弃是既有语义（不是错误）。
- 时序与并发：异步；一次读改写。
- 幂等：`add` 重复调用第二次不写；`remove` 重复调用不写。
- 资源释放：同 B52。
- 平台差异：无。
- 状态所有者：配置文件。
- 日志级别：无。
- 可测断言：`suppressedBuiltins:["cua@knorvia-plugins-bundled","other"]` + `add("cua@…")` → `["other","computer-use@knorvia-plugins-bundled"]`；`["other","computer-use@knorvia-plugins-bundled"]` + `add("cua@…")` → 不写（内容不变）；`remove("cua@…")` 从 `["other","computer-use@knorvia-plugins-bundled"]` → `["other"]`；数组里混入 `4` → 写回时被丢弃。

### B59 `file-config.adapter.ts` 的导出面

- 来源：`config/file-config.adapter.ts`
- 输入：无。
- 输出：按 `interface.md` 导出 6 个类型/接口（`LoadedConfig`、`UiLocalePatchResult`、`PluginEnabledPatchResult`、`PluginOptionsPatchResult`、`PluginRemovePatchResult`、`SuppressedBuiltinPatchResult`）与 12 个函数（`resolvePath`、`getDefaultConfigPath`、`hasDefaultConfigFile`、`loadFileConfig`、`updateUiLocaleInFileConfig`、`updatePluginEnabledInFileConfig`、`enablePluginsByDefaultInFileConfig`、`updatePluginOptionsInFileConfig`、`removePluginFromFileConfig`、`removePluginEnabledFromFileConfig`、`addSuppressedBuiltinInFileConfig`、`removeSuppressedBuiltinInFileConfig`），共 18 个声明；`FileConfigOptions` **不导出**（内部接口），`migration`/`saveMigration`/`readJson`/`saveJson` 也不导出。`config/index.ts` 再导出其中 14 个（12 个函数 + `PluginEnabledPatchResult`、`PluginOptionsPatchResult`、`PluginRemovePatchResult`、`SuppressedBuiltinPatchResult`、`UiLocalePatchResult` 5 个类型里的 4 个，见 interface.md 的 `config/index.ts` 段）。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`Object.keys(await import("…/config/file-config.adapter.js")).sort()` 与 `interface.md` 的 18 个名字一致；`mod.FileConfigOptions === undefined`。

### B60 git 快照只跑只读命令，且有固定超时与缓冲上限

- 来源：`context/git-snapshot.ts`（`execGitNoThrow`）
- 输入：`workingDirectory` 与 git 参数数组。
- 输出：固定用 `execFile("git", args, {cwd, encoding:"utf8", maxBuffer: 1 MiB, timeout: 3000 ms, windowsHide: true}`；成功返回 `{code:0, stdout, stderr}`（`Buffer` 或字符串都按 `utf8` 转字符串），失败返回 `{code: 数字 code 或 1, stdout:"", stderr:""}`——**失败时丢弃全部输出**，不把不可靠的输出写进 provider 可见上下文。
- 错误语义：所有 git 失败都被吞成结果对象（`resolveGitSnapshot` 不抛错）。
- 时序与并发：串行 `await`；单条命令 3 s 超时。
- 幂等：只读命令（`rev-parse`、`symbolic-ref`、`show-ref --verify --quiet`、`config user.name`、`--no-optional-locks status --short`、`--no-optional-locks log --oneline -n 5`），不修改仓库状态、不写索引锁（`--no-optional-locks`）。
- 资源释放：`execFile` 的子进程随 promise 结束回收，超时会杀掉。
- 平台差异：`windowsHide: true` 在 Windows 上不闪窗；命令名统一 `git`（依赖 PATH）。
- 状态所有者：无（快照对象每次新建）。
- 日志级别：无。
- 可测断言：对**非仓库**目录调用 `resolveGitSnapshot` → `isGitRepository === false`、`gitStatus === "not_repo"`（且不受路径不存在影响，git 失败被吞）；对临时 git 仓库调用 → `isGitRepository === true` 且后续字段齐全（见 B61）；调用前后仓库的 `HEAD`、`git status --short` 输出不变。

### B61 git 仓库快照的字段与状态判定

- 来源：`context/git-snapshot.ts`（`resolveGitSnapshot`、`resolveGitBranch`、`resolveGitUser`、`splitNonEmptyLines`）
- 输入：工作目录。
- 输出：先 `git rev-parse --is-inside-work-tree`，输出去空白后**必须逐字等于 `"true"`** 才继续；否则返回 `{isGitRepository:false, gitStatus:"not_repo"}`。仓库内返回：`gitBranch` 取 `rev-parse --abbrev-ref HEAD` 去空白，空则逐字 `"HEAD"`（分离头指针场景）；`gitMainBranch` 见 B64；`gitUser` 取 `git config user.name` 去空白（未配置为 `undefined`）；`gitStatusLines` 来自 `--no-optional-locks status --short`；`gitStatus` 是 `lines.length > 0 ? "dirty" : "clean"`；`recentCommits` 取 `log --oneline -n 5` 的非空行、每行 `trimEnd`、最多 5 条。
- 错误语义：任一条命令失败都按空输出处理（不会抛错）。
- 时序与并发：串行；先判仓库再取四项信息。
- 幂等：是（只读）。
- 资源释放：无。
- 平台差异：换行按 `/\r?\n/u` 切分，Windows 的 CRLF 与 POSIX 的 LF 都兼容。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：临时仓库（`git init` + 提交一次）且工作区干净 → `isGitRepository === true`、`gitStatus === "clean"`、`gitStatusLines` 为空数组、`recentCommits` 长度为 1 且是 `--oneline` 形态（`<sha> <subject>`）；新建一个未跟踪文件后 → `gitStatus === "dirty"` 且 `gitStatusLines` 含 `?? <file>`；`gitUser` 在 `git config --local user.name` 设置后等于该名字。

### B62 `git status` 的 2k 字符截断与平台提示

- 来源：`context/git-snapshot.ts`（`splitGitStatusForContext`、`gitStatusToolName`）
- 输入：`git status --short` 的原始输出（已 `trim`）。
- 输出：空串 → 空数组；长度 ≤ 2000 个字符 → 按 `/\r?\n/u` 切分后**丢弃空行**；长度 > 2000 → 取前 2000 个字符，追加换行与逐字固定后缀 `... (truncated because it exceeds 2k characters. If you need more information, run "git status" using <Bash|PowerShell>)`（`win32` 用 `PowerShell`，其它平台用 `Bash`），再逐行切分并丢弃空行。截断**按字符数**，不按文件条目数。
- 错误语义：不抛错。
- 时序与并发：纯函数（在快照流程里同步调用）。
- 幂等：是。
- 资源释放：无。
- 平台差异：提示里的工具名随 `process.platform === "win32"` 切换。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：干净仓库 → `gitStatusLines` 为 `[]`；制造超过 2000 字符的未跟踪文件列表 → 最后一行逐字等于 `... (truncated because it exceeds 2k characters. If you need more information, run "git status" using Bash)`（Windows 上为 `PowerShell`），且列表里没有任何空行。

### B63 git 主分支的候选顺序

- 来源：`context/git-snapshot.ts`（`resolveMainBranch`）
- 输入：工作目录。
- 输出：先读 `symbolic-ref --short refs/remotes/origin/HEAD`，去掉前缀 `origin/` 得到候选 0；候选序列是 `[originHeadBranch?, "main", "master"]`（没有 `origin/HEAD` 时就是 `["main","master"]`）；返回**第一个** `show-ref --verify --quiet refs/remotes/origin/<候选>` 成功的候选；一个都不成功时返回逐字 `"main"`。
- 错误语义：不抛错（命令失败按「不存在」处理）。
- 时序与并发：串行探测。
- 幂等：是。
- 资源释放：无。
- 平台差异：无（只用 git 的引用名）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：临时仓库没有任何 `origin/*` 远端引用 → `gitMainBranch === "main"`；把 `master` 作为本地默认分支且存在 `refs/remotes/origin/master`（用 `git update-ref` 造出来）→ `gitMainBranch === "master"`；存在 `refs/remotes/origin/trunk` 且 `origin/HEAD` 指向它 → `gitMainBranch === "trunk"`。

### B64 `NodeContextSourceAdapter` 的快照装配

- 来源：`context/index.ts`（`NodeContextSourceAdapter.resolveContextSources`、`createNodeContextSourceAdapter`）
- 输入：`ContextSourceRequest`（`workingDirectory` 必填；`envInfo`、`userInstructions`、`projectContext`、`currentDate`、`effectiveShellDisplayName` 可选）与构造参数 `{env?}`。
- 输出：`workingDirectory` 先 `resolve`；`envInfo` 优先用请求里的，否则 `detectEnvInfo(...)`；`projectRoot` 由 `.git` 标记向上查找（见 B69），`userInstructions` 只有在请求里给了才解析，并把 `workingDirectory`（缺省用解析后的工作目录）与 `projectRoot`（缺省用找到的项目根，找不到时为 `undefined`）补进去；`projectContext` 优先用请求里的，否则项目根存在时才探测；`currentDate` 缺省用 `formatLocalIsoDate(new Date())`；`diagnostics` 是本次新建的数组（只由指令文件读取失败填充）；返回对象固定含 `workingDirectory`、`envInfo`、`currentDate`、`userInstructions`、`projectContext`、`diagnostics`。
- 错误语义：不抛错（文件读取失败进诊断，git 失败按空输出）。
- 时序与并发：异步串行；一次调用算一份快照。
- 幂等：是（除 `currentDate` 取决于当前时间）。
- 资源释放：无（`readFile`/`stat` 句柄随调用释放）。
- 平台差异：`.git` 标记既可能是目录也可能是文件（worktree/submodule），`stat` 都能命中；路径比较用 `resolve` 后的绝对路径。
- 状态所有者：无（快照对象）。
- 日志级别：无。
- 可测断言：`request.envInfo` 传值 → 返回同一对象引用；`request.projectContext` 传值 → 同一引用且不读盘；`request.currentDate` 传值 → 原样返回，不传时等于 `formatLocalIsoDate(new Date())`（同一分钟内相等）；`createNodeContextSourceAdapter().resolveContextSources({workingDirectory})` 返回的 `workingDirectory` 等于 `resolve(workingDirectory)`。

### B65 `detectEnvInfo` 的 shell 与版本字段

- 来源：`context/index.ts`（`NodeContextSourceAdapter.detectEnvInfo`）
- 输入：解析后的工作目录、可选 `effectiveShellDisplayName`。
- 输出：`shellPath = env.SHELL ?? env.ComSpec ?? env.COMSPEC ?? ""`；`shell = effectiveShellDisplayName ?? (shellPath ? basename(shellPath) : "unknown")`；其余字段逐字为 `cwd: <解析后目录>`、`platform: process.platform`、`osVersion: "<platform> <release()> <arch()>"`、`nodeVersion: process.version`，最后展开 `resolveGitSnapshot(workingDirectory)` 的结果（`isGitRepository`、`gitBranch`、`gitMainBranch`、`gitUser`、`gitStatus` 及其余）。
- 错误语义：不抛错。
- 时序与并发：异步（内部跑 git）。
- 幂等：是（除 `gitUser` 等取决于仓库状态）。
- 资源释放：无。
- 平台差异：Windows 上通常没有 `SHELL`，退回 `ComSpec`/`COMSPEC`（值形如 `C:\Windows\system32\cmd.exe`，`basename` 得到 `cmd.exe`）；`effectiveShellDisplayName` 优先于环境变量，跨平台一致。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`new NodeContextSourceAdapter({env:{SHELL:"/bin/zsh"}})` 在非仓库临时目录上 `resolveContextSources` → `envInfo.shell === "zsh"`、`envInfo.cwd === resolve(dir)`、`envInfo.isGitRepository === false`；`env` 为空对象且请求带 `effectiveShellDisplayName:"knorvia-shell"` → `shell === "knorvia-shell"`；`env` 里只有 `ComSpec` → `shell === basename(ComSpec)`；都没有 → `shell === "unknown"`。

### B66 用户指令文件的发现顺序与合并

- 来源：`context/index.ts`（`resolveUserInstructions`、`findDefaultUserInstructionFile`、`findInstructionFile`、`dedupeInstructionFileCandidates`、`mergeInstructionSources`）
- 输入：`UserInstructionsOptions`（`workingDirectory`、`priorityFiles?`、`maxBytes?`、`projectRoot?`）与注入的 `env`。
- 输出：`priorityFiles` 缺省逐字 `["AGENTS.md"]`，`maxBytes` 缺省 `100 * 1024`；候选按「用户级 → 工作区级」两台车：用户级文件是 `join(resolveKnorviaDataRoot(env), "AGENTS.md")`，**只有 `priorityFiles` 含 `AGENTS.md` 时才查**；工作区级从 `workingDirectory` 起向上逐级、每级按 `priorityFiles` 顺序找第一个存在的文件，到 `projectRoot` 那一级或文件系统根停止（两者都含）。候选按 `resolve(filePath)` 去重（保留先出现的）。逐候选读取，全部失败则整体 `undefined`；否则合并：`filePath`/`fileName` 取**第一个 `scope === "workspace"` 的候选**（没有工作区候选时取第一个用户级候选），`content` 是各候选内容用 `"\n\n"` 连接，`bytesRead`/`sizeBytes` 是求和，`truncated` 是「任一所截断」。
- 错误语义：单个文件读失败 → 诊断 `{code:"user_instructions_read_failed", message: <Error.message 或 "Failed to read user instructions">, path: <文件路径>}` 并跳过该候选，不影响其它候选。
- 时序与并发：异步串行；每候选一次 `stat` + 一次 `readFile`。
- 幂等：是。
- 资源释放：`stat`/`readFile` 句柄随调用释放。
- 平台差异：向上查找用 `dirname` 与 `resolve`；`resolveKnorviaDataRoot(env)` 支持 `KNORVIA_DATA_BASE_DIR`/`KNORVIA_HOME` 覆盖（用户数据目录规则不在本包改，只用它）；Windows 根目录判断由 `dirname(current) === current` 处理（避免死循环）。
- 状态所有者：无。
- 日志级别：无（诊断以数据返回）。
- 可测断言：临时项目根（存放 `.git` 目录）+ `AGENTS.md` + 子目录 → 在子目录调用 `resolveContextSources({workingDirectory: 子目录, userInstructions:{}})` → `userInstructions.scope` 为 `"workspace"`、`filePath` 是项目根下的 `AGENTS.md`、`content` 等于文件内容；`priorityFiles:["OTHER.md"]` 且只有 `AGENTS.md` 存在 → `userInstructions === undefined`；用户级 `KNORVIA_HOME` 指向含 `AGENTS.md` 的临时目录 + 工作区也有 → `sources` 长度为 2、`content` 是两者以 `"\n\n"` 连接、`filePath` 取工作区那个；把工作区 `AGENTS.md` 换成不可读（用目录顶替文件）→ `diagnostics` 含一条 `user_instructions_read_failed`。

### B67 指令内容的截断语义

- 来源：`context/index.ts`（`readInstructionSource`、`readFirstTextBytes`）
- 输入：候选文件与 `maxBytes`。
- 输出：先 `stat` 取 `size`，`bytesToRead = min(size, maxBytes)`，读取该字节数并按 `utf8` 解码；返回 `{scope, filePath, fileName, content, bytesRead: Buffer.byteLength(content), sizeBytes: info.size, truncated: info.size > maxBytes}`。**`truncated` 只看原始大小是否超过 `maxBytes`**；`bytesRead` 是解码后内容的字节数（多字节字符被截断到一个不完整序列时，`bytesRead` 可能与 `bytesToRead` 不等）。
- 错误语义：`stat`/`readFile` 失败走 B66 的诊断分支。
- 时序与并发：异步。
- 幂等：是。
- 资源释放：无。
- 平台差异：按字节截断，不按字符；`utf8` 解码对多字节字符的处理由 Node 决定。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：写一个内容长于 `maxBytes:8` 的纯 ASCII 文件（如 20 个字母）→ `truncated === true`、`content.length === 8`、`bytesRead === 8`、`sizeBytes === 20`；文件短于上限 → `truncated === false`、`content` 是全文。

### B68 项目根标记与项目类型探测

- 来源：`context/index.ts`（`findProjectRoot`、`hasGitMarker`、`detectProjectContext`）
- 输入：起始目录 / 项目根。
- 输出：`findProjectRoot` 从 `resolve(startDir)` 起逐级向上，第一个存在 `.git`（文件或目录）的目录即项目根；走到 `dirname(current) === current` 时停止且**根目录本身不检查**；一个都没有返回 `null`。`detectProjectContext(projectRoot)` 按固定顺序判定：`package.json` 存在 → `type: "node"`（同时尝试取 `scripts` 对象，JSON 解析失败仍是 `"node"`）；否则依次看 `requirements.txt`、`pyproject.toml`、`setup.py`、`Pipfile` → `"python"`；再 `Cargo.toml` → `"rust"`；再 `go.mod` → `"go"`；再 `pom.xml`/`build.gradle`/`build.gradle.kts` → `"java"`；都没有 → `"unknown"`。`packageManager` 独立判定，顺序 `pnpm-lock.yaml` → `pnpm`、`yarn.lock` → `yarn`、`bun.lockb` → `bun`、`package-lock.json` → `npm`，都没有则 `undefined`。`buildFiles` 按 `Makefile`、`docker-compose.yml`、`docker-compose.yaml`、`Dockerfile` 顺序收集存在的项，**为空时返回 `undefined`**（不是空数组）。`scripts` 只在 `package.json` 是对象且 `scripts` 是对象时给出（其它情况 `undefined`）。
- 错误语义：所有探测都吞掉文件系统错误（`isFile` 返回 `false`）。
- 时序与并发：异步；每个候选一次 `stat`（`package.json` 多一次 `readFile`）。
- 幂等：是。
- 资源释放：无。
- 平台差异：`join`/`resolve`/`stat` 跨平台；大小写敏感性由文件系统决定。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：临时目录里放 `.git` 目录与 `package.json`（含 `scripts:{build:"x"}`）→ 在更深子目录调用 `resolveContextSources({workingDirectory: 深目录, projectContext 不传})` → `projectContext.type === "node"`、`scripts` 深度等于 `{build:"x"}`；同一目录加 `pnpm-lock.yaml` 与 `Dockerfile` → `packageManager === "pnpm"`、`buildFiles` 深度等于 `["Dockerfile"]`；只有 `Cargo.toml` → `type === "rust"`；什么都没有 → `type === "unknown"`、`packageManager === undefined`、`buildFiles === undefined`；`.git` 不是标记时（放在子目录的下级）项目根取最近的祖先。

### B69 `context/index.ts` 的导出面

- 来源：`context/index.ts`
- 输入：无。
- 输出：只导出 `NodeContextSourceAdapterOptions`、`NodeContextSourceAdapter`、`createNodeContextSourceAdapter` 三个声明；`resolveUserInstructions`、`findInstructionFile`、`detectProjectContext`、`findProjectRoot` 是内部函数，不得导出（`createNodeContextSourceAdapter(options)` 返回一个 `NodeContextSourceAdapter` 实例）。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`Object.keys(await import("…/context/index.js")).sort()` 与 `interface.md` 的三个名字一致；`createNodeContextSourceAdapter() instanceof NodeContextSourceAdapter`；`mod.detectProjectContext === undefined`。

### B70 `git-snapshot.ts` 的导出面

- 来源：`context/git-snapshot.ts`
- 输入：无。
- 输出：只导出 `resolveGitSnapshot(workingDirectory): Promise<Partial<EnvInfo>>` 一个声明；`splitGitStatusForContext`、`execGitNoThrow`、`resolveMainBranch`、`resolveGitBranch`、`resolveGitUser` 都是内部函数。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`Object.keys(await import("…/context/git-snapshot.js"))` 深度等于 `["resolveGitSnapshot"]`。

## D. 自定义命令、进程探测与图片（`commands/`、`device/`、`image/`）

状态所有者：`NodeCustomCommandAdapter` 实例独占 `disabled` 集合与构造时的根选项（命令元数据每次调用重算）；`createProcessProbe` 的**连续失败计数**归实例所有，每次采样另有自己的截止；`cli-device-mid` 的**单飞缓存**是模块级 `Map<statePath, Promise<string>>`，同一路径只接受一次初始化；图片适配器无状态，全部输入输出走参数。

### B71 自定义命令的默认根发现与优先级

- 来源：`commands/roots.ts`（`resolveDefaultCustomCommandRoots`、`resolveProjectDirectories`、`findWorktreeRoot`）
- 输入：`workingDirectory`；`CustomCommandRootResolutionOptions`（`extraRoots?`、`extraResolvedRoots?`、`homeDirectory?`、`includeKnorviaCommands?`）。
- 输出：`workingDirectory` 先 `resolve`；`includeKnorviaCommands` 缺省 `true`、`homeDirectory` 缺省 `homedir()`；优先级从 0 起**每加入一个根 +10**，顺序固定：
  1. 每个 `extraRoots` 项 → `scope: "project"`、`source: "knorvia"`；
  2. （`includeKnorvia` 时）用户私有根 `join(privateRoot, "commands")`，其中 `privateRoot = options.homeDirectory ? join(home, ".knorvia-studio") : resolveKnorviaDataRoot()`，`scope: "user"`、`source: "knorvia"`；
  3. （同上）`join(home, ".agents", "commands")`，`scope: "user"`、`source: "agents"`；
  4. 对**项目目录链**的每一层依次加入 `join(dir, ".knorvia-studio", "commands")`（source `knorvia`）与 `join(dir, ".agents", "commands")`（source `agents`），`scope: "project"`——同一层 `.knorvia-studio` 在前（同名命令「先到先赢」）；
  5. `extraResolvedRoots` 原样追加（**不改 priority、不 resolve、不重生对象**）。
- 项目目录链：从 `workingDirectory` 起向上找第一个含 `.git` 标记的目录（`findWorktreeRoot`，用 `stat`，文件或目录都算）；找到则链是「工作目录 → … → 该目录」（含两端），找不到时链**只有工作目录自己**。`projectDirectories` 是异步逐级 `stat`。
- 错误语义：不抛错（`pathExists` 吞掉 `stat` 失败）。
- 时序与并发：异步串行 `stat`；纯读取，不写盘。
- 幂等：是（同样的目录树给出同样的根与优先级）。
- 资源释放：无。
- 平台差异：`resolve`/`join`/`dirname` 处理盘符与分隔符；Windows 根目录由 `dirname(current) === current` 终止。
- 状态所有者：无（每次调用新建数组）。
- 日志级别：无。
- 可测断言：注入 `homeDirectory` 到临时目录（避免碰真实主目录）→ 返回根的 `priority` 依次为 `10,20,30,…`（步长 10）；临时项目根（有 `.git`）里的深层子目录 → `project` 根覆盖子目录、父目录到项目根；`extraResolvedRoots:[{path:"/x",scope:"user",source:"agents",priority:7}]` → 该对象**同一引用**出现在结果末尾；`includeKnorviaCommands:false` → 结果里没有任何用户级/项目级 `.knorvia-studio`/`.agents` 根（只剩 `extraRoots`）；每个根的 `path` 都是 `resolve` 后的绝对路径。

### B72 配置根路径的展开与根对象形状

- 来源：`commands/roots.ts`（`resolveConfiguredRoot`、`root`、`HOME_PREFIX`）
- 输入：`extraRoots` 里的路径字符串、工作目录、home。
- 输出：以 `"~/"` 开头的路径展开为 `join(home, path.slice(2))`；展开后是绝对路径就原样使用，否则 `resolve(workingDirectory, 展开值)`；最终根对象的 `path` 一定再经过 `resolve`，字段固定为 `{path, scope, source, priority}`（不多不少）。
- 错误语义：不抛错（空串会 `resolve` 成工作目录）。
- 时序与并发：同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：`isAbsolute` 对 Windows 盘符路径返回 `true`。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`extraRoots:["~/cmds"]` 且 `homeDirectory:"/home/x"` → 第一个根 `path === resolve("/home/x/cmds")`；`extraRoots:["rel/cmds"]` → `path === resolve(workingDirectory, "rel/cmds")`；`extraRoots:["/abs/cmds"]` → `path === resolve("/abs/cmds")`；根的 own keys 排序后为 `["path","priority","scope","source"]`。

### B73 `discoverCommands` 的扫描、禁用、去重与排序

- 来源：`commands/index.ts`（`NodeCustomCommandAdapter.discoverCommands`）
- 输入：`{roots?, workingDirectory}` 与可选 `{signal}`。
- 输出：`roots` 缺省用 `resolveDefaultCustomCommandRoots(cwd, this.rootOptions)`；按 `priority` **升序稳定排序**（`toSorted`）逐根扫描；每个文件解析出元数据后，若 `this.disabled` 含 `resolve(metadata.path)` 则**完全跳过**（不计入 `totalDiscovered`）；同名命令只保留**先到者**，后来的产出 `custom_command_duplicate_name` 诊断（`message` 逐字 `Duplicate custom command ignored: <name>`、`severity: "warning"`）；`totalDiscovered` 统计通过禁用过滤与元数据校验的文件数（含被去重者）；返回的 `commands` 按 `name.localeCompare` 升序。
- 错误语义：单文件/单目录问题只写诊断（见 B74/B75），不抛错；`signal` 已中止时抛 `Custom command operation cancelled`（见 B77）。
- 时序与并发：异步串行（逐根、逐文件 `await`）；每次调用重建 `selected`/`diagnostics`。
- 幂等：是（同一文件系统状态同一结果）。
- 资源释放：无（`readdir`/`readFile` 句柄随调用释放）。
- 平台差异：路径用 `resolve` 比较禁用集合（构造时也 `resolve`），大小写在 Windows 上由文件系统决定。
- 状态所有者：`disabled` 集合在适配器实例上。
- 日志级别：无（诊断以数据返回）。
- 可测断言：两个根（优先级 10 与 20）各有一个同名 `foo.md` → `commands` 里只有先扫描到的那个，诊断含 1 条 `custom_command_duplicate_name`、`totalDiscovered === 2`；构造时传 `disabledPaths:[<后被发现的文件绝对路径>]` → 该文件不出现在结果、`totalDiscovered` 计 1；返回的 `commands` 名字按字典序（如 `a`、`b`、`z`）。

### B74 命令目录的枚举规则

- 来源：`commands/index.ts`（`enumerateDirectory`、`enumerateRoot`）
- 输入：根目录路径与诊断数组。
- 输出：`stat(root.path)` 不是目录 → 空；`ENOENT` → 空且**不写诊断**；其它 `stat` 失败 → 写 `{code:"custom_command_scan_failed", message:<Error.message 或 "Failed to scan command root: <path>">, path, severity:"warning"}` 后返回空。递归枚举：深度超过 **12** 直接返回（`depth > MAX_DEPTH`）；`DIR` 类型的目录递归；符号链接用 `stat` 解析（目录→递归、文件→按 `.md` 判定；解析失败**静默跳过**）；只收**文件名小写后以 `.md` 结尾**的普通文件；`readdir` 失败写 `custom_command_scan_failed`（message 缺省逐字 `Failed to scan command directory: <dir>`）并返回。
- 错误语义：所有失败都是诊断或静默跳过，不抛错。
- 时序与并发：异步；目录顺序沿用 `readdir` 返回顺序（不排序）。
- 幂等：是。
- 资源释放：无。
- 平台差异：`.md` 判定用 `toLowerCase()`，Windows 上 `FOO.MD` 也能收；符号链接解析在 Windows 需要权限时按「解析失败即跳过」处理。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：根目录里放 `a.md`、`b.MD`、`c.txt` 与子目录 `sub/d.md` → 发现 3 个 `.md`（不含 `c.txt`）；把根路径指向一个**文件** → 返回空且无诊断；指向不存在的路径 → 空且无诊断；嵌套超过 12 层 → 深层文件不被发现；指向一个不存在的路径时 `diagnostics` 为空数组。

### B75 命令元数据的解析、校验与诊断

- 来源：`commands/index.ts`（`readMetadata`、`normalizeName`、`frontmatterLines`、`removeFrontmatter`、`scalar`、`list`、`enabled`）
- 输入：`.md` 文件绝对路径与它所属的根。
- 输出：`name` = `relative(root.path, path)` 去掉 `.md` 扩展名后把 `[\\/]+` 换成 `":"`，再 `trim`、去掉开头 `/`、转小写；必须匹配 `^[a-z0-9][a-z0-9_:-]{0,63}$`，否则写 `custom_command_invalid_name`（`message` 逐字 `Invalid custom command name: <name>`、`severity:"error"`、带 `commandName`）并跳过该文件。frontmatter 必须**以 `---` 开头且第一行 trim 后逐字为 `---`**，以另一行 trim 后为 `---` 结束（支持 CRLF，忽略开头 BOM）；`end < 0` 视为没有 frontmatter。头部分行解析：空行、`#` 注释行、**以空白开头**的续行跳过；`indexOf(":") <= 0` 的行写 `custom_command_invalid_frontmatter`（`message` 逐字 `Invalid frontmatter line <行号> in <文件名>`，行号从 1 起、含 `---` 行）并继续；键值对同名后者覆盖，`frontmatterKeys` 保留出现顺序（含重复）。`description` 取 `description` 键的标量值，缺省时取正文第一个非空行（去掉行首 `#`/`-`/`*` 与空白后截断到 **1024** 字符）；两者都为空 → 写 `custom_command_invalid_frontmatter`（`message` 逐字 `Custom command must include a description or non-empty body: <path>`、`severity:"error"`）并跳过。未知键逐键写 `custom_command_unknown_frontmatter`（`message` 逐字 `Unknown custom command frontmatter key: <key>`、`severity:"warning"`），已知键集合逐字为 `allowed-tools`、`argument-hint`、`description`、`disable-noninteractive`、`model`、`skills`。
- 字段输出：`allowedTools`/`skills` 是 `list`（先去标量引号，去掉首 `[`、尾 `]`，按 `,` 切分、trim、丢空项）；`argumentHint`/`model` 是标量（`undefined` 表示缺省或空）；`description` 截断到 1024；`disableNonInteractive` 是 `enabled`（标量转小写等于 `"true"` 或 `"yes"`）；`plugin`/`scope`/`source`/`rootPath` 来自根对象；`path` 是文件绝对路径。
- 错误语义：读取失败：`ENOENT` 静默跳过；其它错误写 `{code:"custom_command_read_failed", message:<Error.message 或 "Failed to read custom command: <path>">, path, severity:"warning"}` 并跳过。
- 时序与并发：异步；单文件一次 `readFile`。
- 幂等：是。
- 资源释放：无。
- 平台差异：换行 `/\r?\n/`；BOM 被去掉；文件名大小写在 Windows 上不敏感（`normalizeName` 统一小写）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`sub/dir/MyCommand.md` 且正文为 `# Title\n\nDo it` → `name === "sub:dir:mycommand"`、`description === "Title"`、无诊断；frontmatter 含 `description: "quoted"` → `description === "quoted"`；含 `allowed-tools: [Read, Write]` → `["Read","Write"]`；含 `disable-noninteractive: yes` → `true`；含 `unknown-key: 1` → 一条 `custom_command_unknown_frontmatter`；名字含大写与空格的文件 → `custom_command_invalid_name` 且该命令不出现；只有空白正文且无 `description` → `custom_command_invalid_frontmatter`（error）且不出现；一行 `nocolon` → `custom_command_invalid_frontmatter`（warning）但命令仍然出现。

### B76 `loadCommand` 的查找、截断与正文

- 来源：`commands/index.ts`（`loadCommand`）
- 输入：`{name, maxBytes?, roots?, workingDirectory}` 与可选 `signal`。
- 输出：先用同一套 `discoverCommands` 解析出命令表；`name` 经 `normalizeName`（trim、去前导 `/`、小写）后精确查找；找不到 → 抛逐字 `Custom command not found: <request.name>`（**用调用方原值**，不规范化）；找到后 `maxBytes` 缺省 **100000**；`stat` 取 `sizeBytes = info.size`，`truncated = sizeBytes > maxBytes`；截断时用文件句柄只读前 `maxBytes` 字节（`Buffer.alloc(Math.max(0, maxBytes))` + `handle.read(..., 0)`），读完 `close`；未截断时整读。返回 `{metadata, bytesRead: <实际读取字节数>, content: removeFrontmatter(<读取内容按 utf8 解码>).trim(), sizeBytes, truncated}`。
- 错误语义：取消语义见 B77；`stat` 失败按 Node 的原错误抛出（因为元数据校验刚通过，路径应存在）；`open`/`readFile` 失败同样原样抛错。
- 时序与并发：异步；先做一次完整发现再读文件（同一 `maxBytes` 内不做缓存）。
- 幂等：是。
- 资源释放：截断分支用 `try/finally` 关闭句柄（`close` 失败会冒泡）。
- 平台差异：文件路径来自发现阶段；`readFile` 与 `open` 都是 `node:fs/promises`。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`maxBytes` 小于文件大小 → `truncated === true`、`bytesRead === maxBytes`、`content` 是被截断内容去掉 frontmatter 后 `trim` 的结果；不传 `maxBytes` 且文件小于 100000 → `truncated === false`、`bytesRead === sizeBytes`；名字传 `/FOO` 或 `" FOO "` → 命中 `foo`；名字不存在 → 抛出的 `message` 逐字包含 `Custom command not found: ` 与传入原值。

### B77 自定义命令的取消语义

- 来源：`commands/index.ts`（`cancelled`）
- 输入：`CustomCommandOperationOptions.signal`。
- 输出：`discoverCommands` 与 `loadCommand` 在**进入时、每根开始前、每个文件开始前**检查 `signal.aborted`；一旦为真就抛逐字 `Custom command operation cancelled`，不再继续扫描或读取。`loadCommand` 中 `discoverCommands` 的检查也会生效（因为它在同一调用栈里）。
- 错误语义：抛错（`Error`，消息逐字固定）。
- 时序与并发：同步检查，无竞态（只看 `aborted` 标志）。
- 幂等：中止后的重复调用同样立刻抛错。
- 资源释放：抛错前不会打开句柄（检查在 `open` 之前）。
- 平台差异：无。
- 状态所有者：调用方的 `AbortSignal`。
- 日志级别：无。
- 可测断言：传入已 `abort()` 的 `AbortController.signal` → `discoverCommands` 与 `loadCommand` 都以 `Custom command operation cancelled` 拒绝；扫描进行中（第一根文件多）abort → 拒绝且不返回部分结果。

### B78 `commands/` 的导出面

- 来源：`commands/index.ts`、`commands/roots.ts`
- 输入：无。
- 输出：`commands/index.ts` 导出 `NodeCustomCommandAdapterOptions`、`NodeCustomCommandAdapter`、`createNodeCustomCommandAdapter` 三个声明（`cancelled`、`enumerateDirectory`、`enumerateRoot`、`readMetadata`、`normalizeName`、`frontmatterLines` 等内部函数不导出）；`commands/roots.ts` 导出 `CustomCommandRootResolutionOptions`、`resolveDefaultCustomCommandRoots` 两个声明（`findWorktreeRoot`、`pathExists`、`commandRootsForBase`、`root`、`resolveConfiguredRoot`、常量不导出）。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：两个模块的 `Object.keys` 分别等于 `interface.md` 里的 3 个与 2 个名字；`mod.normalizeName === undefined`、`mod.findWorktreeRoot === undefined`。

### B79 进程探测的失败预算与单次截止

- 来源：`device/process-probe.ts`（`createProcessProbe` 的 `sample`）
- 输入：`createProcessProbe(options)` 的调用序列（`platform`、`execFile`、`listProcDirectory`、`readProcFile`、`onSampleFailed`）。
- 输出：`failures` 是**实例级**连续失败计数；`failures >= 3` 时后续 `sampleProcessTrees`/`sampleProcessGroup` 直接返回 `undefined`（**不执行操作、不发起新命令**）；每次采样各自设定绝对截止 `Date.now() + PROCESS_PROBE_SAMPLE_TIMEOUT_MS`（1000 ms）并起一个 `setTimeout`（`unref` 过），超时以 `ProcessProbeFailure("采样超过 1000 毫秒")` 拒绝；操作与截止 `Promise.race`；成功 → `failures = 0`；失败或超时 → `failures++`、调用一次 `options.onSampleFailed(error.message)`，**`onSampleFailed` 自身抛错被吞掉**，最终返回 `undefined`；`finally` 里清掉定时器。
- 错误语义：所有失败都降级成 `undefined`，不向调用方抛错；`reset()` 把 `failures` 清零。
- 时序与并发：`onSampleFailed` 与操作同栈同步调用；同一实例可并发采样，各自计时（注释写明这是保留的原有并发语义）。
- 幂等：采样失败不会改变平台分派与参数。
- 资源释放：`clearTimeout` 在 `finally`；操作侧的句柄由各平台实现负责。
- 平台差异：`PROCESS_PROBE_SAMPLE_TIMEOUT_MS` 跨平台一致（1000 ms）。
- 状态所有者：实例（`failures`）。
- 日志级别：无（失败通过 `onSampleFailed` 回调外传）。
- 可测断言：注入一个总是抛错的 `execFile`（win32 平台）→ 三次调用都得到 `undefined`、`onSampleFailed` 收到 3 次；第四次时注入的 `execFile` **不再被调用**（调用计数停在 3）；`reset()` 后再调用一次 → 恢复调用且成功时 `failures` 归零；注入一个永不返回的 `execFile` → 调用在约 1000 ms 内以 `undefined` 结束（超时路径），`onSampleFailed` 收到含 `1000` 的消息；`onSampleFailed` 抛错时调用仍然返回 `undefined`。

### B80 `sampleProcessTrees` 的入口处理与平台分派

- 来源：`device/process-probe.ts`（`sampleProcessTrees`、`treeScope`）
- 输入：`readonly number[]` 根 PID。
- 输出：先去重（`new Set`，**保留首次出现顺序**）并过滤 `isSamplablePid`（正整数整数）；过滤后为空 → 直接返回**空 `Map`**（不进入 `sample`，不影响失败计数）；否则按平台分派：`linux` → `sampleLinuxProcessTrees(readers(isExpired), requested)`；`win32` → `readWindowsProcessMemory(executor, requested)` 后 `new Map(rows.map(row => [row.pid, [row]]))`（**每行只有自己一个样本，无父子关系**）；其它平台（含 `darwin`）→ `groupProcessTrees(await readDarwinProcessTable(executor), requested)`。`treeScope` 在实例上固定：`win32 → "direct_process"`，其余 `"process_tree"`。
- 错误语义：失败/超时按 B79 返回 `undefined`（`sample` 的返回类型是 `T | undefined`）。
- 时序与并发：分派后交给对应平台实现；`sampleProcessTrees` 可并发。
- 幂等：是（除失败计数副作用）。
- 资源释放：无。
- 平台差异：`treeScope` 与分派完全由 `platform` 决定；macOS（darwin）走 `ps` 路径，**未在 macOS 实机验证**（见 README 的说明），Windows 只报「直接进程」。
- 状态所有者：实例级 `failures`。
- 日志级别：无。
- 可测断言：`createProcessProbe({platform:"linux", listProcDirectory: async () => [], readProcFile: async () => ""})` 且传空数组 → 返回空 `Map` 且不抛错；`platform:"win32"` + 假 `execFile` 返回两行 tasklist CSV（含目标 pid 与其它 pid）→ 结果只有目标 pid、值长度为 1；`platform:"darwin"` + 假 `execFile` 返回 `ps -eo pid=,ppid=,rss=,cputime=` 文本 → 结果按父子关系分组；`treeScope` 在 win32 上为 `"direct_process"`、在 linux 上为 `"process_tree"`；重复 pid 与非法 pid（`0`、`-1`、`1.5`）不产生额外遍历。

### B81 `sampleProcessGroup` 的平台与 PID 约束

- 来源：`device/process-probe.ts`（`sampleProcessGroup`）
- 输入：进程组 id。
- 输出：平台是 `win32` 或 `processGroupId` 不是可采样 PID（非正整数整数）→ **直接返回 `undefined`**（不进入 `sample`、不计失败）；否则 `linux` → `sampleLinuxProcessGroup(readers, gid)`；其它平台 → `readDarwinProcessGroup(executor, gid)` 后 `.map(toSample)`。
- 错误语义：失败/超时为 `undefined`。
- 时序与并发：与 `sampleProcessTrees` 独立计时。
- 幂等：是。
- 资源释放：无。
- 平台差异：Windows 不支持进程组采样（返回 `undefined` 而不是空数组）。
- 状态所有者：实例级 `failures`。
- 日志级别：无。
- 可测断言：`platform:"win32"` 且传 1 → `undefined` 且注入的 `execFile` 调用计数为 0；`platform:"linux"` 且传 `0`/`1.5` → `undefined`；`platform:"linux"` 且 `/proc` 假数据里两条同组、一条不同组 → 只返回同组两条，且都含 `pid`/`rssKb`（有 `cpuTimeMs`）。

### B82 进程探测共享工具的纯函数与命令契约

- 来源：`device/process-probe-shared.ts`
- 输入：`ProcessRelation[]`/`ProcessRow[]`、根 PID、`execFile` 替身。
- 输出：
  - `PROCESS_PROBE_SAMPLE_TIMEOUT_MS` 逐字 **1000**；`ProcessProbeFailure extends Error`；`isSamplablePid` 只接受正整数整数。
  - `toSample(row)` 取 `{pid, rssKb}`，`cpuTimeMs !== undefined` 时才带上。
  - `collectProcessTreePids(relations, rootPids)`：先按**输入顺序**建 `parentPid → children[]` 索引（同 PID 的多行只影响该行自身，不抹掉此前建立的父子边），再对每个根做**去重 DFS**（`visited` 防环），返回 `Map<根, 成员数组>`；两个根共用的子进程会在各自的树里各出现一次；根不在 `relations` 里则不出现在结果中；空 `rootPids` 返回空 `Map`。
  - `groupProcessTrees(rows, rootPids)`：每个 pid 取**最后一行**作为样本（`latest` 覆盖），按树成员映射成 `toSample` 结果（树内成员一定有行）。
  - `runProbeCommand(execFile, file, args, extraOptions?)`：固定 `{encoding:"utf8", maxBuffer: 8 MiB, timeout: 1000, ...extraOptions}`；`status !== 0` 或 `error` 存在 → 抛 `ProcessProbeFailure("<file> 采样失败: <stderr.trim() 或 String(status)>")`；否则返回 `stdout`。
  - `defaultProbeExecFile`：包 `node:child_process.execFile` 回调成 Promise：无错误 → `{status: 0, stderr, stdout}`；有错误 → `{error, status: typeof error.code === "number" ? code : null, stderr, stdout}`（**不 reject**）。
- 错误语义：只有 `runProbeCommand` 抛 `ProcessProbeFailure`，其它函数不抛。
- 时序与并发：纯函数同步；`defaultProbeExecFile` 一次一个子进程。
- 幂等：纯函数幂等。
- 资源释放：`defaultProbeExecFile` 的子进程随回调结束回收；超时由 `execFile` 的 `timeout` 承担。
- 平台差异：`maxBuffer`/`timeout` 跨平台一致；`windowsHide` 由调用方通过 `extraOptions` 传入（Windows 专用，见 B84）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`collectProcessTreePids([{pid:1},{pid:2,parentPid:1},{pid:3,parentPid:1}], [1])` → `1 → [1,2,3]`；同一 `pid` 出现两行且第一行带 `parentPid` 时，子进程仍挂在父下；`rootPids` 含不存在的 pid → 不含它；`groupProcessTrees` 里同一 pid 两行 → 用**最后一行**的 `rssKb`；`runProbeCommand` 的 `status:1` + `stderr:"boom"` → 抛 `ProcessProbeFailure` 且消息含 `采样失败: boom`；`status:1` 且 `stderr:""` → 消息含 `1`；`defaultProbeExecFile` 对不存在的命令返回带 `error` 与 `status === null` 的结果而不是 reject。

### B83 Linux `/proc` 解析契约

- 来源：`device/process-probe-linux.ts`（`relation`、`scan`、`relations`、`samples`、`sampleLinuxProcessTrees`、`sampleLinuxProcessGroup`）
- 输入：`LinuxProcReaders`（`listProcDirectory`、`readProcFile`、可选 `isExpired`）与根 PID / 进程组 id。
- 输出：
  - 每批最多 **64** 个 pid 并发读取；单个 pid 的读取异常被吞成 `undefined`（不影响同批其它 pid）；每批 `await` 后调 `checkDeadline`，`isExpired()` 为真 → 抛 `ProcessProbeFailure("/proc 扫描超时")`。
  - `listProcDirectory` 抛错 → `ProcessProbeFailure("/proc 不可读: <String(error)>")`；目录名先按 `^\d+$` 过滤、`Number` 转换、`isSamplablePid` 过滤。
  - `stat` 解析：取最后一个 `)` 之后按空白切分；字段 1 是 `ppid`（整数且 ≥ 0）、字段 2 是 `pgrp`（整数）、字段 11/12 是 `utime`/`stime`（有限数）；任一不满足 → 该行 `undefined`；`cpuTimeMs = Math.round(((utime + stime) / 100) * 1000)`（**100 tick/秒**，有限小数也按同一浮点运算再取整）。
  - `status` 解析：`/^VmRSS:\s+(\d+)\s*kB$/mu`（单位前允许 0 个或多个空白）；不匹配或非有限 → 该 pid 没有样本。
  - `sampleLinuxProcessTrees`：先用整表建树，`selected` 是所有树的成员并集；**只对 selected 读 `status`**；每个根返回「树成员 ∩ 有样本的成员」，缺样本的成员被跳过（不会补零）；根不在表里则不出现在结果。
  - `sampleLinuxProcessGroup(gid)`：整表里 `processGroupId === gid` 的行读 `status`；返回样本数组（顺序按表中的出现顺序，批内并发返回顺序固定）。
- 错误语义：见上；不向调用方抛除 `ProcessProbeFailure` 以外的错误。
- 时序与并发：批内 `Promise.all` 并发、批间串行；每批后检查截止（不伪造取消已进入的读取）。
- 幂等：是（只读 `/proc` 快照，同一份假数据同一结果）。
- 资源释放：无（reader 由调用方提供）。
- 平台差异：只在 Linux 使用；`/proc/<pid>/stat` 与 `status` 的格式假设写在实现里，**macOS 未实机验证**。
- 状态所有者：无（读者函数由 `createProcessProbe` 注入）。
- 日志级别：无。
- 可测断言：假 `/proc` 数据（`1` 为根、`2` 子、`3` 同组不同父）→ `sampleLinuxProcessTrees(readers,[1])` 得到 `1 → [1,2]` 的样本（含 `rssKb` 与 `cpuTimeMs`）；`sampleLinuxProcessGroup(readers, 3)` 返回组内两条；某 pid 的 `status` 缺 `VmRSS` 行 → 该 pid 从树的样本里被跳过但仍在成员集合里（不影响其它成员）；`isExpired: () => true` → 抛 `ProcessProbeFailure`；`listProcDirectory` 抛错 → 抛 `ProcessProbeFailure` 且消息含 `/proc 不可读`。

### B84 Windows `tasklist` CSV 解析契约

- 来源：`device/process-probe-windows.ts`（`readWindowsProcessMemory`、`columns`）
- 输入：`execFile` 替身与 pid 集合。
- 输出：固定跑 `tasklist /FO CSV /NH`（`extraOptions` 带 `windowsHide: true`）；按 `\r?\n` 切行、每行 `trim` 后做 CSV 解析：逗号在引号外才分列，引号内 `""` 表示一个字面 `"`；**引号未闭合的行整行丢弃**；列数 ≤ 4 丢弃；第 1 列 `Number` 后必须有限且在该 pid 集合里，否则丢弃；第 4 列去掉所有非数字字符后必须非空，`Number` 有限才产出；结果 `{pid, rssKb}`（**无 `cpuTimeMs`**），顺序按输出行序。
- 错误语义：命令失败按 B82 抛 `ProcessProbeFailure`（消息含 `tasklist 采样失败`）；解析不出任何行时返回空数组（不抛错）。
- 时序与并发：单次命令、顺序解析。
- 幂等：是。
- 资源释放：子进程由 `execFile` 回收。
- 平台差异：`windowsHide: true` 避免闪窗；`tasklist` 的本地化列名不影响（只按列位取值），内存列的 `1,234 K` 形式由「去非数字」处理。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：输入 `"node.exe","1234","Console","12,345 K"` 与 `"other.exe","9999","Console","1 K"` 且 pid 集合只有 `1234` → 返回 `[{pid:1234, rssKb:12345}]`；引号未闭合的行被丢弃；第 4 列为 `"N/A"` → 丢弃；pid 不在集合里 → 丢弃。

### B85 Darwin `ps` 解析契约

- 来源：`device/process-probe-darwin.ts`（`readDarwinProcessTable`、`readDarwinProcessGroup`、`parse`、`elapsed`）
- 输入：`execFile` 替身与进程组 id。
- 输出：整表固定跑 `ps -eo pid=,ppid=,rss=,cputime=`（**4 列**）；进程组固定跑 `ps -o pid=,rss=,cputime= -g <gid>`（**3 列**）。每行 `trim` 后按空白切分，**列数不等于期望列数就丢弃**；`pid` 必须是可采样 PID；`rssKb` 有限且 ≥ 0；带父列时 `parentPid` 必须是整数且 ≥ 0；`cputime` 由 `elapsed` 解析：按 `-` 切成 1–2 段（更多段丢弃），第 1 段是「天」（非负有限数），最后一段按 `:` 切 1–3 段（每段非负有限数），按 `[1,60,3600]` 权重从秒位起加权，天 × 86400，最后 `Math.round(秒 × 1000)` 得毫秒；任一不合法则**该行不带 `cpuTimeMs`**（但仍保留该行）。
- 错误语义：命令失败按 B82 抛 `ProcessProbeFailure`；解析不出行时返回空数组。
- 时序与并发：单次命令、顺序解析。
- 幂等：是。
- 资源释放：子进程由 `execFile` 回收。
- 平台差异：**本机无法在 macOS 实机验证**，仅按 `ps` 的公开输出格式与现有测试锁定；列宽/空白由 `split(/\s+/)` 处理。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`"1 0 100 01:02"` → 一行 `{pid:1,parentPid:0,rssKb:100,cpuTimeMs:62000}`；`"1 0 100 1-00:00:01"` → `cpuTimeMs === 86401000`；`"1 0 100 bogus"` → 行仍存在但 `cpuTimeMs === undefined`；列数多/少一列 → 整行丢弃；`readDarwinProcessGroup` 用 3 列文本 → 行的 `parentPid === undefined`。

### B86 `device/` 的导出面

- 来源：`device/` 六个文件
- 输入：无。
- 输出：按 `interface.md` 逐个保持：`cli-device-mid.ts` 只导出 `ensureCliDeviceMid`（`EnsureCliDeviceMidOptions` 不导出）；`process-probe-darwin.ts` 导出 `readDarwinProcessTable`、`readDarwinProcessGroup`；`process-probe-linux.ts` 导出 `LinuxProcReaders`、`sampleLinuxProcessTrees`、`sampleLinuxProcessGroup`；`process-probe-shared.ts` 导出 13 个声明（`ProcessProbeSample`、`ProcessProbeCommandResult`、`ProcessProbeExecFile`、`ProcessRelation`、`ProcessRow`、`PROCESS_PROBE_SAMPLE_TIMEOUT_MS`、`ProcessProbeFailure`、`isSamplablePid`、`toSample`、`collectProcessTreePids`、`groupProcessTrees`、`runProbeCommand`、`defaultProbeExecFile`）；`process-probe-windows.ts` 导出 `readWindowsProcessMemory`；`process-probe.ts` 导出 `ProcessTreeScope`、`ProcessProbe`、`createProcessProbe` 并对 shared 做 4 个名字的 re-export（`CreateProcessProbeOptions` 不导出）。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：六个模块的 `Object.keys` 分别等于 `interface.md` 的导出集合（`process-probe.ts` 含 4 个 re-export 名字）；`mod.CreateProcessProbeOptions === undefined`、`mod.defaultProbeExecFile`（在 shared 里）已定义。

### B87 CLI 设备标识（deviceMid）的生成、单飞与落盘

- 来源：`device/cli-device-mid.ts`（`ensureCliDeviceMid`、`IdentityRequest`）
- 输入：`{baseDir?, createId?, env?}`。
- 输出：数据目录按 `baseDir ?? env.KNORVIA_DATA_BASE_DIR?.trim() ?? homedir()` 取；**空串回退 `homedir()`**；`"~"` → `homedir()`；`"~/x"` → `join(homedir(), "x")`；其它 → `resolve`；状态文件是 `<目录>/.knorvia-studio/v2/telemetry-state.json`，锁是**同目录**的 `telemetry-state.lock`。**模块级单飞**：同一状态文件路径只初始化一次，后续调用返回同一个 Promise；已存在的 `deviceMid`（非空字符串）直接复用；初始化整体失败（`initialize` 抛错）时返回 `createId()` 生成值（用 `owner.generated()`，**同一请求内只生成一次**）。
- 锁与落盘：`open(lock, "wx")` 排他创建；写入 `{createdAt: Date.now(), pid: process.pid}`；拿到锁后**再读一次**状态文件，已有 `deviceMid` 就用它（不覆盖）；否则生成并把 `deviceMid` 写进状态对象，用「同目录 `.name.pid.ts.random.tmp` + `rename`」原子发布（`JSON.stringify(state, null, 2)`，无结尾换行），失败时尽力 `unlink` 临时文件并抛出；`finally` 里先 `close` 再尽力 `unlink` 锁（`close` 失败则不继续 `unlink`，外层用同一请求的 fallback）。锁冲突（`EEXIST`）时最多重试 **200** 次、每次等 **10 ms**；超过就抛逐字 `CLI telemetry state lock timeout`。
- 回收：锁的 `mtime` 距今 **< 5 分钟**时先解析锁内容——`pid`/`createdAt` 不是数字则**不回收**（返回 `false`）；`pid` 是正整数时用 `process.kill(pid, 0)` 探活，活着（或 `EPERM`）则不回收；否则删锁并返回 `true` 继续重试。锁的 `stat` 失败、解析失败等都按「不回收」处理。
- 错误语义：读状态文件失败/内容不是对象 → 当 `{}`；初始化最终失败 → 回退生成值（**不 reject**）；仅「锁超时」这一条会抛错。
- 时序与并发：进程内单飞；跨进程靠锁；等待是 10 ms 轮询（既有语义，不用 sleep 之外的手段）。
- 幂等：同一路径重复调用返回同一值；已有 `deviceMid` 时不再改写文件。
- 资源释放：文件句柄 `close` 在 `finally`；锁在 `finally` 里删除；临时文件失败时尽力删除。
- 平台差异：`process.kill(pid, 0)` 在 Windows 上对不存在进程抛 `ESRCH`（按不可变行为处理）；`open(..., "wx")` 与 `rename` 跨平台一致。
- 状态所有者：模块级 `Map<statePath, Promise<string>>`（单飞缓存）+ 状态文件里的 `deviceMid`。
- 日志级别：无。
- 可测断言：`baseDir` 指向临时目录、`createId: () => "id-1"` → 返回 `"id-1"`，`<tmp>/.knorvia-studio/v2/telemetry-state.json` 内容为 `{"deviceMid":"id-1"}`（2 空格缩进、无结尾换行），同目录不再有锁与 `.tmp` 残留；再次调用（新 `createId: () => "id-2"`）返回 `"id-1"`（读文件）；并发两次 `ensureCliDeviceMid` 返回同一个 Promise/同一值；预置状态文件 `{"deviceMid":"keep"}` → 返回 `"keep"` 且文件不被改写；预置一个 `mtime` 为当前、内容为有效 `{pid:<不存在的 pid>, createdAt:...}` 的锁文件 → 调用仍能成功（回收死锁）；锁内容不是有效 JSON → 调用在 200 次重试后抛 `CLI telemetry state lock timeout`。

### B88 `resizeToFit` 的尺寸与直通语义

- 来源：`image/index.ts`（`createJimpImageProcessorAdapter().resizeToFit`）
- 输入：`{data, mediaType, maxDimension}` 与 `{signal?}`。
- 输出：先 `throwIfAborted`；`maxDimension` 不是有限数或 ≤ 0 → 抛**普通 `Error`**，消息逐字 `Image resize maxDimension must be a positive finite number`；`data` 立刻 `Buffer.from(request.data)` 复制一份（返回值不复用调用方 buffer）；`mediaType === "image/webp"` → **不解码不缩放**，直接返回 `{data: 复制后的 buffer, mediaType: request.mediaType, resized: false}`（没有 `width`/`height`/`originalWidth`/`originalHeight`）；否则解码并取原始尺寸，宽高都 ≤ `maxDimension` → 返回原 buffer 与 `{originalWidth, originalHeight, width, height, resized: false}`；需要缩放时用 `scaleToFit({w: limit, h: limit, mode: ResizeStrategy.BICUBIC})`，输出 MIME 由 `jimpOutputMediaType(request.mediaType, decoded.mime)` 决定，返回 `{data: <编码后>, mediaType: <该 MIME>, originalWidth, originalHeight, width, height, resized: true}`。
- 错误语义：解码失败由 `Jimp.read` 抛（不包装）；取消抛 `Image resize was cancelled`（见 B92）。
- 时序与并发：异步；每次调用独立解码，不共享可变状态。
- 幂等：除编码字节可能因编解码器细节不同外，尺寸与 `resized` 判定稳定。
- 资源释放：`Jimp.read` 的解码结果只在本次调用内使用（无显式释放接口）。
- 平台差异：无（纯 JS 编解码）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`maxDimension: 0`/`NaN` → 抛消息逐字为上述文案的 `Error`；`mediaType:"image/webp"` + 任意小字节 → 返回的 `data` 与输入字节相同但**不是同一个 Buffer 对象**、`resized === false`；1×1 PNG + `maxDimension: 8` → `resized === false` 且 `width === height === 1`；4×2 PNG + `maxDimension: 2` → `resized === true`、`width === 2`、`height === 1`、`originalWidth === 4`、`originalHeight === 2`。

### B89 `prepareForModel` 的入口校验与空数据

- 来源：`image/jimp-compression.ts`（`prepareJimpImageForModel`）
- 输入：`ImagePrepareForModelRequest` 与 `{signal?}`。
- 输出：顺序固定：`throwIfAborted` → `validatePrepareRequest`（`maxDimension`/`maxBase64Bytes`/`maxRawBytes` 都必须是正有限数，否则 `createImageProcessorError({code:"invalid_request", ...})`，消息逐字分别为 `Image resize maxDimension must be a positive finite number`、`Image maxBase64Bytes must be a positive finite number`、`Image maxRawBytes must be a positive finite number`）→ `Buffer.from(request.data)` → **0 字节** → 抛 `createImageProcessorError({code:"empty", message:"Image file is empty (0 bytes)"})`。
- 错误语义：`createImageProcessorError` 的错误对象带 `code`（`invalid_request`/`empty`/`processing_failed`/`too_large`/`unsupported`）与 `message`；解码失败包成 `processing_failed`（`message` 逐字 `Unable to decode image data`，`cause` 是原错误）。
- 时序与并发：异步；取消检查在解码前后各一次。
- 幂等：是（同一输入同一结果）。
- 资源释放：无（输入被复制）。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`maxRawBytes: 0` → 抛 `code === "invalid_request"`、消息逐字 `Image maxRawBytes must be a positive finite number`；`data` 为空 Buffer → 抛 `code === "empty"`、消息逐字 `Image file is empty (0 bytes)`；`data` 是随机非图片字节且三上限合法 → 抛 `code === "processing_failed"`、消息逐字 `Unable to decode image data`；已 abort 的 signal → 抛 `Image resize was cancelled` 且**先于**校验发生（传 `maxRawBytes:0` 也抛取消）。

### B90 未超预算的原图直通与 WebP 直通

- 来源：`image/jimp-compression.ts`、`image/webp-passthrough.ts`
- 输入：`request`（媒体类型、三上限）与输入字节。
- 输出：
  - 媒体类型判定：`detectImageMediaType(input) ?? normalizeMediaType(request.mediaType)`；检测到 `image/webp` → 走 `prepareWebpPassthrough`，**不经过 jimp 解码**。
  - WebP 直通：做 `createImageBudget(request)` 后 `fitsImageBudget` 判定，超预算 → 抛 `createImageProcessorError({code:"unsupported", message:"WebP image exceeds the model image budget and the current image adapter cannot transcode WebP"})`；未超 → 返回**输入副本**（`prepareJimpImageForModel` 先 `Buffer.from(request.data)`，因此内容相同但不是同一引用；直接调用 `prepareWebpPassthrough` 时才是原引用），`{mediaType:"image/webp", originalSizeBytes, resized:false, compressed:false, strategy:"original", transformedSizeBytes}`（没有 `width`/`height`/`originalWidth`/`originalHeight`）。
  - 非 WebP 且尺寸在 `maxDimension` 内、且**原始字节**满足预算 → 直接返回输入（`mediaType` 是规范化后的来源类型、`resized:false`、`compressed:false`、`strategy:"original"`，并带 `originalWidth/originalHeight/width/height` 与 `originalSizeBytes`/`transformedSizeBytes`）。
- 错误语义：见 B89；预算不够时 WebP 是 `unsupported`，其它格式进入 B93 的策略选择。
- 时序与并发：异步。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：1×1 PNG + 宽松预算 + `maxDimension:8` → `strategy === "original"`、`compressed === false`、`data` 字节等于输入；同一输入 + `maxRawBytes` 小于输入长度 → 不返回 `original`（要么换策略要么 `too_large`）；WebP 魔数的小字节（`RIFF....WEBP`）+ 宽松预算 → `strategy === "original"`、`resized === false`、`data` 与输入同一引用；同输入 + `maxRawBytes: 1` → 抛 `code === "unsupported"`。

### B91 图片预算的计算与判定

- 来源：`image/image-budget.ts`
- 输入：`ImagePrepareForModelRequest` / `(buffer, budget)`。
- 输出：`createImageBudget` 返回 `{maxBase64Bytes: Math.floor(request.maxBase64Bytes), maxRawBytes: Math.floor(request.maxRawBytes), maxTokens: request.maxTokens, tokenToBase64CharRatio: request.tokenToBase64CharRatio ?? 0.125}`（**缺省比例逐字 0.125**）。`fitsImageBudget` 依次判定：`buffer.byteLength > maxRawBytes` → `false`；`base64EncodedLength = Math.ceil(byteLength / 3) * 4` 大于 `maxBase64Bytes` → `false`；`maxTokens === undefined` → `true`；否则 `Math.ceil(base64Bytes * tokenToBase64CharRatio) <= maxTokens`。
- 错误语义：不抛错（`validatePrepareRequest` 才抛）。
- 时序与并发：纯同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`{maxBase64Bytes: 10.9, maxRawBytes: 3.7, tokenToBase64CharRatio: undefined}` → `{maxBase64Bytes:10, maxRawBytes:3, tokenToBase64CharRatio:0.125}`；3 字节 buffer 且 `maxRawBytes:3`、`maxBase64Bytes:4` → `true`，`maxBase64Bytes:3` → `false`；4 字节 buffer → base64 长度 8（`ceil(4/3)*4`）；`maxTokens:1` 且 base64 长度 8、比例 0.125 → `ceil(1) <= 1` 为 `true`，`maxTokens:0` → `false`。

### B92 媒体类型与取消语义的工具函数

- 来源：`image/jimp-media.ts`
- 输入：媒体类型字符串 / `AbortSignal | undefined`。
- 输出：`normalizeMediaType` 先把输入转小写：`image/jpg` → 逐字 `image/jpeg`；`image/jpeg`、`image/png`、`image/gif`、`image/webp` 原样返回（小写形态）；其它（含 `image/bmp`、空串）→ `JimpMime.png`（逐字 `image/png`）。`jimpOutputMediaType(requested, detected)`：`requested` 属于 `{image/bmp, image/gif, image/jpeg, image/png, image/tiff}` 就用它；否则 `detected` 属于该集合就用 `detected`；都不行 → `image/png`。`throwIfAborted(signal)`：`signal?.aborted` 为真时抛逐字 `Image resize was cancelled`，否则原样返回。该模块还 re-export `detectImageMediaType`（来自 `@knorvia/contracts`）。
- 错误语义：只有 `throwIfAborted` 抛错。
- 时序与并发：纯同步。
- 幂等：`normalizeMediaType` 幂等。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`normalizeMediaType("IMAGE/JPG") === "image/jpeg"`；`normalizeMediaType("image/bmp") === "image/png"`；`jimpOutputMediaType("image/tiff","image/png") === "image/tiff"`；`jimpOutputMediaType("image/avif","image/gif") === "image/gif"`；`jimpOutputMediaType("image/avif","image/avif") === "image/png"`；已 abort 的 signal → 抛消息逐字 `Image resize was cancelled`；`mod.detectImageMediaType` 是函数。

### B93 压缩策略的选择顺序与结果语义

- 来源：`image/jimp-compression.ts`（`selectEncoding`、`trySourceFormat`、`tryJpegLevels`、`encodeChoice`、`copyWithinEdge`）
- 输入：解码后的图片、来源媒体类型、`maxDimension`、原始宽高、预算、signal。
- 输出：选择顺序固定（每个候选都先判预算）：
  1. 原尺寸在 `maxDimension` 内时先试**来源格式**：PNG → `deflateLevel: 9`、`deflateStrategy: 3`，策略名逐字 `png-optimized`；JPEG → 依次试质量 `[80, 60, 40, 20]`，策略名逐字 `jpeg-quality`；GIF → 保持格式，策略名逐字 `preserve-format`；其它来源格式**不试**。
  2. 非 PNG 且按 `maxDimension` 缩放后尺寸变了 → 用输出 MIME 编码一次，策略名逐字 `resized`。
  3. 非 PNG 时在缩放后的图上再试一次来源格式（策略名同上）。
  4. 缩放后的图依次试 JPEG 质量 `[80,60,40,20]`（`jpeg-quality`）。
  5. 依次用收缩因子 `[0.75, 0.5, 0.25]`（边缘 `Math.max(1, Math.round(当前最长边 × 因子))`）再试来源格式（非 PNG）与 JPEG 质量。
  6. 依次用边缘 `[1000, 800, 600, 400, 300, 200]` 与 `Math.min(edge, maxDimension)` 编码 JPEG 质量 **20**，策略名逐字 `jpeg-fallback`。
     全部失败 → `undefined`，调用方抛 `too_large`（消息含输入字节数与 `within the requested model image budget`）。
- 输出字段：非直通路径的结果里 `mediaType` 是 `normalizeMediaType(choice.mediaType)`、`resized` 是「最终宽高与原始宽高不同」、`compressed` 是「`data.byteLength < input.byteLength` **或** 编码后 MIME 与来源 MIME 不同」、`transformedSizeBytes` 是编码后字节数、`originalSizeBytes` 是输入字节数、`strategy` 是上述策略名之一。
- 错误语义：`undefined` → `too_large`；取消在两处编码前后检查，抛 `Image resize was cancelled`。
- 时序与并发：串行依次编码（每次都可能较慢）；不做并行编码。
- 幂等：是（同一输入同一策略选择，除非编码器本身不确定）。
- 资源释放：`clone()` 出的临时图只在本函数内使用。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：小尺寸 PNG 且宽松预算 → `strategy === "original"`；把 `maxTokens` 压到 1 且图片噪声较大 → 结果 `strategy` 属于 `{png-optimized, jpeg-quality, resized, jpeg-fallback}` 且 `fitsImageBudget(result.data, createImageBudget(request)) === true`（预算必须真的被满足）；把 `maxRawBytes` 压到极低（如 50）→ 抛 `code === "too_large"` 且消息含输入字节数；`resized === true` 时 `width <= maxDimension && height <= maxDimension`。

### B94 `image/` 的导出面

- 来源：`image/` 五个文件
- 输入：无。
- 输出：按 `interface.md`：`image-budget.ts` 导出 `ImageBudget`、`createImageBudget`、`validatePrepareRequest`、`fitsImageBudget`（4 个）；`image/index.ts` 导出 `createJimpImageProcessorAdapter`（1 个）；`image/jimp-compression.ts` 导出 `prepareJimpImageForModel`（1 个）；`image/jimp-media.ts` 导出 `normalizeMediaType`、`jimpOutputMediaType`、`throwIfAborted` 并对 `@knorvia/contracts` 做 `detectImageMediaType` re-export；`image/webp-passthrough.ts` 导出 `prepareWebpPassthrough`（1 个）。内部函数与内部类型（`copyWithinEdge`、`encodeChoice`、`selectEncoding`、`tryJpegLevels`、`EncodedChoice` 等）不得导出。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：五个模块的 `Object.keys` 分别等于 `interface.md` 的导出集合；`mod.selectEncoding === undefined`、`mod.EncodedChoice === undefined`、`mod.QUALITY_LEVELS === undefined`。

## D2. 文件系统与日志（`fs/`、`logging/`）

状态所有者：`NodeFileSystemAdapter` 的**唯一错误转换入口**是门面（内部策略不重复包装错误），`textSearchEngine` 选项归适配器实例；`TextLineWindow` 是流式行扫描的唯一状态所有者（每行只留选中行）；`NodeFileLogger` 的设置对象不可变、`createNodeLoggerFactory` 的 `minimum` 与 `cleanupAdmitted` 归工厂实例；日志文件本身是 `appendFileSync` 的追加目标（无内存队列）。

### B95 文件系统门面的错误转换与基础操作

- 来源：`fs/index.ts`（`NodeFileSystemAdapter.createDirectory`/`stat`/`listDirectory`/`removeFile`、`createNodeFileSystemAdapter`）
- 输入：`FileSystemPort` 的请求对象（`path` 必须是绝对路径）。
- 输出：所有公开方法先 `absolute(request.path)`（非绝对 → `createFileSystemError({code:"invalid_path", message:"FileSystemPort requires an absolute path: <path>"})`；绝对路径会被 `normalize`）。`createDirectory` 调故障注入钩子后 `mkdir(path,{recursive:true})`，返回 `{path}`；`stat` 返回 `{path, kind, sizeBytes, mtimeMs, revision}`（`kind` 由 `nodeKind` 判定，只有 `"file"` 才带 `revision`，`revision.id` 逐字为 `mtime:<trunc(mtimeMs)>:size:<size>`）；`listDirectory` 见 B100；`removeFile` 见下；所有 `node:fs` 失败经 `failure` 归一（见 B108）。
- 错误语义：`removeFile` 在 `unlink` 失败且 `request.missingOk === true` 且归一后的 code 是 `not_found` 时返回 `{path, removed:false}`（不抛错），其它错误照抛；`aborted(signal)` 在操作前检查。
- 时序与并发：异步；每个方法独立，不共享可变状态。
- 幂等：`createDirectory` 幂等；`removeFile` + `missingOk` 幂等。
- 资源释放：`rm`/`mkdir` 由 Node 管理；无句柄泄漏。
- 平台差异：`normalize` 统一分隔符；`EPERM` 与 `EACCES` 都映射 `permission_denied`。
- 状态所有者：适配器实例（仅 `textSearchEngine` 选项）。
- 日志级别：无（错误以 `FileSystemPortError` 形式抛出）。
- 可测断言：`createNodeFileSystemAdapter()` 返回新实例；相对路径 `"a.txt"` → 抛 `code === "invalid_path"`；`createDirectory` 后目录存在且返回 `{path: normalize(绝对路径)}`；`stat` 文件返回 `kind === "file"` 且 `revision.id` 匹配 `/^mtime:\d+:size:\d+$/`；`removeFile` 不存在的路径 + `missingOk:true` → `{removed:false}`；不带 `missingOk` → 抛 `not_found`；`removeFile` 已存在的文件 → `{removed:true}`。

### B96 `readTextFile` 的编码、行尾与截断

- 来源：`fs/index.ts`（`readTextFile`）
- 输入：`{path, encoding?, maxBytes?}`。
- 输出：`stat` 后 `regular(info, path, "text")`（目录 → `is_directory`，非文件 → `not_file`）；`truncated = maxBytes !== undefined && info.size > maxBytes`，截断时只读前 `maxBytes` 字节（`prefix`），否则整读；`decodeTextBuffer({buffer, encoding, path})` 得到 `{content, encoding}`；`shouldNormalizeLineEndings(encoding)` 为真时返回 `normalizeLineEndings(content)`（CRLF → LF）并给出 `lineEndings = detectLineEndings(原始内容)`，`base64`/`base64url`/`hex` 等**传输编码**不规范化且 `lineEndings === undefined`；返回 `{path, content, encoding, lineEndings?, bytesRead: <实际字节数>, sizeBytes, truncated, revision: revision(info, bytes)}`（**带 `hash: sha256:<hex>`**）。
- 错误语义：见 B108 的映射；编码检测失败 → `unsupported`（`Unsupported or binary text encoding: <path>`）。
- 时序与并发：异步；`stat` → 读 → 解码串行。
- 幂等：是（只读）。
- 资源释放：`prefix` 的句柄在 `finally` 关闭。
- 平台差异：换行检测跨平台统一按 `\n` 与前置 `\r` 判断。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：CRLF 文本文件（`"a\r\nb\r\n"`）→ `content === "a\nb\n"`、`lineEndings === "CRLF"`、`encoding === "utf8"`；纯 LF → `lineEndings === "LF"`；`maxBytes` 小于文件 → `truncated === true`、`bytesRead === maxBytes`、`sizeBytes` 仍是原大小；含 NUL 字节 → 抛 `code === "unsupported"`；`revision.hash` 以 `sha256:` 开头；目录路径 → `code === "is_directory"`。

### B97 `readBinaryFile` 的大小上限与短读推进

- 来源：`fs/index.ts`（`readBinaryFile`）、`fs/node-file-io.ts`（`bounded`）
- 输入：`{path, maxBytes?}`。
- 输出：`regular(info, path, "binary")`；`maxBytes` 给定且 `info.size > maxBytes` → 立刻抛 `too_large`，消息逐字 `File content (<byteCount(size)>) exceeds maximum allowed size (<byteCount(maxBytes)>). Use a smaller file.`；否则 `maxBytes === undefined ? readFile : bounded(path, maxBytes + 1, info.size)`（`bounded` 读满 `capacity` 或到 EOF，首块 `min(capacity, max(1, initialSize+1))`、后续块 `min(64 KiB, 剩余)`）；读回字节数仍 `> maxBytes`（`stat` 之后文件被追加）→ 抛第二条 `too_large`，消息逐字 `File content exceeds maximum allowed size (<byteCount(maxBytes)>). Use a smaller file.`；成功返回 `{path, content: <Buffer>, bytesRead, sizeBytes, revision(info, bytes)}`。
- 错误语义：两条 `too_large` 的文案不同（第二条没有实际大小），不得合并。
- 时序与并发：异步；`stat` 与读取之间不加锁，允许竞态但必须由「读 `max+1` 字节」兜住。
- 幂等：是（只读）。
- 资源释放：`bounded` 的句柄在 `finally` 关闭。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：1024 字节文件 + `maxBytes: 1024` → 成功且 `bytesRead === 1024`；`maxBytes: 1023` → 抛 `too_large` 且消息含 `1024B` 与 `1023B`；无 `maxBytes` → 全文返回且 `revision.hash` 存在；`byteCount` 的形态见 B108。

### B98 `writeTextFile` 的 revision、父目录与原子写

- 来源：`fs/index.ts`（`writeTextFile`）
- 输入：`{path, content, encoding?, lineEndings?, expectedRevision?, createParents?, atomic?}`。
- 输出：`encodeTextContent({content: applyRequestedLineEndings(content, lineEndings), encoding: encoding ?? "utf8", path})` **在 `try` 之外**完成（编码不支持的错误原样抛出，不经 `failure` 包装）；进入 `try` 后：`expectedRevision` 给定且 `revision(await stat(path)).id !== expectedRevision.id` → 抛 `stale_write`，消息逐字 `File changed since it was read: <path>`；`createParents` 为真 → 故障注入钩子 + `mkdir(dirname(path),{recursive:true})`；`atomic ?? true` 为真走 `publish`（见 B107），否则故障注入钩子 + `writeFile(path, bytes)`；最后 `stat` 一次并返回 `{path, bytesWritten, revision: revision(info, bytes)}`。
- 错误语义：编码错误（如中文编码往返不一致 → `unsupported`）不包装；其它错误按 B108 映射。
- 时序与并发：异步；`expectedRevision` 只做一次检查（无锁），并发写后写者胜。
- 幂等：内容与行尾相同则结果相同；`expectedRevision` 使第二次写可能因 `mtime` 变化而失败（这是刻意的）。
- 资源释放：`publish` 内部句柄自管；无泄漏。
- 平台差异：`publish` 的 `O_NOFOLLOW` 在 Windows 上语义有限（见 B107）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：写入 `"a\nb"` + `lineEndings:"CRLF"` → 文件字节是 `a\r\nb`；写入后 `bytesWritten` 等于编码后字节数、`revision.id` 匹配 `mtime:` 前缀；`createParents:true` 且父目录不存在 → 创建成功；`createParents` 缺省且父目录不存在 → 抛 `not_found`（`ENOENT` 映射）；先 `stat` 取 `revision` 写入，文件被外部修改后再用旧 `revision` 写 → 抛 `stale_write` 且消息逐字 `File changed since it was read: <path>`；`atomic:false` → 文件内容正确（走直接覆盖分支）。

### B99 `readTextFileRange` 的选行与流式扫描

- 来源：`fs/index.ts`（`readTextFileRange`）、`fs/text-range-reader.ts`（`readTextFileRangeFromNode`、`wholeFile`、`scanFile`、`sampleEncoding`）
- 输入：`{path, offsetLine?, limitLines?, maxBytes?, encoding?}` 与 `{signal?}`。
- 输出：门面先 `stat` + `regular(..., "text")`，再交给 `readTextFileRangeFromNode(request, info, signal)`：先查取消；`maxBytes` 给定且 `!(size <= maxBytes)` → 抛 `too_large`，消息逐字 `File content (<displaySize(size)>) exceeds maximum allowed size (<displaySize(maxBytes)>). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`；`offset = max(0, trunc(offsetLine ?? 0))`、`limit = limitLines === undefined ? undefined : max(0, trunc(limitLines))`；**`size <= 10 MiB` 走整读**（`readFile` + 解码 + 行尾规范化 + `split("\n")` 后切片），**超过 10 MiB 走流式扫描**（`createReadStream` + 流式解码器 + `TextLineWindow`，编码缺省时先读前 4096 字节检测）；返回 `{path, content: <选中行用 "\n" 连接>, encoding, lineEndings, bytesRead, lineCount: <选中行数>, totalLines: <按 "\n" 切分后的段数>, sizeBytes, truncated: false, startLine: offset + 1, revision: {id, mtimeMs, sizeBytes}}`（**range 的 revision 没有 `hash`**）。`totalLines` 的口径与整读一致：**以换行结尾的内容会多算一个末尾空段**（`"a\nb\nc\n"` → 4、`"a\nb\nc"` → 3；流式路径由 `finish(decoderTail, sawBytes)` 的收尾 `complete(false)` 补齐同一条语义）。
- 错误语义：取消时抛 `AbortError`（消息 `File system operation was cancelled: <path>`）；扫描中 `signal` 中止会 `destroy` 流并以同一 AbortError 结束。空文件 → `lines` 为空数组、`totalLines === 0`、`content === ""`。
- 时序与并发：异步；整读一次性，扫描逐块（`for await`）。
- 幂等：是（只读）。
- 资源释放：流读在 `finally` 里移除 abort 监听；句柄随流关闭。
- 平台差异：`\r\n` 在非传输编码下被规范化后再切行；`TextLineWindow` 保证行内容不含行尾 `\r`。
- 状态所有者：`TextLineWindow`（单次调用内）。
- 日志级别：无。
- 可测断言：`"a\nb\nc\n"` + `offsetLine:1, limitLines:1` → `content === "b"`、`startLine === 2`、`lineCount === 1`、`totalLines === 3`；`offsetLine` 超过总行数 → `content === ""`、`lineCount === 0`；`limitLines:0` → 空内容但 `totalLines` 仍是真实值；文件大于 `maxBytes` → 抛 `too_large` 且消息含 `offset and limit parameters`；`revision` 没有 `hash` 字段；`offsetLine:-5` → 等同于 0。

### B100 `listDirectory` 的排序与计时

- 来源：`fs/index.ts`（`listDirectory`）
- 输入：`{path}` 与 `{signal?}`。
- 输出：`startedAt` 在**进入 `try` 之前**取；`aborted` 检查后 `stat`，不是目录 → 抛 `not_file`，消息逐字 `Directory listing path must be a directory: <path>`；`readdir(..., {withFileTypes:true})` 后再次 `aborted`；条目映射为 `{kind: nodeKind(entry), name, path: join(path, name)}` 并按 `name.localeCompare` 升序；返回 `{path, durationMs: max(0, Date.now()-startedAt), entries, numEntries}`。
- 错误语义：`not_file`、`not_found`、`permission_denied` 等按 B108；取消经 `failure` 变 `cancelled`。
- 时序与并发：异步；`readdir` 一次拿全表（不分页）。
- 幂等：是（只读）。
- 资源释放：无。
- 平台差异：排序用 `localeCompare`（与操作系统无关，避免 `readdir` 顺序差异导致结果不稳定）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：目录里 `b.txt`、`a/`、`c` → `numEntries === 3`、`entries` 名字升序、`kind` 分别是 `file`/`directory`；`durationMs` 是非负整数；对文件调用 → 抛 `not_file` 且消息含 `must be a directory`；对不存在的路径 → `not_found`。

### B101 `searchFiles` 的 glob 遍历、排序与分页

- 来源：`fs/node-search.ts`（`searchFiles`）
- 输入：`{path, pattern, offset?, maxResults?}` 与 `signal?`。
- 输出：`pattern.trim()` 为空 → 抛 `invalid_pattern`，消息逐字 `Glob pattern must not be empty`；`stat` 不是目录 → 抛 `not_file`，消息逐字 `Glob search path must be a directory: <path>`；用 `glob(pattern)` 与 `walk` 收集 `{path, mtimeMs}` 候选；按 `recent` 排序（`mtimeMs` 降序，相同则路径升序）；`offset ?? 0`、`maxResults ?? 100`；`files` 取 `rows.slice(offset, offset + max)` 的路径；`truncated = rows.length > offset + max`；返回 `{path, pattern: <trim 后>, durationMs, files, numFiles: files.length, truncated}`。
- 错误语义：取消经 `failure` 变 `cancelled`；`ENOENT` → `not_found`。
- 时序与并发：异步；`walk` 是显式栈 DFS（顺序为 `readdir` 顺序）。
- 幂等：是（同一文件系统状态同一结果）。
- 资源释放：无。
- 平台差异：相对路径统一转 POSIX（`posixRelative`）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：目录里 `x.ts`、`y.md`、子目录 `sub/z.ts` → `pattern:"**/*.ts"` 得到两个 `.ts` 路径（不含 `.md`）；`pattern:""` → `invalid_pattern`；对文件路径调用 → `not_file`；`maxResults:1` 且候选 2 个 → `numFiles === 1`、`truncated === true`；`offset:1, maxResults:1` → 返回第二个候选。

### B102 `searchText` 的引擎选择与 ripgrep 降级

- 来源：`fs/node-search.ts`（`searchText`、`ripgrep`、`javascript`、`expression`、`grepRequest`）、`fs/ripgrep-worker.ts`（`RipgrepRuntimeFailure`）
- 输入：搜索请求与引擎选项 `"javascript"|"ripgrep"|undefined`、`signal?`。
- 输出：`engine === "javascript"` 直接走纯 JS；否则先走 ripgrep，只有抛 `RipgrepRuntimeFailure`（WASM 无法运行）时**才降级**到纯 JS，其它错误不降级而是经 `failure(error, request.path)` 抛出。ripgrep 路径：`stat` 既不是文件也不是目录 → `not_file`（消息 `Grep search path must be a file or directory: <path>`）；`searchPlan` 生成参数；`code === 2` → `ripgrepFailure(...)`（见 B112）；`code` 既不是 0 也不是 1 → `io_error`，消息逐字 `ripgrep exited with code <code>: <stderr 或 "unknown error">`；否则 `parseOutput(stdout, plan.root, request)`、`sortFiles`、`finish`。两条路径都先做取消检查与空 pattern 校验（`Grep pattern must not be empty`）。
- `javascript` 细节：`candidates` 得到候选文件并逐个 `readFile(utf8)`，**含 `\0` 的文件跳过**；`matchContent` 计数 0 的文件跳过；`mode = outputMode ?? "files_with_matches"`，`content` 模式保留 `onlyMatching`，其它模式强制 `onlyMatching:false`；`files_with_matches` 收集 `files`，`count` 收集 `{path, count}`，`content` 收集匹配条目；`numMatches` 是各文件匹配数之和；最后 `matched.sort(recent)` 再 `finish`。
- 错误语义：正则不合法 → `invalid_pattern`（消息 `Invalid grep regular expression: <pattern>`，带 `cause`）；取消 → `cancelled`。
- 时序与并发：异步；纯 JS 逐文件串行读，ripgrep 单 worker。
- 幂等：是。
- 资源释放：worker 在结果/超时/取消时 `terminate`（见 B106）。
- 平台差异：ripgrep 走捆绑 WASM（`nodeWasi:false` + `preopens`），不依赖系统 `rg`。
- 状态所有者：`textSearchEngine` 归适配器实例。
- 日志级别：无。
- 可测断言：`textSearchEngine:"javascript"` 时对含 `foo` 的两文件目录搜索 → `files` 两个、`numMatches === 2`；`outputMode:"count"` → `entries` 为 `{path, count}`；`outputMode:"content"` → `entries` 含 `lineNumber`、`text`、`matched:true`；`pattern:"("` → `invalid_pattern`；含 NUL 的文件不计入；把 worker 工厂替换成必然抛错的实现（`setRipgrepWorkerFactoryForTests`）→ 走纯 JS 且结果一致；`setRipgrepTimeoutMsForTests(1)` 且查询较慢 → 抛超时错误而**不**降级。

### B103 搜索路径、glob token 扫描与类型过滤

- 来源：`fs/file-search-paths.ts`（`VCS_NAMES`、`posixRelative`、`glob`、`TYPE_EXTENSIONS`、`fileType`、`matchesType`、`filter`、`recent`）
- 输入：glob 模式、路径、`type`。
- 输出：`VCS_NAMES` 逐字 `[".git",".svn",".hg",".bzr",".jj",".sl"]`；`posixRelative(root,file)` 把平台分隔符换成 `/`；`glob(pattern)`：先把 `\` 归一成 `/`、去掉开头 `./`，然后逐字符扫描成**锚定**正则——`*` → `[^/]*`，`**` → `.*`，`**/` → `(?:.*/)?`，`?` → `[^/]`，`{a,b}` → `(?:a|b)`（brace 内是字面 alternatives，`{` 没有配对 `}` 时按字面），其它字符按正则字面转义；匹配「POSIX 相对路径」或（模式不含 `/` 时）文件名。`TYPE_EXTENSIONS` 是固定扩展名表（如 `js → [.js,.jsx,.mjs,.cjs]`、`ts → [.ts,.tsx,.mts,.cts]`、`md/markdown → [.md,.markdown]`），`fileType` 小写化并去掉前导 `.`，`matchesType` 取 `extname(path).toLowerCase()` 与表或 `["." + type]` 比较；`filter(root, request)` = glob 与 type 同时满足；`recent(a,b)` 是 `mtimeMs` 降序、相同则路径 `localeCompare` 升序。
- 错误语义：不抛错（正则来自受控扫描，不含用户正则）。
- 时序与并发：纯同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：先把 `\` 归一为 `/`，因此 Windows 风格模式在 POSIX 上也按 `/` 处理。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`glob("**/*.ts")("src/a.ts","a.ts") === true`、`glob("**/*.ts")("a.md","a.md") === false`；`glob("*.md")("sub/a.md","a.md") === true`（模式不含 `/` 时退到文件名匹配）；`glob("{a,b}.ts")("b.ts") === true`；`glob("{a,b.ts")("a") === false`；`glob("?.ts")("a.ts") === true`、`glob("?.ts")("ab.ts") === false`；`glob("src/**")("src/a/b.ts") === true`；`matchesType("a.TS","ts") === true`；`matchesType("a.txt",".txt") === true`；`matchesType("a.ts","python") === false`；`recent` 对同 `mtimeMs` 返回路径升序。

### B104 `walk` 的递归规则与取消

- 来源：`fs/file-search-paths.ts`（`walk`、`candidates`）
- 输入：根路径、`signal`、访问回调。
- 输出：显式栈 DFS（目录帧保存 `{path, entries, cursor}`），**只递归普通目录，跳过名字在 `VCS_NAMES` 里的目录**；只对普通文件调用 `visit(child, await stat(child))`；每个条目与每次压栈前都查 `aborted(signal)`；`candidates(path, info, request, signal)`：`root = info.isDirectory() ? path : dirname(path)`；文件路径只把自己加入；既非文件也非目录 → 抛 `not_file`，消息逐字 `Grep search path must be a file or directory: <path>`；目录时 `walk` 收集 `{path, mtimeMs: Number(info.mtimeMs)}`，随后按路径 `localeCompare` 升序排序。
- 错误语义：取消抛 `AbortError`（`name === "AbortError"`）；`readdir`/`stat` 的原始错误直接冒泡（由调用方 `failure` 归一）。
- 时序与并发：异步；串行 DFS，不并发 `readdir`。
- 幂等：是。
- 资源释放：无。
- 平台差异：目录分隔符由 `join` 处理；VCS 目录名大小写敏感（`.GIT` 不会被跳过，这是既有语义）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：目录 `a/x.txt`、`.git/config`、`b/y.txt` → 访问回调收到 `x.txt` 与 `y.txt`（`.git` 内的文件不访问）；对文件调用 `candidates` → 只含该文件；`candidates` 结果的路径按字典序。

### B105 ripgrep 参数计划

- 来源：`fs/ripgrep-plan.ts`（`searchPlan`）
- 输入：`FileSystemSearchTextRequest` 与「是否为目录」。
- 输出：`root = directory ? request.path : dirname(request.path)`；参数以固定前缀开头，逐字为 `--no-config`、`--hidden`、`--color`、`never`、`--no-heading`、`--with-filename`、`--max-columns`、`500`；对每个 VCS 名追加 `--glob`、`!<name>`、`--glob`、`!**/<name>/**`；`multiline` → `-U`、`--multiline-dotall`；`ignoreCase` → `-i`；`outputMode === "content"` → `--json`（+ `--only-matching` 当 `onlyMatching`；+ `-C <context>` 或 `-B/-A`）；否则 `-c`；`glob` 按空白切分，含 `{` 与 `}` 的片段整体作为一个 glob，否则按 `,` 再切，逐段 `--glob <trim>`；`type` 先 `fileType` 规范化，匹配 `/^[a-z0-9_+-]+$/i` 时对每个扩展名追加 `--glob *<ext>` 与 `--glob **/*<ext>`；结尾固定 `-e`、`pattern.trim()`、`--`、目录时 `.` 否则文件 `basename(request.path)`；`preopens` 逐字 `{".": root}`。
- 错误语义：不抛错。
- 时序与并发：纯同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：`preopens` 用绝对 `root`，WASM 侧看到的 `.` 就是该根；Windows 盘符路径原样作为值传递。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：目录搜索 `{path:"/abs/dir", pattern:"a b", outputMode:"content", onlyMatching:true, context:2, type:"ts", ignoreCase:true, multiline:true}` → `root === "/abs/dir"`、参数含 `--json`、`--only-matching`、`-C 2`（作为相邻两元素）、`-i`、`-U`、`--multiline-dotall` 与 `--glob *` 系列，最后四项是 `-e`、`a b`、`--`、`.`；文件搜索 → `root === dirname(path)` 且结尾是 `basename(path)`；`glob:"**/*.ts, *.md"` → 两个 `--glob` 值；`outputMode` 缺省 → 含 `-c`；`preopens` 深度等于 `{".": root}`。

### B106 ripgrep worker 的超时、取消与错误分类

- 来源：`fs/ripgrep-worker.ts`（`runSearch`、`execute`、`setRipgrepWorkerFactoryForTests`、`setRipgrepTimeoutMsForTests`、`RipgrepRuntimeFailure`）
- 输入：`args`、`preopens`、`signal?`。
- 输出：默认超时 **30000 ms**（可被 `setRipgrepTimeoutMsForTests` 覆盖，返回的函数用于还原）；worker 由 `factoryOverride` 或 `new Worker(WORKER_PROGRAM, {eval:true, workerData})` 创建，内部用捆绑 ripgrep WASM（`buffer:true`、`env:{}`、`nodeWasi:false`、`preopens`、`returnOnExit:true`）；信号已中止 → 以 `AbortError`（消息逐字 `ripgrep search was cancelled before it started`）拒绝；运行中 `abort` → `terminate()` 后以 `AbortError`（消息逐字 `ripgrep search was cancelled`）拒绝；超时 → `terminate()` 后以逐字消息 `ripgrep search timed out after <timeout>ms. The search was terminated before it completed.` 拒绝；worker 的 `message` 里 `type:"result"` 才 resolve，`type:"error"` 用序列化的 `{message,name,stack,code}` 还原错误，其它消息 → `Error("ripgrep worker returned an unknown message")`；`error` 事件直接 reject；`exit` 在无结果时 → `Error("ripgrep worker exited before returning a result: <code>")`；`runSearch` 只把超时与 `AbortError` 原样抛出，**其它错误统一包成 `RipgrepRuntimeFailure`**（消息逐字 `Bundled ripgrep WASM failed to run`，`cause` 是原错误，`name` 逐字 `RipgrepRuntimeFailure`）。每次 `settle` 只发生一次，并清理定时器与 abort 监听。
- 错误语义：见上；`terminate()` 返回的 Promise 被吞掉。
- 时序与并发：单 worker 单结果；`done` 标志保证事件竞争下只结算一次。
- 幂等：同一参数重复搜索是独立的两次运行（工厂覆盖是全局的，测试要还原）。
- 资源释放：结果/超时/取消都 `terminate` worker；定时器与监听在 `settle` 清理。
- 平台差异：`nodeWasi:false` 让 WASM 走 Node 的预开放目录，避免平台路径差异。
- 状态所有者：模块级 `factoryOverride`/`timeoutOverride`（仅供测试注入）。
- 日志级别：无。
- 可测断言：`setRipgrepTimeoutMsForTests(5)` + 工厂返回永不发消息的假 worker（`once` 挂起、`terminate` 记录调用）→ 拒绝消息逐字为 `ripgrep search timed out after 5ms. The search was terminated before it completed.`、`terminate` 被调用一次、`name === "RipgrepTimeoutFailure"`；已 abort 的 signal → 拒绝消息逐字 `ripgrep search was cancelled before it started`；运行中 abort → `terminate` 被调用且消息逐字 `ripgrep search was cancelled`；工厂返回 `once("error")` 立即触发的假 worker → `RipgrepRuntimeFailure` 且 `cause` 是原错误；工厂抛错 → `RipgrepRuntimeFailure`；还原函数调用后超时回到 30000。

### B107 `prefix` / `bounded` / `publish` 的读写原语

- 来源：`fs/node-file-io.ts`
- 输入：路径、容量、字节。
- 输出：`prefix(path, capacity)` 只读前 `capacity` 字节（`Buffer.alloc(max(0,capacity))`，句柄在 `finally` 关闭）；`bounded(path, capacity, initialSize)` 用首块 `min(capacity, max(1, initialSize+1))`、后续块 `min(64 KiB, capacity - position)` 反复短读推进直到读满 `capacity` 或 EOF，合并成单个 `Buffer`（零块 → 空 Buffer）；`publish(path, bytes)` 先 `lstat` 目标：目标是符号链接 → 抛 `SymlinkWriteRefusedError`，消息逐字 `Refusing to write through symlink: <path>. Resolve the symlink and pass the real target path explicitly.`；存在则记录 `mode` 供后续 `chmod`；`lstat` 的 `ENOENT` 被忽略；然后在**同目录**写 `<path>.tmp.<pid>.<12 位随机 hex>`（`O_WRONLY|O_CREAT|O_NOFOLLOW|O_EXCL`），写入、`chmod`（有原 mode 时）、`fsync`、`close`，最后 `rename` 覆盖目标；主路径任一步失败 → 尽力 `unlink` 临时文件，再尝试 `O_WRONLY|O_CREAT|O_NOFOLLOW|O_TRUNC` **就地覆盖**（兜底路径）；兜底 `open` 遇到 `ELOOP` → 抛 `SymlinkWriteRefusedError`，消息逐字 `Refusing to write through symlink: <path> (O_NOFOLLOW)`。
- 错误语义：见上；兜底路径的写入错误原样抛。
- 时序与并发：异步；两次写同一路径不做锁（临时文件名含随机量，避免互相覆盖）。
- 幂等：内容相同则结果相同；`publish` 每次都会重建临时文件。
- 资源释放：所有句柄在 `finally`/成功路径关闭；临时文件在失败时尽力删除。
- 平台差异：`O_NOFOLLOW` 在 Windows 上不生效（`ELOOP` 分支不会触发）；`chmod` 在 Windows 上通常无效但不报错。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：1024 字节文件 + `prefix(path, 10)` → 10 字节；`bounded(path, 5, 1024)` → 5 字节；`bounded(path, 5000, 3)` → 全部内容（EOF 提前结束）；`publish` 到普通文件 → 内容正确、目录里没有 `.tmp.*` 残留；`publish` 对已存在文件 → 覆盖成功；可创建符号链接的平台上传符号链接目标 → 抛 `SymlinkWriteRefusedError` 且消息含 `Refusing to write through symlink`（Windows 上该分支跳过并在测试里写明平台）。

### B108 文件系统错误策略与 revision/大小格式化

- 来源：`fs/node-file-policy.ts`（`absolute`、`code`、`failure`、`aborted`、`abortError`、`nodeKind`、`regular`、`revision`、`byteCount`）
- 输入：任意错误、路径、`Stats` 形状对象、字节数。
- 输出：`absolute` 见 B95；`code(error)` 取对象上的 `code`（否则 `undefined`）；`failure(error, path)`：已是 `FileSystemPortError`（`name` 逐字 `FileSystemPortError`）就原样返回；`name === "AbortError"` → `cancelled`（消息逐字 `File system operation was cancelled: <path>`，带 `cause`）；否则按 `code` 映射——`ENOENT → not_found`/`File not found: <path>`、`EACCES|EPERM → permission_denied`/`Permission denied for path: <path>`、`EISDIR → is_directory`/`Path is a directory: <path>`、`ENAMETOOLONG → invalid_path`/`Invalid path: <path>`，其它 → `io_error` 且消息取 `error.message`，非 `Error` 时逐字 `File system error for path: <path>`；`aborted(signal)` 在 `signal.aborted` 时抛 `abortError("File system operation was cancelled")`（`name === "AbortError"`）；`nodeKind` 按 `file → directory → symlink → other` 顺序判定；`regular(info, path, kind)`：目录 → `is_directory`（消息 `Cannot read directory as <text|binary> file: <path>`），非文件 → `not_file`（消息 `Cannot read non-file path as <text|binary>: <path>`）；`revision(info, bytes?)` 返回 `{id: "mtime:<trunc>:size:<size>", mtimeMs, sizeBytes}`，`bytes` 给定再加 `hash: "sha256:<hex>"`；`byteCount`：`< 1024` → `<n>B`，`< 1 MiB` → 以 KB（整数不带小数、否则一位小数且去掉 `.0`），否则 MB。
- 错误语义：不抛错（除 `absolute`/`aborted`/`regular` 的显式抛出）。
- 时序与并发：纯同步。
- 幂等：是。
- 资源释放：无。
- 平台差异：`EACCES` 与 `EPERM` 合并；Windows 上目录被写可能报 `EPERM`，同样映射 `permission_denied`。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`absolute("rel")` → `invalid_path`；`absolute("/a/../b")` → `/b`；`failure(Object.assign(new Error("x"),{code:"ENOENT"}), "p")` → `code === "not_found"` 且消息逐字 `File not found: p`；`EACCES` 与 `EPERM` 都得 `permission_denied`；未知 code → `io_error` 且消息是原 `message`；`aborted(已 abort)` → `name === "AbortError"`；`nodeKind` 对四种形状返回 `file`/`directory`/`symlink`/`other`；`revision({mtimeMs: 1.9, size: 3})` → `id === "mtime:1:size:3"`（截断）且没有 `hash`；`byteCount(1023) === "1023B"`、`byteCount(1024) === "1KB"`、`byteCount(1025) === "1KB"`、`byteCount(1536) === "1.5KB"`、`byteCount(1048576) === "1MB"`。

### B109 文本编码检测与行尾工具

- 来源：`fs/text-metadata.ts`
- 输入：`Buffer`、可选 `path`、编码名、内容。
- 输出：`detectTextEncoding`：UTF-8 BOM（`EF BB BF`）→ `utf8`；UTF-16LE BOM（`FF FE`）→ `utf16le`；遇到 `0x00` → 抛 `unsupported`（消息 `Unsupported or binary text encoding` + 可选 `: <path>`）；控制字符（`< 9` 或 `> 13 且 < 32`）占比 **> 0.3** → `unsupported`；`new TextDecoder("utf-8",{fatal:true})` 成功 → `utf8`；否则依次试 `gb2312`、`gbk`、`gb18030`——从末尾逐字节往前（最多回退 **3** 字节）找可**逐字节往返**的非空前缀，成功即返回该编码；都不行 → `unsupported`。`decodeTextBuffer`：编码缺省时检测，返回 `{content, encoding}`。`encodeTextContent`：编码缺省 `utf8`；中文编码时若 `encode` 后再 `decode` 不等于原文 → 抛 `unsupported`（消息 `Content cannot be encoded as <encoding>` + 可选 `: <path>`）。`createStreamingTextDecoder`：中文编码用 `iconv.getDecoder`，其它用 `StringDecoder`。`shouldNormalizeLineEndings`：编码（小写）不属于 `{base64, base64url, hex}` 时为真。`detectLineEndings`：按 `\n` 计数，前一个字符是 `\r` 记 +1、否则 -1，`balance > 0` → `CRLF`，否则 `LF`。`normalizeLineEndings` 把 `\r\n` 换成 `\n`；`applyRequestedLineEndings(content, undefined)` 原样返回，`CRLF` 时先规范化再把 `\n` 换成 `\r\n`，`LF` 时只规范化。
- 错误语义：见上（`unsupported` 是 `FileSystemPortError`）。
- 时序与并发：同步（流式解码器是有状态对象，不能跨流共享）。
- 幂等：纯函数幂等。
- 资源释放：无（`StringDecoder`/iconv decoder 无外部句柄）。
- 平台差异：中文编码用 `iconv-lite`，跨平台一致；BOM 检测按字节。
- 状态所有者：每个 `createStreamingTextDecoder` 返回的 decoder 实例。
- 日志级别：无。
- 可测断言：`detectTextEncoding(Buffer.from("hi")) === "utf8"`；含 `0x00` 的 buffer → 抛 `unsupported`；大量 `0x01`（占比 > 0.3）→ 抛；GBK 编码的中文字节 → 返回 `gbk`/`gb2312`/`gb18030` 之一且解码回来是原文；`shouldNormalizeLineEndings("base64") === false`、`("utf8") === true`；`detectLineEndings("a\r\nb") === "CRLF"`、`("a\nb") === "LF"`；`normalizeLineEndings("a\r\nb") === "a\nb"`；`applyRequestedLineEndings("a\r\nb","CRLF") === "a\r\nb"`、`("a\nb","LF") === "a\nb"`。

### B110 `TextLineWindow` 的行窗口语义

- 来源：`fs/text-line-window.ts`
- 输入：`offset`、`limit`，以及分段写入的文本与结尾尾巴。
- 输出：`write(text)` 按 `\n` 切分：每段先 `append`（只记录最后一个字符、选中时累积片段），遇到换行调 `complete(true)`；末尾残留段留到下一个 `write` 或 `finish`。`complete(newline)`：`last === "\r"` 时切掉行尾的 `\r`；`newline` 为真时按「行尾是 CRLF」记 `newlineBalance +1` 否则 `-1`；只有 `selected()` 为真才把选中的行 push 进 `lines`；`totalLines++` 后清空片段与尾字符。`selected()` 判定逐字为 `!(totalLines < offset) && (limit === undefined || lines.length < limit)`。`finish(decoderTail, sawBytes)`：先 `append(decoderTail)`，`sawBytes` 为真时再 `complete(false)`（补最后一行——**因此以换行结尾的内容会多出一个末尾空段**，与整读路径的 `split("\n")` 口径一致）。`lineEndings` 是 `newlineBalance > 0 ? "CRLF" : "LF"`。
- 错误语义：不抛错。
- 时序与并发：同步；实例是单次扫描的状态所有者，不可并发写入。
- 幂等：同一输入序列产生同一 `lines`/`totalLines`。
- 资源释放：无。
- 平台差异：CRLF/LF 由前一个字符判定，不依赖平台换行约定。
- 状态所有者：实例（`lines`、`totalLines`、`fragments`、`last`、`newlineBalance`）。
- 日志级别：无。
- 可测断言：`new TextLineWindow(1, 2)` 依次 `write("a\nb\nc\nd\n")` + `finish("", true)` → `lines` 深度等于 `["b","c"]`、`totalLines === 4`；`limit:0` → `lines` 为空但 `totalLines` 正确；`offset` 为 `NaN` → `selected()` 恒真，收集所有行；`write("x\r\ny")` + `finish("", true)` → `lines` 为 `["x","y"]`（行内不含 `\r`）且 `lineEndings === "CRLF"`；不调用 `finish` 时最后一行不计入 `totalLines`。

### B111 `matchContent` 与匹配片段的行号语义

- 来源：`fs/text-search-lines.ts`（`matchingFragments`、`LineStarts`、`contextIndexes`、`matchContent`）
- 输入：`path`、`content`、`regex`、`FileSystemSearchTextRequest`。
- 输出：`matchingFragments(path, text, lineNumber?)`：空文本 → 单条 `{path, lineNumber, text:"", matched:true}`；否则按 `\r?\n` 拆分，非空片段各成一条，`lineNumber` 缺省 `undefined`、否则是 `lineNumber + index`。`matchContent`：
  - 行数组：`content` 为空 → `[]`；否则先去掉**结尾一处**换行（`/\r?\n$/`）再按 `\r?\n` 切分。
  - `multiline`：用 `LineStarts`（预扫 `\n` 位置 + 二分查找行号）把 `matchAll` 的每个匹配定位到**起始行号**；`matchCount` 按匹配数累加；`onlyMatching` 为假时每条匹配只取 `match[0]` 的第一行文本；为真时把匹配跨的行区间记成 span，并用 `matchingFragments` 拆成多条按行条目，然后直接返回（**multiline + onlyMatching 不进入上下文窗口逻辑**）。
  - 非 multiline：逐行；`onlyMatching` 用 `matchAll` 收集该行片段（无片段则跳过该行并**不计入 `matchCount`**）；否则用 `regex.test` 判行；每命中一行 `matchCount++` 并记 `{start: line, end: line}` span。**这里的 `matchCount` 是「命中行数」**。
  - 条目：`contextIndexes(lines.length, spans, request)` 按 `beforeContext ?? context ?? 0` 与 `afterContext ?? context ?? 0` 展开每行的上下文索引（去重、升序、钳制到 `[0, length-1]`）；`onlyMatching` 时优先输出该行的匹配片段、已匹配但无片段的行走 `continue` 跳过、上下文行走 `matched:false` 的整行条目；非 `onlyMatching` 时每条都带 `matched = matched.has(line)`。
- 错误语义：不抛错（正则由调用方编译）。
- 时序与并发：纯同步；正则使用 `lastIndex` 时必须每次重置（实现里已处理）。
- 幂等：是。
- 资源释放：无。
- 平台差异：`\r\n` 与 `\n` 都按一行处理。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`content:"a\nb\nc"` + `regex:/b/` + 无上下文 → `matchCount === 1`、`entries` 只有 `{lineNumber:2, text:"b", matched:true}`；`beforeContext:1, afterContext:1` → 三条条目、只有中间 `matched === true`；`onlyMatching:true` + 正则 `/b/` → 条目文本是 `b` 且 `matched` 为真；`multiline:true` + 正则 `/a\nb/` → `matchCount === 1`、条目文本是 `a`；`multiline:true` + `onlyMatching:true` + 同一正则 → 两条条目（`a` 与 `b`）、行号 1 与 2；`content:""` → `matchCount === 0`、`entries` 为空。

### B112 搜索结果的截断、解析与失败分类

- 来源：`fs/text-search-results.ts`（`limit`、`finish`、`outputLines`、`outputPath`、`parseOutput`、`sortFiles`、`ripgrepFailure`、`SearchHits`）
- 输入：`request`、`startedAt`、命中集合，或 ripgrep 的 `stdout`/`stderr`。
- 输出：`limit`：`offset = offset ?? 0`、`maximum = headLimit ?? 250`；`truncated = maximum !== 0 && items.length - offset > maximum`；`items = maximum === 0 ? items.slice(offset) : items.slice(offset, offset + maximum)`；`appliedLimit` 只在截断时给 `maximum`；`appliedOffset` 只在 `offset > 0` 时给。`finish` 返回 `{path, pattern: <trim>, mode: outputMode ?? "files_with_matches", durationMs: max(0, Date.now()-startedAt), files, entries, numMatches, truncated, appliedLimit?, appliedOffset?}`——`files_with_matches` 模式下 `files` 被分页而 `entries` 为 `[]`；`count`/`content` 模式下 `files` 是**未分页**的全集、`entries` 被分页。`outputLines`：按 `\n` 切分、去掉行尾 `\r`、丢掉空行（**最后一行即使为空也保留**）。`outputPath`：绝对路径 `normalize`，否则 `join(root, 去掉开头 "./")` 后 `normalize`。
- `parseOutput`：非 `content` 模式逐行取**最后一个 `:`** 之后为计数（`parseInt`）；`separator <= 0`、计数非有限或 `<= 0` 的行跳过；路径经 `filter` 保留判定；产出 `files`（Set 去重）与 `{path, count}` 条目、`numMatches` 累加。`content` 模式逐行 `JSON.parse`，失败 → 抛 `io_error`（消息逐字 `Failed to parse ripgrep JSON output`，带 `cause`）；只处理 `type === "match" | "context"`、`data.path.text` 存在的行；`keep` 过滤；`match` 计入 `files` 与 `numMatches++`；`onlyMatching && match && submatches.length` 时按每个 submatch 用 `matchingFragments` 拆条，否则产出 `{path, lineNumber?, text: <lines.text 去尾换行>, matched: <是否 match>}`。
- `sortFiles`：`Set` 去重、逐个 `stat` 取 `mtimeMs`（失败记 0），按 `recent` 排序后返回路径数组。`ripgrepFailure`：消息取 `stderr.trim()`，为空时逐字 `ripgrep failed while searching <path>`；小写后含 `regex parse error`/`error parsing regex`/`unclosed` → `invalid_pattern`（消息 `Invalid grep regular expression: <pattern>`）；含 `permission denied`/`os error 13` → `permission_denied`；含 `no such file`/`os error 2` → `not_found`；否则 `io_error`（消息就是上面的 message）。
- 错误语义：`parseOutput` 只在 JSON 行不可解析时抛 `io_error`；`ripgrepFailure` 总是返回错误对象。
- 时序与并发：纯同步（`sortFiles` 用 `Promise.all` 并发 `stat`）。
- 幂等：是。
- 资源释放：无。
- 平台差异：`outputPath` 兼容 ripgrep 输出的 `./` 前缀；Windows 绝对路径由 `isAbsolute` 识别。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`headLimit:1` + 两个命中 → `truncated === true`、`appliedLimit === 1`、条目长度 1；`headLimit:0` → 不截断且返回 `offset` 之后的全部；`offset:1` → `appliedOffset === 1`；`parseOutput("a.ts:2\nb.md:0\n", root, {outputMode:"count"})` → 只有 `a.ts`、`numMatches === 2`；`parseOutput("{bad json}\n", root, {outputMode:"content"})` → 抛 `io_error` 且消息逐字；JSON 行 `{"type":"match","data":{"path":{"text":"./a.ts"},"line_number":3,"lines":{"text":"x\n"},"submatches":[{"match":{"text":"x"}}]}}` → 一条 `{path: <root>/a.ts, lineNumber:3, text:"x", matched:true}`；`ripgrepFailure("regex parse error", "p", "(")` → `invalid_pattern`；`ripgrepFailure("Permission denied", "p", "x")` → `permission_denied`；`ripgrepFailure("no such file", "p", "x")` → `not_found`；`ripgrepFailure("", "p", "x")` → `io_error` 且消息含 `ripgrep failed while searching p`。

### B113 `fs/` 的导出面

- 来源：`fs/` 十二个文件
- 输入：无。
- 输出：按 `interface.md` 保持：`index.ts` 导出 `setRipgrepWorkerFactoryForTests`、`setRipgrepTimeoutMsForTests`、`NodeFileSystemAdapterOptions`、`NodeFileSystemAdapter`、`createNodeFileSystemAdapter`；`file-search-paths.ts` 导出 `VCS_NAMES`、`Candidate`、`posixRelative`、`glob`、`TYPE_EXTENSIONS`、`fileType`、`matchesType`、`filter`、`walk`、`candidates`、`recent`；`node-file-io.ts` 导出 `prefix`、`bounded`、`publish`；`node-file-policy.ts` 导出 `absolute`、`code`、`failure`、`aborted`、`abortError`、`nodeKind`、`regular`、`revision`、`byteCount`；`node-search.ts` 导出 `searchFiles`、`searchText`；`ripgrep-plan.ts` 导出 `searchPlan`；`ripgrep-worker.ts` 导出 `RipgrepRuntimeFailure`、`setRipgrepWorkerFactoryForTests`、`setRipgrepTimeoutMsForTests`、`runSearch`；`text-line-window.ts` 导出 `TextLineWindow`；`text-metadata.ts` 导出 `detectTextEncoding`、`decodeTextBuffer`、`encodeTextContent`、`createStreamingTextDecoder`、`shouldNormalizeLineEndings`、`detectLineEndings`、`normalizeLineEndings`、`applyRequestedLineEndings`；`text-range-reader.ts` 导出 `readTextFileRangeFromNode`；`text-search-lines.ts` 导出 `LineMatches`、`matchingFragments`、`matchContent`；`text-search-results.ts` 导出 `SearchHits`、`finish`、`parseOutput`、`sortFiles`、`ripgrepFailure`。内部实现（`RipgrepTimeoutFailure`、`LineStarts`、`SymlinkWriteRefusedError`、`codec`、`limit`、`outputLines`、`outputPath`、`scan`、`enumerateDirectory` 等）不得导出；`fs/index.ts` 的两个 `setRipgrep*` 是 `ripgrep-worker.ts` 同名函数的薄包装（转发而非各留一份状态）。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：十二个模块的 `Object.keys` 分别等于 `interface.md` 的导出集合；`mod.RipgrepTimeoutFailure === undefined`、`mod.SymlinkWriteRefusedError === undefined`、`mod.outputLines === undefined`。

### B114 `NodeFileLogger` 的级别门控与写入路径

- 来源：`logging/index.ts`（`NodeFileLogger`）
- 输入：`FileLoggerOptions`（`category`、`defaultContext?`、`getMinLevel`、`logDir`、`consoleStream?`、`includeErrorStack?`、`redactor`）与调用 `debug/info/warn/error`。
- 输出：构造时把缺省值固化（`defaultContext ?? {}`、`includeErrorStack ?? false`）；`debug/info/warn` 走同一 `write(level, message, context)`，`error(message, error?, context?)` 额外带 `error`；`write` 首先 `if (level < settings.getMinLevel.call(this)) return`（**数值比较，低级别直接丢弃**，既不写文件也不写 console）；否则 `merged = {...defaultContext, ...context}`（后者覆盖，含键存在但值为 `undefined` 的情况）、`projectLogEntry(...)`、`JSON.stringify(toSerializableEntry(entry, redactor))`、`appendLogRecord(logDir, json)`（磁盘失败不抛），配置了 `consoleStream` 时再写一行 `formatConsoleLine(entry) + "\n"`；`child(context)` 返回新的 `NodeFileLogger`，其 `defaultContext` 是 `{...原 defaultContext, ...context}`，共享同一 `getMinLevel` 引用与其余设置。
- 错误语义：文件写入失败不阻断执行（见 B117）；`redactor.redact`/`formatConsoleLine` 的异常会传播。
- 时序与并发：同步追加（`appendFileSync`）；`child` 不影响父实例。
- 幂等：同一消息重复写会重复追加（日志语义）。
- 资源释放：无长期句柄（每次 `appendFileSync` 自开自闭）。
- 平台差异：文件路径由 `join` 构造；换行固定 `\n`。
- 状态所有者：`settings` 对象（构造后不被修改）。
- 日志级别：`debug|info|warn|error` 四级，门控来自工厂的 `getMinLevel`。
- 可测断言：把 `getMinLevel` 绑定到一个可变的级别变量 → 先 `debug`/`info` 不产生文件、把它改成 `warn` 后 `warn` 产生一条 JSONL；`level < minLevel` 时不调用 console 流；`child({sessionId:"s"})` 写出的条目带 `sessionId` 且父实例写出的条目不带；`error(msg, new Error("boom"), {event:"x"})` 的条目 `error.name === "Error"`；console 流的每一行以 `level [category]` 开头。

### B115 `createNodeLoggerFactory` 的默认值与调度

- 来源：`logging/index.ts`（`createNodeLoggerFactory`、`initialLevel`、`getDefaultLogDir`）
- 输入：`NodeLoggerFactoryOptions`（`env?`、`logDir?`、`minLevel?`、`console?`、`includeErrorStack?`、`redactor?`）。
- 输出：`state.minimum = options.minLevel ?? initialLevel(options.env ?? process.env)`；`initialLevel` 按 `normalizeKnorviaRuntimeEnv(env[KNORVIA_RUNTIME_ENV_KEY])`：`development` → `debug`；`production`/`test` → `info`；其余看 `process.argv[1]`——以 `.ts` 结尾且包含 `join("packages","cli","src")` → `debug`，否则 `info`。日志目录 `options.logDir ?? options.env?.KNORVIA_LOG_DIR ?? getDefaultLogDir()`，`getDefaultLogDir()` 逐字是 `join(resolveKnorviaDataRoot(), "cli", "log")`（不新增环境变量、不换数据目录）。console 输出：`console` 是对象 → 用它的 `stream`；`console === true` **或** `env.KNORVIA_LOG_CONSOLE === "1"` → `process.stderr`；否则无。`redactor` 缺省 `new DefaultLogRedactor()`。返回对象：`createLogger(category)`、`withContext(context)`（等价 `create("root", context)`）、`setLevel(level)`（改 `state.minimum`，对已创建的 logger 生效）、`getLogDir()`、`scheduleLogRetentionCleanup(request?)`——**同一个工厂只调度一次**（`cleanupAdmitted` 为真后返回 `undefined`），未传 `logger` 时用 `create("knorvia", {module:"adapters.logging"})`。
- 错误语义：不抛错（目录不存在由 sink 处理）。
- 时序与并发：同步创建；`setLevel` 立即生效。
- 幂等：`scheduleLogRetentionCleanup` 第二次调用返回 `undefined`。
- 资源释放：调度返回的 timer 由调用方持有（`unref` 见 B120）。
- 平台差异：`process.argv[1]` 的路径片段用 `join` 匹配，Windows 反斜杠也成立。
- 状态所有者：工厂实例（`minimum`、`cleanupAdmitted`）。
- 日志级别：默认级别规则如上。
- 可测断言：`createNodeLoggerFactory({env:{KNORVIA_LOG_DIR: <tmp>, KNORVIA_LOG_CONSOLE: "1"}, minLevel:"debug"})` → `getLogDir() === <tmp>`、写一条 `info` 后 `<tmp>/knorvia-<今天>.jsonl` 存在且内容是一行 JSON；`env:{}` → `getLogDir()` 以 `cli/log` 结尾；`env:{KNORVIA_RUNTIME_ENV:"development"}` → 默认级别 `debug`（`debug` 消息落盘）；`env:{KNORVIA_RUNTIME_ENV:"production"}` → `debug` 不落盘；`setLevel("error")` 后 `warn` 不落盘、`error` 落盘；`withContext({a:1})` 产出的条目 `context` 含 `a`；同一工厂调用两次 `scheduleLogRetentionCleanup({delayMs:0, setTimeout: <假 timer>})` → 第二次 `undefined`。

### B116 日志条目的字段投影

- 来源：`logging/entry.ts`（`projectLogEntry`）
- 输入：`category`、`level`、`message`、`context`、`error`、`includeStack`。
- 输出：初始条目 `{timestamp: new Date(), level, levelName: LogLevelName[level], message}`；随后按逐字固定顺序 `event`、`module`、`sessionId`、`turnId`、`spanId`、`parentSpanId`、`toolCallId` 处理：值是字符串就写同名字段；不是字符串时**只有 `module`** 会退回 `category`；处理 `module` 这一轮**同时**把 `context.traceId` 原样写进 `entry.traceId`（不做类型检查）；`context.durationMs` 是数字才写 `durationMs`；`isLogStatus(context.status)` 为真才写 `status`；`entry.context = stripReservedContext(context)`；`error` 存在时 `entry.error = serializeLogError(error, includeStack)`。
- 错误语义：不抛错（`context` 是普通对象）。
- 时序与并发：同步；读取 `context` 自有属性的顺序固定（先触碰保留键，见 B118）。
- 幂等：是（除 `timestamp`）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无（级别由调用方给）。
- 可测断言：`projectLogEntry("cat", Level.Info, "m", {module:"mod", traceId:"t", event:"e", sessionId:"s", durationMs:5, status:"completed", extra:1}, undefined, false)` → `entry.module === "mod"`、`entry.traceId === "t"`、`entry.event === "e"`、`entry.durationMs === 5`、`entry.status === "completed"`、`entry.context` 深度等于 `{extra:1}`、没有 `error`；`{module: 1}`（非字符串）→ `entry.module === category`；`{traceId: 42}` → `entry.traceId === 42`（原样）；`{status:"bogus"}` → 无 `status` 键；`{event:""}` → `entry.event === ""`。

### B117 日志文件的追加与失败吞掉

- 来源：`logging/file-sink.ts`（`appendLogRecord`）
- 输入：日志目录与一行 JSON。
- 输出：目录不存在时先过故障注入钩子（`{operation:"mkdir", path:directory}`）再 `mkdirSync(directory,{recursive:true})`；目标文件逐字是 `join(directory, "knorvia-" + formatLocalLogDate(new Date()) + ".jsonl")`；追加前再过故障注入钩子（`{operation:"appendFile", path:destination}`）；`appendFileSync(destination, json + "\n", "utf8")`。
- 错误语义：**整个函数体在一个 `catch {}` 里，任何错误都被吞掉**（文件失败不阻断执行，这是 logger 的 `void` 合同）；JSON 序列化与脱敏在调用层（见 B114）所以不会被吞。
- 时序与并发：同步；同一天的文件只追加、从不修改或截断。
- 幂等：追加不幂等（每次写一行）。
- 资源释放：每次同步写自开自闭。
- 平台差异：文件名用本地日历日期（见 B120），跨时区/夏令时由 `Date` 的本地字段决定。
- 状态所有者：日志文件（追加目标）。
- 日志级别：无（本函数不判断级别）。
- 可测断言：`appendLogRecord(<tmp>, '{"a":1}')` → `<tmp>/knorvia-<今天>.jsonl` 内容逐字 `{"a":1}\n`；目录不存在时被递归创建；同一目录两次调用 → 两行；把目录路径指向一个**已存在的文件**（`mkdirSync` 必失败）→ 不抛错且该文件内容不被改动。

### B118 日志脱敏器与保留键剥离

- 来源：`logging/serialize.ts`（`DefaultLogRedactor`、`stripReservedContext`、`isLogStatus`、`HIDDEN_KEY`、`MAX_DEPTH`）
- 输入：任意值。
- 输出：`DefaultLogRedactor.redact` 用**显式栈**遍历（不递归），规则：字符串 → `redactDiagnosticText(value)`；`depth > 8` → 逐字 `[Redacted:DepthLimit]`；`null` 与非对象原样；同一对象第二次出现 → 逐字 `[Redacted:Circular]`；数组保留长度（稀疏空槽不产出）；普通对象按 `Object.entries` 的键顺序建结果，键名匹配 `HIDDEN_KEY` 正则 `/(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i` 的直接写成逐字 `[Redacted]`（只按自身键名匹配）；结果对象的键通过 `defineProperty` 写成可枚举自有属性。`stripReservedContext(context)`：先按固定顺序（`durationMs`、`event`、`module`、`parentSpanId`、`sessionId`、`spanId`、`status`、`toolCallId`、`traceId`、`turnId`）触碰这些键，然后只复制**不在保留集合里且可枚举的自有字符串键**，无剩余键时返回 `undefined`。`isLogStatus` 只看五个状态字面量。
- 错误语义：不抛错（属性 getter 抛错会传播）。
- 时序与并发：同步；无共享状态。
- 幂等：是（同一输入同一输出）。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无（每次 `redact` 新建 `WeakSet`）。
- 日志级别：无。
- 可测断言：`redact({apiKey:"x", nested:{token:"y"}, keep:"z"})` → `{apiKey:"[Redacted]", nested:{token:"[Redacted]"}, keep:"z"}`；`redact({a:[1,,3]})` → 数组长度 3、索引 1 不存在；深嵌套超过 8 层 → 深层是 `[Redacted:DepthLimit]`；`const o={}; o.self=o; redact(o)` → `self` 是 `[Redacted:Circular]`；`stripReservedContext({traceId:"t", extra:1})` → `{extra:1}`；`stripReservedContext({traceId:"t"})` → `undefined`；`isLogStatus("waiting") === true`、`isLogStatus("running") === false`。

### B119 日志序列化、console 行与错误链

- 来源：`logging/serialize.ts`（`toSerializableEntry`、`formatConsoleLine`、`serializeLogError`、`ENTRY_ORDER`）
- 输入：`LogEntry`、`LogRedactor`、错误对象。
- 输出：`toSerializableEntry` 按**固定键序** `timestamp`、`level`、`event`、`module`、`message`、`traceId`、`spanId`、`parentSpanId`、`sessionId`、`turnId`、`toolCallId`、`durationMs`、`status`、`context`、`error` 输出：`timestamp` 用 `toISOString()`、`level` 用 `levelName.toLowerCase()`、`message`/`context`/`error` 过 `redactor.redact`、其余原值；值为 `undefined` 的键**不出现**。`formatConsoleLine` 逐字拼 `"<level> [<module 或 log>]"`，有 `traceId` 时追加 `"trace=<前 8 字符>"`，有 `event` 时追加 `"event=<event>"`，最后追加 `redactDiagnosticText(message)`，单空格连接（**level 小写**）。`serializeLogError(error, includeStack, seen?, depth?)` 迭代走 `cause` 链：`depth > 8` → `{name:"ErrorCauseDepthLimit", message:"Error cause chain exceeded the serialization depth limit."}`；同一对象再次出现 → `{name:"ErrorCauseCircularReference", message:"Error cause chain contained a circular reference."}`；非对象 → `{name:"UnknownError", message:String(input)}`；对象节点取 `name`（字符串或逐字 `Error`）、`message`（字符串或 `String(input)`）、非空字符串 `code`/`type`、`includeStack` 时的 `stack`、原型是 `null` 或 `Object.prototype` 时的 `context` 原对象；链上下一节点挂在 `cause` 上。
- 错误语义：`toSerializableEntry` 的 `redactor.redact` 抛错会传播；`serializeLogError` 自身不抛。
- 时序与并发：纯同步。
- 幂等：是（除 `timestamp` 由入参决定）。
- 资源释放：无。
- 平台差异：`toISOString` 与平台无关。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`toSerializableEntry({timestamp:new Date("2026-01-02T03:04:05.678Z"), level:2, levelName:"WARN", message:"m", module:"mod", traceId:"abcdefghijk", context:{a:1}, error:{name:"E",message:"x"}}, new DefaultLogRedactor())` → 键序逐字为 `["timestamp","level","module","message","traceId","context","error"]`、`timestamp === "2026-01-02T03:04:05.678Z"`、`level === "warn"`；`formatConsoleLine({levelName:"INFO", module:"m", traceId:"1234567890", event:"e", message:"hi"})` → 逐字 `info [m] trace=12345678 event=e hi`；无 `module` 时用 `[log]`；`serializeLogError(new Error("boom"), false)` → `{name:"Error", message:"boom"}` 且没有 `stack`；`includeStack:true` → 有 `stack`；`const a=new Error("a"); a.cause=a; serializeLogError(a,false)` → `cause.name === "ErrorCauseCircularReference"`；`code`/`type` 为空串时不带键。

### B120 日志保留清理

- 来源：`logging/retention.ts`（`cleanupLogRetention`、`daysToKeep`、`formatLocalLogDate`、`logCalendarDate`、`reportFailure`、`failure`、`scheduleLogRetentionCleanup`）
- 输入：`{logDir, logger?, now?, retentionDays?}`；调度额外有 `delayMs?`、`now?: () => Date`、`setTimeout?`。
- 输出：常量逐字 `LOG_RETENTION_DAYS = 7`、`LOG_CLEANUP_STARTUP_DELAY_MS = 60000`；`daysToKeep`：`undefined` 或非有限数 → 7，否则 `max(1, trunc)`。`cutoff = new Date(本地年, 本地月, 本地日 - retentionDays + 1)`，`cutoffDate` 是 `formatLocalLogDate(cutoff)`（本地 `YYYY-MM-DD`，年份 `padStart(4)`、其余 `padStart(2)`）。`readdir(logDir,{withFileTypes:true})` 失败：`ENOENT` → 直接返回结果（**不写日志**）；其它错误 → `status: "failed"` 并 `logger.warn("Log retention cleanup failed", {cutoffDate, error:{code,message,name}, event:"log.retention.cleanup.failed", logDir, module:"adapters.logging", retentionDays, status:"failed"})`。逐条目：非普通文件跳过；文件名必须 `knorvia-<YYYY-MM-DD>.jsonl` 且日期**可往返**（如 `2026-02-31` 被拒）；`scannedFiles++`；`date >= cutoffDate`（字符串比较）→ 保留；否则 `unlink`，成功进 `deletedFiles`；`ENOENT` → 静默跳过；其它错误 → `failedFiles` + `status:"failed"` + `logger.warn("Log retention file delete failed", {..., fileName, event:"log.retention.delete.failed"})`。最后 `logger.debug("Log retention cleanup completed", {cutoffDate, deletedFileCount, event:"log.retention.cleanup.completed", failedFileCount, logDir, module, retentionDays, scannedFiles, status})`。`scheduleLogRetentionCleanup`：`delayMs ?? 60000`；先 `logger.info("Log retention cleanup scheduled", {delayMs, event:"log.retention.cleanup.scheduled", logDir, module, retentionDays, status:"waiting"})`；注册回调（缺省 `setTimeout`），回调里用 `now?.() ?? new Date()` 调 `cleanupLogRetention`（`void`，不等待）；`timer.unref?.()` 后返回 timer。
- 错误语义：清理失败不抛错（`status: "failed"` + warn 日志）；`unlink` 的 `ENOENT` 视为已删除。
- 时序与并发：异步串行删除；调度是「启动后延迟一次」，不重复。
- 幂等：重复清理是幂等的。
- 资源释放：timer 由调用方 `unref` 后可随进程退出。
- 平台差异：日期是**本地日历**，不做 UTC 转换；文件名格式固定。
- 状态所有者：`logDir` 下的日志文件。
- 日志级别：`info`（调度）、`debug`（完成）、`warn`（失败）。
- 可测断言：临时目录里放 `knorvia-2026-01-01.jsonl`、`knorvia-2026-01-05.jsonl`、`other.jsonl`、`knorvia-bad.jsonl`、同名目录 `knorvia-2026-01-01.jsonl/` → `now: new Date(2026,0,6)` 且 `retentionDays` 缺省（7）→ `cutoff = now - (7-1) 天`、`cutoffDate === "2025-12-31"`、`scannedFiles === 2`、`deletedFiles` 为空；`now: new Date(2026,0,9)` → `cutoffDate === "2026-01-03"`、`deletedFiles` 只含 `knorvia-2026-01-01.jsonl`；`retentionDays:0` → 视为 1；`NaN` → 7；`logDir` 不存在 → `status === "completed"`、`scannedFiles === 0`、`logger.warn` 未被调用；`scheduleLogRetentionCleanup({delayMs:5, now: () => new Date(2026,0,9), setTimeout: (fn)=>{captured = fn; return {unref(){unrefed = true}}}})` → `unref` 被调用、`logger.info` 收到 `status:"waiting"`、执行 `captured()` 后（等一个微任务）目标文件被删除且 `logger.debug` 收到 `status:"completed"`。

### B121 `logging/` 的导出面

- 来源：`logging/` 五个文件
- 输入：无。
- 输出：按 `interface.md`：`index.ts` 导出 `NodeLoggerFactoryOptions`、`NodeLogRetentionScheduleOptions`、`NodeLoggerFactory`、`NodeFileLogger`、`getDefaultLogDir`、`createNodeLoggerFactory`，并对 `retention.ts` 与 `serialize.ts` 做 re-export（`LOG_CLEANUP_STARTUP_DELAY_MS`、`LOG_RETENTION_DAYS`、`cleanupLogRetention`、`formatLocalLogDate`、`scheduleLogRetentionCleanup`、4 个类型、`DefaultLogRedactor`、`SerializableLogEntry`、`SerializedLogError`）；`entry.ts` 导出 `projectLogEntry`；`file-sink.ts` 导出 `appendLogRecord`；`retention.ts` 导出 `LOG_RETENTION_DAYS`、`LOG_CLEANUP_STARTUP_DELAY_MS`、`LogRetentionCleanupOptions`、`LogRetentionCleanupResult`、`LogRetentionTimer`、`LogRetentionScheduleOptions`、`formatLocalLogDate`、`cleanupLogRetention`、`scheduleLogRetentionCleanup`；`serialize.ts` 导出 `SerializedLogError`、`SerializableLogEntry`、`DefaultLogRedactor`、`stripReservedContext`、`toSerializableEntry`、`formatConsoleLine`、`isLogStatus`、`serializeLogError`。内部函数（`initialLevel`、`errorNode`、`daysToKeep`、`logCalendarDate`、`failure`、`reportFailure`、`isMissing`、`codec`、`unsupported`）不得导出。
- 错误语义：模块解析失败即入口不可用。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：五个模块的 `Object.keys` 分别等于 `interface.md` 的导出集合；`mod.initialLevel === undefined`、`mod.daysToKeep === undefined`、`mod.errorNode === undefined`；`index.ts` 的 `DefaultLogRedactor` 与 `serialize.ts` 的是同一个函数对象。

## E. 会话存储迁移的夹具组织与其余小目录（`storage/session-store*` 的测试组织、`mailbox/`、`pdf/`、`provider/`、`skills/`、`workflow/`、barrel）

状态所有者：会话存储的**唯一状态所有者是 SQLite 文件**（`schema_migration` 账本 + 业务表），迁移执行器负责按账本推进；契约测试只做「合成旧库 → 打开 → 断言」的黑盒读写，不持有跨用例状态。`NodeSessionMailboxAdapter` 的状态是 `rootDir` 下的 `unread/` 与 `read/` 两个目录（重命名即状态迁移）。`NodeSkillAdapter` 的 `disabled` 集合与 `pluginNames` 缓存归实例所有。`NodeWorkflowStore` 无内存状态，所有事实落在 `rootDir` 的文件里（`index.json`、`runs/<sanitized>/…`）。

### B122 会话存储迁移夹具必须脱敏且可合成

- 来源：`storage/session-store/migrations.ts`（`SQLITE_MIGRATIONS`）与 B17 的往返契约
- 输入：测试用的临时目录。
- 输出：**夹具不得是真实用户数据库**：旧版数据库一律用 `node:sqlite` 的 `DatabaseSync` 在 `node:os` 的 `tmpdir()` 下**按脚本合成**，只保留旧版 schema 形状与列（如 0001 的 `session` 表、`message`/`part`、`local_setting` 等），插入的数据全部是虚构占位（如 `sess_fixture`、`project_fixture`、时间戳常量）；**不得包含真实会话、真实用户数据、凭据、令牌、内部服务地址或真实主目录路径**。夹具按「版本切片」组织：每个被测的历史版本一个最小建表脚本 + 一行代表性数据；需要「迁移前」状态的用例不通过应用现成迁移来造，而是手写旧 SQL。
- 错误语义：夹具脚本自身失败即测试失败（不吞错）。
- 时序与并发：夹具在每个用例内新建、用例结束 `rm -rf` 清理；固定时间戳与固定主键，避免跨用例污染。
- 幂等：同一夹具脚本重复生成同一形状的库（除 SQLite 文件内部的物理差异）。
- 资源释放：`DatabaseSync` 必须显式 `close()`；临时目录在 `after` 钩子删除。
- 平台差异：临时目录用 `tmpdir()` + `mkdtemp`，路径拼接用 `join`；不写死 `/tmp`。
- 状态所有者：测试用例持有的临时 SQLite 文件。
- 日志级别：无。
- 可测断言：夹具里 `SELECT name FROM sqlite_master` 只出现脚本声明的表；`SELECT count(*) FROM session` 等于夹具行数；夹具文本里不出现 `Bearer `、`token`/`password` 赋值形态、`http(s)://` 内部域名字面量（用允许清单断言）；每个夹具用例结束后临时目录不存在。

### B123 迁移账本的冻结事实：编号、顺序与 checksum

- 来源：`storage/session-store/migrations.ts`（`SQLITE_MIGRATIONS`，`{appVersion, id, sql}`）
- 输入：无（读取账本常量）。
- 输出：账本按**追加式**排列：`id` 唯一、按版本顺序单调、每个 `id` 形如 `^\d{4}_[a-z0-9_]+$`；已发布的 0001–0022 一个都不能改、不能删、不能改序号；`sql` 是冻结文本，运行时的身份校验逐字为「`sha256(sql.trim())` 与账本表 `schema_migration.checksum` 相等」，不一致时的错误文案逐字包含 `SQLite migration checksum mismatch for <id>. Historical migrations are immutable; add a new migration instead.`；本包只保证**账本文本与编号的不可变性**（判定与落库由非本包的执行器完成，见「不在范围」说明）。新增迁移只能是**新的最大编号**。
- 错误语义：读取账本本身不抛错；篡改已发布项会在执行器侧变成 `SqliteSessionMigrationError(kind: "checksum_mismatch")`（不在本包，但契约测试用夹具锁定其前提）。
- 时序与并发：账本是模块级常量数组，加载时冻结（`readonly`）。
- 幂等：同一文件每次读取得到同样的 id 列表与同样的 `sql.trim()` 摘要。
- 资源释放：无。
- 平台差异：`sql` 文本里的换行固定 `\n`（模块源码为 LF），checksum 因此跨平台一致。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`SQLITE_MIGRATIONS.map(m => m.id)` 深度等于 `fixtures/` 里记录的冻结 id 列表；`SQLITE_MIGRATIONS.length` 等于冻结条数；每个 `id` 匹配 `^\d{4}_[a-z0-9_]+$` 且严格递增；`createHash("sha256").update(m.sql.trim()).digest("hex")` 逐条等于 `fixtures/session-store/ledger-checksums.json` 里记录的摘要（**该文件由本次旧门生成后冻结**）；任意两条 `sql` 不相同。

### B124 「旧写 → 新读 → 新写 → 旧读」四步的组织

- 来源：B17 的往返契约 + `storage/session-store.ts`（barrel）+ `storage/index.ts`（门面，非本包）
- 输入：B122 的合成旧库。
- 输出：四步固定组织，全部走公开入口：
  1. **旧写**：用 `node:sqlite` 直接对合成库写入旧版形状的行（不经过本包代码）；
  2. **新读**：通过 `apps/cli/packages/adapters/src/storage/session-store.ts`（dist 对应 `dist/storage/session-store.js`）或 `storage/index.ts` 的 `createSqliteSessionStore` / `openStartupSqliteSessionStore` 打开同一文件，断言旧行仍可读（字段值与旧写一致、缺失的新列有定义的默认语义），并且 `schema_migration` 账本表出现本包的每个 `id`；
  3. **新写**：用同一个公开入口写入新数据（新会话/消息/输入记录等），断言写入成功；
  4. **旧读**：关掉 store 后重新用 `node:sqlite` 直接读原始表，断言旧表与旧列**仍然存在**、旧行未被破坏、新写入的数据在旧列上取值符合旧格式（新列只做加法）。
- 错误语义：任一步失败即测试失败；不允许用「跳过断言」规避（`0 skipped` 是旧门要求）。
- 时序与并发：同一用例内串行执行；打开-关闭-重开至少一次，覆盖「迁移已完成」的第二次打开（幂等）。
- 幂等：第二次打开不重复执行迁移、不产生新的账本行。
- 资源释放：所有 `DatabaseSync` 与 store 句柄显式关闭。
- 平台差异：SQLite 文件路径由 `join` 构造；Windows 上先 `close()` 再删除文件。
- 状态所有者：临时 SQLite 文件。
- 日志级别：无（测试断言直接看库内容）。
- 可测断言：四步都成功；第二步账本行数等于 `SQLITE_MIGRATIONS.length`；第三步之后第四步能读到新数据；重开后账本行数不变；旧表名与旧列名（如 `session.project_id`、`message.session_id`）仍在 `PRAGMA table_info` 结果里。

### B125 会话信箱（`mailbox/`）的目录迁移语义

- 来源：`mailbox/index.ts`（`NodeSessionMailboxAdapter`、`createNodeSessionMailboxAdapter`、`parseEnvelope`）
- 输入：`{rootDir}`；`drainUnread({sessionId, limit?}, {signal?})`。
- 输出：`sessionId` 先 `String()`，必须匹配逐字 `^sess_[A-Za-z0-9._-]+$`，否则抛 `Invalid session id: <id>`；解析后的 session 目录必须仍在 `rootDir` 内（`relative` 为空或以 `..` 开头或绝对 → 抛 `Session mailbox path escapes root: <id>`）；`drainUnread` 先递归创建 `unread`/`read` 两个目录，再 `readdir(unread)`、只取 `.json`、**按文件名字典序排序**、`slice(0, limit ?? 20)`；逐条：`signal?.throwIfAborted()` → 读文件 → `parseEnvelope`（必须 `version === 1` 且 `messageId`/`fromSessionId`/`toSessionId`/`content`/`createdAt` 全是字符串，否则抛逐字 `Invalid session mailbox envelope`）→ 推入结果 → `rename(unread → read)`（**重命名即已读标记**，先入结果后迁移，失败时已迁移的条目不会回滚）。返回 `SessionMailboxEnvelope[]`。
- 错误语义：非法 session id / 逃逸路径 / 信封格式错误都抛 `Error`；`readFile`/`rename` 的原始错误冒泡。
- 时序与并发：异步串行；`limit` 是「每次最多取多少」，不保证公平；并发 `drainUnread` 同一目录可能竞争（`rename` 失败即抛错）。
- 幂等：已 `rename` 到 `read` 的条目不再被返回（第二次调用返回剩余或空数组）。
- 资源释放：无长期句柄。
- 平台差异：路径校验用 `resolve`/`relative`/`isAbsolute`；`rootDir` 必须存在或可创建。
- 状态所有者：`rootDir/<sessionId>/{unread,read}` 目录内容。
- 日志级别：无。
- 可测断言：`rootDir` 下预置 `unread/a.json`、`unread/b.json`、`unread/c.txt` → `drainUnread({sessionId:"sess_x"})` 返回 2 条（顺序 `a`、`b`），`read/` 里有这两个文件、`unread/` 为空、`c.txt` 留在 `unread`；`limit:1` → 只返回 `a.json`；第二次调用返回 `b.json`；`sessionId:"bad"` → 抛 `Invalid session id: bad`；`sessionId:"sess_../x"` → 匹配失败仍走非法 id（模式不允许 `/`）；信封缺字段 → 抛 `Invalid session mailbox envelope`；已 abort 的 signal → 抛 `AbortError`；`createNodeSessionMailboxAdapter` 返回实现 `SessionMailboxPort` 的实例。

### B126 技能根发现（`skills/roots.ts`）

- 来源：`skills/roots.ts`（`resolveDefaultSkillRoots`、`SkillRootResolutionOptions`）
- 输入：`workingDirectory` 与选项（`homeDirectory?`、`extraRoots?`、`extraResolvedRoots?`、`includeKnorviaSkills?`）。
- 输出：结构与 `commands/roots.ts` **同构**，目录名换成 `skills`：`extraRoots` → 用户私有根 `join(privateRoot, "skills")`（`privateRoot = options.homeDirectory ? join(home, ".knorvia-studio") : resolveKnorviaDataRoot()`）→ `join(home, ".agents", "skills")` → 项目目录链（到 `.git` 标记为止）每层的 `.knorvia-studio/skills` 与 `.agents/skills` → `extraResolvedRoots` 原样追加；`priority` 从 0 起每项 +10，`scope`/`source` 与 commands 一致（`user|project` × `knorvia|agents`），每个根的 `path` 经过 `resolve`。
- 差异（必须保持）：`resolveConfiguredRoot` 的 `~/` 展开用**模块级 `homedir()`**，**不吃 `options.homeDirectory`**（与 commands 的行为不同，这是既有实现）；无 `.git` 祖先时项目目录链只有工作目录自己。
- 错误语义：不抛错（`pathExists` 吞掉 `stat` 失败）。
- 时序与并发：异步串行 `stat`。
- 幂等：是。
- 资源释放：无。
- 平台差异：`resolve`/`join`/`dirname`；Windows 根目录由 `dirname(current) === current` 终止。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：注入 `homeDirectory` 到临时目录 → 根优先级 `10,20,30,…`，用户级两个根依次是 `<tmp>/.knorvia-studio/skills` 与 `<tmp>/.agents/skills`；`includeKnorviaSkills:false` → 没有任何 knorvia/agents 根；`extraRoots:["~/skills"]` → `path === join(homedir(), "skills")`（**不是** `homeDirectory`）；`extraResolvedRoots` 的对象原引用出现在末尾。

### B127 技能目录扫描（`skills/scan.ts`）

- 来源：`skills/scan.ts`（`scanSkillFilesUnderRoot`、`scanSkillFilesUnderRootSync`）
- 输入：根路径与 `{followSymbolicLinks?}`（缺省 `true`）。
- 输出：`follow` 为假且根自身是符号链接 → `[]`；根 `stat` 失败或不是目录 → `[]`（`ENOENT` 静默，其它错误抛出）；先看 `<root>/SKILL.md`（文件名为 `@knorvia/shared` 的 `SKILL_FILE_NAME`），`canLoad` 为真才收；再 `readdir(withFileTypes)`，条目必须是目录或（`follow` 时）符号链接，且必须通过 `shouldWalkSkillDirectoryEntry(name)`（来自 `@knorvia/shared`），然后看 `<root>/<entry>/SKILL.md`；`canLoad` = （`follow` 或目标不是符号链接）且 `stat` 结果是文件——**符号链接的 `SKILL.md` 在 `follow:false` 时被排除**；`stat` 的 `ENOENT` 当作不可加载，其它错误抛出。同步版本（`…Sync`）用 `statSync`/`lstatSync`/`readdirSync`，语义逐条一致（同一输入同一顺序：先根再条目顺序）。
- 错误语义：见上；不可加载不产生诊断（诊断由 `skills/index.ts` 的调用方负责）。
- 时序与并发：异步版逐条 `await`；同步版阻塞。
- 幂等：同一目录状态同一结果（顺序 = `readdir` 顺序）。
- 资源释放：无长期句柄。
- 平台差异：`join` 构造路径；符号链接在 Windows 上的创建需要权限（测试里按「能创建就断言、不能就按不可加载处理」分层）。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：根里有 `SKILL.md`、`alpha/SKILL.md`、`beta/readme.md`、`gamma/`（无 SKILL.md）、`.hidden/SKILL.md`（若 `shouldWalkSkillDirectoryEntry` 拒绝点开头目录则不含它）→ 结果含根自身与 `alpha` 两项；根不存在 → `[]`；根是文件 → `[]`；`followSymbolicLinks:false` 且根是符号链接 → `[]`；异步与同步版本在同一目录上返回**同一数组**。

### B128 `skills/index.ts` 的元数据解析与发现

- 来源：`skills/index.ts`（`NodeSkillAdapter`、`createNodeSkillAdapter`、`frontmatterOf`、`bodyOf`、`parseFields`、`blockText`、`findPluginName`）
- 输入：`discoverSkills({workingDirectory, roots?}, {signal?})`、`loadSkill({name, workingDirectory, roots?, maxBytes?}, {signal?})`。
- 输出：`frontmatterOf`：去 BOM 后必须以 `---` 开头、**第一行 trim 后逐字为 `---`**、存在后续某行 trim 后也是 `---`，否则 `null`；`bodyOf`：去 BOM 后不以 `---` 开头就原样返回，否则以**第一个** `trim() === "---"` 的行（从第 2 行起）为分界取其后的行；`parseFields` 跳过空行、`#` 注释行与**以空白开头**的续行；`indexOf(":") <= 0` 的行写 `skill_invalid_frontmatter`（warning，`message` 逐字 `Invalid frontmatter line <行号> in <文件名>`）；值 trim 后匹配 `/^>[+-]?$/` 或 `/^\|[+-]?$/` 时按块标量收集后续「空行或以空白开头的行」，`>` 折叠（段落内空格连接、段间换行）、`|` 保留换行，块内按最小缩进去缩进。
- 元数据：`name = scalar(values.name) ?? (有 frontmatter ? undefined : basename(dirname(path)))`；缺 name → `skill_missing_name`（error，消息 `Skill frontmatter must include a name: <path>`）→ 跳过；有 frontmatter 但 `description` 为空 → `skill_missing_description`（error，消息 `Skill frontmatter must include a description: <path>`）→ 跳过；`description.length > 1024` → `skill_description_too_long`（error，消息 `Skill description is too long: <name>`）→ 跳过；`safeToAutoLoad = frontmatterKeys.every(key => SUPPORTED_FIELDS.includes(key))`（`SUPPORTED_FIELDS` 逐字 `name`、`description`、`when_to_use`、`license`、`metadata`）；`policy` 固定 `{allowImplicitInvocation: true}`；`source === "plugin"` 时通过向上最多 **5 层**（含起点共 6 层）依次查找 `.knorvia-plugin/plugin.json`、`.claude-plugin/plugin.json`、`.codex-plugin/plugin.json`、`.cursor-plugin/plugin.json` 的 `name`（非空字符串）得到 `pluginName` 与 `qualifiedName: "<pluginName>:<skillName>"`，`pluginId` 只在根带 `pluginId` 时给出；结果按 `resolvedRoot` 缓存 Promise。
- 发现：`discoverSkills` 先 `checkCancellation`（`Skill operation cancelled`）；根按 `priority` 升序稳定排序；扫描时 `followSymbolicLinks = root.source !== "plugin"`；扫描抛错且不是 `ENOENT` → `skill_scan_failed`（warning）；每个文件 `parse` → `resolve(path)` 与 `realpath` 后**逐级查 `disabled`**（命中即跳过、不计入 `totalDiscovered`）；**按 `metadata.path` 去重**（同一路径保留先解析的那份）；最后按 `name.localeCompare` 升序返回 `{skills, diagnostics, totalDiscovered}`。
- 加载：`loadSkill` 先发现全集，按 `name` **或 `qualifiedName`** 精确匹配，找不到抛逐字 `Skill not found: <request.name>`；`maxBytes` 缺省 **100000**；`truncated = size > maxBytes`，截断时读前 `maxBytes` 字节；返回 `{metadata, content: bodyOf(<utf8 文本>).trim(), baseDirectory: metadata.directory, bytesRead, sizeBytes, truncated}`。
- 错误语义：读文件 `ENOENT` 静默跳过，其它错误 → `skill_read_failed`（warning）；取消抛 `Skill operation cancelled`。
- 时序与并发：异步串行；`disabled` 与 `pluginNames` 是实例状态。
- 幂等：同一文件系统状态同一结果；`pluginNames` 命中缓存后不再读盘。
- 资源释放：`loadSkill` 截断分支的句柄在 `finally` 关闭。
- 平台差异：路径用 `resolve`/`join`/`dirname`；`realpath` 解析符号链接后再比对 `disabled`。
- 状态所有者：适配器实例（`disabled`、`pluginNames`）。
- 日志级别：无（诊断以数据返回）。
- 可测断言：`SKILL.md` 带 `name`/`description` → 返回一条且 `safeToAutoLoad === true`、`policy.allowImplicitInvocation === true`；带未知键 `extra: 1` → `safeToAutoLoad === false` 且命令仍出现；无 frontmatter 的 `SKILL.md` → `name` 回退为目录名且 `description` 为 `""`；有 frontmatter 但缺 `description` → `skill_missing_description` 且跳过；`description` 超过 1024 → `skill_description_too_long`；`when_to_use: >` 折叠块 → 段落以空格连接；`disabledPaths:[<文件>]` → 该技能不出现且 `totalDiscovered` 不增；`loadSkill({name:"<名称>"})` 返回去掉 frontmatter 并 trim 的正文；`maxBytes` 小于文件 → `truncated === true`。

### B129 PDF 渲染适配器（`pdf/`）

- 来源：`pdf/index.ts`（`createPopplerPdfDocumentAdapter`、`inspectRenderOutcome`、`collectPages`）
- 输入：`{executionPort, tempRoot?}`；`getPageCount({filePath, trace})`；`renderPages({filePath, firstPage, lastPage, trace})`；都可带 `{signal?}`。
- 输出：`getPageCount` 跑 `pdfinfo <filePath>`（超时用契约常量 `READ_PDF_INFO_TIMEOUT_MS`）；取消（结果 `cancelled` 或 signal 已中止）→ `PdfDocumentPortError("cancelled", "PDF inspection was cancelled.")`；`status !== "completed"` 或 `exitCode !== 0` → **返回 `undefined`**（不抛错）；`stdout` 匹配 `/^Pages:\s+(\d+)\s*$/imu` 且是安全整数 ≥ 0 → 返回该数，否则 `undefined`。
- `renderPages`：先 `checkAvailability`（**每个适配器实例只成功一次**，后续直接跳过）：跑 `pdftoppm -v`（`READ_PDF_AVAILABILITY_TIMEOUT_MS`）；取消 → `cancelled`；超时 → `timeout`（消息 `PDF page extraction availability check timed out after <ms>ms.`）；可接受判据是「`status ∈ {completed, failed}` 且（`exitCode === 0` 或（`exitCode` 存在、不等于 127、且 `stderr` 非空））」；否则 `unavailable`，消息逐字 `pdftoppm is not installed. Install poppler-utils (e.g. \`brew install poppler\` or \`apt-get install poppler-utils\`) to enable PDF page rendering.`。随后 `mkdtemp(join(tempRoot ?? tmpdir(), "knorvia-read-pdf-"))`（失败 → `io_error`，消息 `Unable to create a temporary directory for PDF page extraction.`，signal 已中止时改判 `cancelled`）；跑 `pdftoppm -jpeg -r 100 -f <first> -l <last> <filePath> <dir>/page`（`READ_PDF_RENDER_TIMEOUT_MS`）；`inspectRenderOutcome` 判定：`cancelled`→`cancelled`（消息逐字 `PDF page extraction was cancelled.`）；`timedOut`或`status === "timed_out"`→`timeout`（消息 `PDF page extraction timed out after <ms>ms.`）；`completed`且`exitCode === 0` → 通过；`stderr`含`password`（不区分大小写）→ `password_protected`（消息 `PDF is password-protected. Please provide an unprotected version.`）；`stderr`匹配`/Wrong page range given[\s\S]\*last page \((\d+)\)/i`：计数 0 → `corrupted`（消息 `PDF reports 0 pages (empty page tree). The PDF may be invalid.`）、计数安全整数 ≥ 1 → `page_out_of_range`（消息含 `Requested page <n>`或`Requested pages <a>-<b>`、`PDF has <n> page(s)`、`maximum <READ_PDF_MAX_PAGES_PER_REQUEST> pages per request (e.g. pages: "1-<min(count, max)>")`）；`stderr`没有`Command Line Error|Internal Error`诊断行时，首行以`I/O Error: `开头且包含`'<filePath>'`→`io_error`（消息 `Could not render PDF: <首行>`），首行以 `Permission Error: `开头 →`permission_denied`（同前缀消息）；`stderr`含`damaged|corrupt|invalid`或特定`Syntax Error: Couldn't find trailer dictionary / read xref table`→`corrupted`（消息 `PDF file is corrupted or invalid.`）；其它 → `process_failed`（消息 `pdftoppm failed: <detail>`或`pdftoppm failed.`，`cause`取`result.error?.cause`），`detail`是`stderr`、`stdout`、`error.message`中非空项用`"\n"` 连接并 trim。
- `collectPages`：`readdir` 失败 → `io_error`（消息 `Unable to list rendered PDF page images.`；signal 已中止则 `cancelled`）；只收文件名匹配 `/-(\d+)\.jpg$/i` 且页号安全整数 ≥ 1 的项，按页号升序；一个都没有 → `corrupted`（消息 `pdftoppm produced no output pages. The PDF may be invalid.`）；逐个读成 `Uint8Array`，返回 `{data, mediaType: "image/jpeg", pageNumber}`（读失败 → 消息 `Unable to read rendered PDF page images.`）。
- 临时目录清理：无论成功失败都 `rm(directory, {recursive:true, force:true})`；**只有成功路径**的 `rm` 失败才抛 `io_error`（消息 `Unable to remove temporary PDF page images.`）；失败路径保留原始错误（`rm` 失败被忽略），最终 `throw outcome.cause`。
- 错误语义：全部经 `PdfDocumentPortError(code, message, {cause?})`；`code ∈ {cancelled, timeout, unavailable, password_protected, page_out_of_range, corrupted, io_error, permission_denied, process_failed}`。
- 时序与并发：每个 `renderPages` 一次临时目录、一次命令、一次清理；可用性探测在实例内只成功一次（失败不缓存）。
- 幂等：`renderPages` 可重复调用（每次新临时目录）；`getPageCount` 只读。
- 资源释放：临时目录 `rm` 强删；`executionPort` 的子进程由它自己回收。
- 平台差异：`pdftoppm`/`pdfinfo` 依赖 PATH；`mkdtemp`/`tmpdir()` 跨平台；文件名的 `-<n>.jpg` 解析不区分大小写。
- 状态所有者：适配器实例的 `availabilitySucceeded` 标志。
- 日志级别：无（错误以 `PdfDocumentPortError` 抛出）。
- 可测断言：用假的 `executionPort`（记录调用参数）——`getPageCount` 在 `exitCode !== 0` 时返回 `undefined`、在 `stdout` 为 `Pages:           12` 时返回 12；`renderPages` 在 `pdftoppm -v` 返回 `exitCode:127` 且 `stderr` 为空 → 抛 `unavailable` 且消息逐字为不可用文案；`stderr` 含 `password` → `password_protected`；`stderr` 为 `Wrong page range given: ... last page (3)` → `page_out_of_range` 且消息含 `PDF has 3 pages`；成功时临时目录里写两个 `page-1.jpg`/`page-2.jpg` 假文件，返回两页 `pageNumber` 升序且 `mediaType === "image/jpeg"`、`data` 是 `Uint8Array`；成功后临时目录被删除；临时目录里没有匹配文件 → `corrupted` 且消息逐字；`signal` 已中止 → `cancelled`。

### B130 工作流存储（`workflow/` 的 run 侧）

- 来源：`workflow/index.ts`（`NodeWorkflowStore`、`createNodeWorkflowStore`、`appendJsonLine`、`readJson`、`readJsonLines`、`writeJsonFile`、`writeTextFile`、`normalizeRelativePath`、`sanitizePathSegment`、`throwIfAborted`）
- 输入：`{rootDir?}`（缺省 `<resolveKnorviaDataRoot()>/cli/workflows`，在模块加载时定值）与各方法。
- 输出：目录布局固定：`<rootDir>/index.json`、`<rootDir>/runs/<sanitized 的 runId>/run.json`、`events.jsonl`、`graph.jsonl`、以及产物（`report.md` 等）。`appendEvent`/`appendGraphRecord`/`writeSnapshot` 先 `throwIfAborted`（signal 已中止时抛 `signal.reason`（Error）否则抛给定消息）再用 `@knorvia/contracts` 的 schema `parse` 校验，然后写文件；JSONL 追加是 `mkdir(dirname)` + `appendFile(JSON.stringify(value) + "\n")`；`writeSnapshot` 用 `JSON.stringify(value, null, 2) + "\n"` 原子写（临时名 `${path}.${randomUUID()}.tmp` + `rename`），随后更新索引。`readRun`：文件缺失或非法 JSON **抛错**（只有 `ENOENT` 返回 `null`），存在则 `WorkflowRunSnapshotSchema.parse`。`readEvents`：`ENOENT` → `[]`，否则逐行 parse（空行被过滤）。`listRuns`：读 `index.json`（缺失 → `{runs: []}`，`runs` 不是数组 → 空表），按 `cwd`/`kind` 过滤，按 `updatedAt` **降序**（`localeCompare`）排序，`limit` 给定则截断。`readLatestRun`：等价 `listRuns({...options, limit:1})` 后 `readRun`，无则 `null`。索引项是快照的投影：`{completedAt, createdAt, cwd, kind, runId, status, task, updatedAt}`；`upsertIndex` 把该项放到数组**最前**、去掉同 `runId` 的旧项、再按 `updatedAt` 降序排。`writeArtifact`：`normalizeRelativePath` 拒绝归一化后为绝对、等于 `..`、或以 `..\\`/`../` 开头 → 抛逐字 `Workflow artifact path must stay inside the run directory: <value>`；返回 `{path, relativePath}`；`writeReport` 等价 `writeArtifact(runId, "report.md", content)`。`sanitizePathSegment` 把非 `[a-zA-Z0-9._-]` 换成 `_` 并截断到 120 字符，空串 → 逐字 `unknown`。
- 错误语义：schema 校验失败原样抛 zod 错误；`ENOENT` 在 `readJson`/`readJsonLines` 返回 `null`/`[]`，其它错误冒泡；取消时抛 `signal.reason` 或固定消息。
- 时序与并发：异步串行；写文件先临时文件再 `rename`（无锁，后写者胜）；`appendEvent` 是追加（并发追加按写入顺序）。
- 幂等：`writeSnapshot` 同内容重复写结果相同（索引项被替换而非重复）；`upsertIndex` 对同 `runId` 幂等。
- 资源释放：无长期句柄。
- 平台差异：`join`/`normalize`/`isAbsolute`；`..\\` 与 `../` 两种前缀都被拒绝（Windows 与 POSIX 都覆盖）；`randomUUID` 与平台无关。
- 状态所有者：`rootDir` 下的文件。
- 日志级别：无。
- 可测断言：临时 `rootDir` 下 `writeSnapshot(快照)` → `runs/<sanitized>/run.json` 是 2 空格缩进 + 末尾换行、`index.json` 的 `runs[0].runId` 等于该 run；两次 `writeSnapshot` 不同 `runId` 后 `listRuns()` 按 `updatedAt` 降序且长度为 2；`listRuns({cwd:"/a"})` 只含匹配项；`listRuns({limit:1})` 只返回第一条；`readRun("missing")` → `null`；`readEvents("missing")` → `[]`；`appendEvent(事件)` 后 `readEvents` 返回一条且经过 schema 解析；`appendEvent` 传非法事件 → 抛 zod 错误且不写文件；`writeArtifact(runId, "../evil", "x")` → 抛消息含 `must stay inside the run directory`；`writeReport` 写到 `runs/<id>/report.md`；`runId` 含 `/` 与空格时目录名被 sanitize（`a b/c` → `a_b_c`）。

### B131 工作流定义存储与默认根

- 来源：`workflow/index.ts`（`NodeWorkflowDefinitionStore`、`createNodeWorkflowDefinitionStore`、`getDefaultWorkflowRoot`、`getDefaultWorkflowDefinitionsRoot`、`validateDefinitionId`）
- 输入：`{definitionsDir?}` 或 `{rootDir?}`；`listDefinitions()`、`readDefinition(id)`。
- 输出：`definitionsDir = options.definitionsDir ?? join(options.rootDir ?? DEFAULT_WORKFLOW_ROOT, "definitions")`；`listDefinitions`：`readdir`（`ENOENT` → `[]`，其它错误抛出）→ 只取 `extname === ".json"` 的文件 → `parse(name).name` 作为 id → 按 `localeCompare` 升序 → 逐个 `readDefinition`（返回 `null` 的跳过）；`readDefinition` 先 `validateDefinitionId`（空串、`.`、`..`、含 `/` 或 `\`、`normalize(value) !== value`、不匹配 `/^[a-zA-Z0-9._-]+$/` 任一 → 抛逐字 `Workflow definition id must be a file-safe name: <value>`），读 `<definitionsDir>/<id>.json`（`ENOENT` → `null`），`WorkflowDefinitionSchema.parse` 后若 `definition.definitionId !== definitionId` → 抛逐字 `Workflow definition id mismatch: requested <请求值>, file declares <文件值>`。`getDefaultWorkflowRoot()` 返回 `<resolveKnorviaDataRoot()>/cli/workflows`；`getDefaultWorkflowDefinitionsRoot()` 返回它的 `definitions` 子目录。
- 错误语义：见上；取消经 `throwIfAborted`（各方法开头的固定消息，如 `Workflow definition list cancelled`）。
- 时序与并发：异步串行读；无缓存（每次重读）。
- 幂等：只读。
- 资源释放：无。
- 平台差异：`extname`/`parse` 与平台无关；`normalize(value) !== value` 会拒绝 Windows 反斜杠写法。
- 状态所有者：`definitionsDir` 下的 `*.json`。
- 日志级别：无。
- 可测断言：临时目录写 `alpha.json`（合法定义）、`beta.txt`、`gamma.json`（非法 schema）→ `listDefinitions()` 返回 `alpha`（`beta.txt` 不进、`gamma` 因解析失败抛出——用合法/非法两组断言）；`readDefinition("missing")` → `null`；`readDefinition("../x")` → 抛 `must be a file-safe name`；文件里 `definitionId` 与请求不一致 → 抛消息含 `definition id mismatch`；`getDefaultWorkflowRoot()` 以 `cli/workflows` 结尾（用 `join` 拼接断言）；`getDefaultWorkflowDefinitionsRoot()` 等于 `join(getDefaultWorkflowRoot(), "definitions")`。

### B132 `provider/index.ts` 的空导出面

- 来源：`provider/index.ts`
- 输入：无。
- 输出：文件体逐字只有注释与 `export {};`，**零导出声明、零 re-export**（`interface.md` 记为 0 个声明 + 1 条 re-export 的形态，实际是空模块）。
- 错误语义：导入成功，不抛错。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`Object.keys(await import("…/provider/index.js"))` 深度等于 `[]`；把它从根 barrel 的 `export *` 中移除不会改变任何导出名（根 barrel 的导出集合等于 18 个模块的并集）。

### B133 `adapters/src/index.ts` 的根 barrel

- 来源：`index.ts`
- 输入：无。
- 输出：`export *` 逐字 re-export 18 个子目录入口，顺序为 `storage`、`fs`、`context`、`exec`、`http`、`image`、`pdf`、`provider`、`model`、`logging`、`config`、`skills`、`commands`、`plugins`、`auth`、`browser`、`mcp`、`workflow`；**不 re-export `mailbox`**（信箱只能通过包导出子路径 `./mailbox` 或模块路径访问）；本包 55 个继承文件里属于这条 barrel 链的是 `index.ts`、`storage/*`（部分）、`fs/index.ts`、`context/index.ts`、`image/index.ts`、`pdf/index.ts`、`provider/index.ts`、`logging/index.ts`、`config/index.ts`、`skills/index.ts`、`commands/index.ts`、`workflow/index.ts`，其余子目录不在本包。
- 错误语义：任一条 re-export 解析失败即整条 barrel 不可用（循环或缺失导出都会在加载期暴露）。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`import * as root from "…/index.js"` 成功；`root.createNodeFileSystemAdapter`、`root.createNodeContextSourceAdapter`、`root.createJimpImageProcessorAdapter`、`root.createPopplerPdfDocumentAdapter`、`root.createNodeLoggerFactory`、`root.createConfigPort`、`root.createNodeSkillAdapter`、`root.createNodeCustomCommandAdapter`、`root.createNodeWorkflowStore` 都是函数；`root.createNodeSessionMailboxAdapter === undefined`（信箱不在根 barrel）；`root.NodeFileSystemAdapter` 与 `fs/index.ts` 的是同一个类。

### B134 会话存储 barrel（`storage/session-store.ts`）的兼容面

- 来源：`storage/session-store.ts`
- 输入：无。
- 输出：逐字 re-export `createSqliteSessionStore`、`getDefaultSessionDbPath`、`openStartupSqliteSessionStore`、`SqliteSessionStore`（来自 `session-store/sqlite-session-store.js`）、`createDwfJournalStore`（repositories）、`SqliteSessionMigrationError`（errors），以及类型 `DwfArtifactItem`、`DwfArtifactItemsQuery`、`DwfListRunsQuery`、`DwfNodeStatusCounts`、`DwfRunIntrospectionQueries`、`DwfRunDetailRow`、`DwfRunListItem`、`DwfRunSessionListItem`、`DwfRunSessionRow`、`DwfRunTimestamps`、`DwfWorldNodeRow`、`SqliteSessionMigrationErrorKind`、`SqliteSessionMigrationErrorOptions`、`SessionStoreDebugCounts`、`SqliteSessionStoreOptions`、`AsyncSqliteMigrationOptions`、`SqliteMigrationProgress`。它**不导出迁移账本**（`SQLITE_MIGRATIONS` 只从 `storage/session-store/migrations.ts` 取），也不导出 `options.ts`/`rows.ts` 的类型（分别从各自模块取，见 B14、B15）。
- 错误语义：模块解析失败即入口不可用；下游 `sqlite-session-store.js` 属于**非本包**文件（`independent-replacement`），本 barrel 只保证导出名与来源路径不变。
- 时序与并发：加载时完成。
- 幂等：无。
- 资源释放：无。
- 平台差异：无。
- 状态所有者：无。
- 日志级别：无。
- 可测断言：`Object.keys(await import("…/storage/session-store.js")).sort()` 深度等于源码里 6 条 value re-export 的名字（`SqliteSessionMigrationError`、`SqliteSessionStore`、`createDwfJournalStore`、`createSqliteSessionStore`、`getDefaultSessionDbPath`、`openStartupSqliteSessionStore`）；`typeof mod.SqliteSessionStore === "function"`、`typeof mod.createSqliteSessionStore === "function"`、`typeof mod.openStartupSqliteSessionStore === "function"`、`typeof mod.getDefaultSessionDbPath === "function"`；`mod.SQLITE_MIGRATIONS === undefined`（账本不在这个 barrel 上）。
