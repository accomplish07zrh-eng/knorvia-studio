<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 脚本工作流存储与同步借用事务

2026-09-28，基线 947b126。独立替换脚本工作流的定义、运行、活动、事件、任务链接与五种记录投影，保留 12 个公开 Promise 入口、数据格式、schema 和现有功能。

## 本批确定的规则

原生新内存库探针确认两项普通输入并发问题：运行的阶段与用量同时更新会丢阶段；活动的子会话关联与结果同时更新会丢关联。旧版还允许写入成功但回读损坏时报告失败、写入却保留。以下修复属于本批明确行为调整，后文标注 baseline 的部分仅描述旧行为；不得把这些差异计入等价通过。

七个写入口统一复用已有 withWriteTransaction 的 borrow 策略。无外层事务时自有同步事务覆盖初读、序号分配、修改、写入和完整回读，确认投影成功才提交。已有外层事务则借用，绝不替调用者提交或清理。事务体无 await，不调用无等待 Promise 写入依赖，不增加锁队列、第二状态所有者、schema 或重试框架。原生自动回滚保留首因，清理双失败由既有 helper 保留 cause 和 errors。

创建、upsert、事件和链接写入先取一次时钟，再取得事务；两个更新在事务内读到完整当前值、通过缺失检查后才取一次时钟。不同字段的同轮更新必须组合，同字段绝对值仍以后次为准。现有 caller 的 addRunStats 先读再计算绝对累计值是另一问题，本批不声称解决它。上下文/动态工作流 journal、执行器、模型、UI、真实用户库和根许可保持当前范围。

```text
公开 Promise 调用 → SQLite 唯一持久状态
  ├ 无外层事务 → BEGIN IMMEDIATE → 同步读取/分配/修改/回读 → COMMIT → resolve
  │                                            └错误 → 条件 ROLLBACK → reject
  └ 已有外层事务 → 同步操作/回读 → 将结果或错误交还调用者 → 外层决定提交/回滚
执行器的下一步、事件发布和累计统计仍由原 caller 负责
```

## 独立实现与验收边界

复核补充：attempt/sequence 的最大值递增使用 SQLite 原生数值运算语义。现有非 STRICT INTEGER 列能保留 TEXT；例如已存 `not-numeric` 时下一分配值为数值 1，不能变成 JS 字符串拼接的 `not-numeric1`。负数、小数、NULL 集合和原生范围错误保持同一分配边界；不新增数据清洗、schema 或 JS 数值强制转换。有限原生对照发现该偏差后先补失败测试，再修正独立实现。

复核者读取旧源码抽取合同，隔离作者只接收这份行为规则、公共声明和依赖签名，不读取旧目标、Git 历史、dist/maps、冻结基线、先行测试或其他实现正文。先在旧版完成红先行验收，再授权实现。文件少于 400 行；映射、通用 SQL、改名、拆分和行数变化都不能单独证明原创。按确切输入/输出/修改轨迹逐文件复核，不声称全流程 clean-room 或全项目 MIT。

根代理负责先行兼容/修复矩阵、所有写入口的借用与回读失败、原生自动回滚与延迟提交失败、主因/清理双错误、有限源码/编译对照与公开产物测试；然后执行根与 CLI 类型/lint、架构、构建、完整离线、格式、来源和暂存密钥检查。只把实测范围写为通过；多进程压力、真实用户数据、磁盘故障另列未验证。

以下完整行为合同中“proposed / baseline / currently”保留旧版观察背景；Root-designated improvements 是本批确定的修复规范，发生冲突时以该节及上文为准。

## Public declarations and exports

`contracts/src/workflow/script.ts` is the public declaration source. Keep the existing names and Promise return types. Repository functions receive `DatabaseSync` first, then the same public argument. No new public interface is needed for a compatibility replacement.

| Export                           | Argument after db                                                                                       | Result                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| upsertScriptWorkflowDefinition   | UpsertScriptWorkflowDefinitionInput                                                                     | Promise of ScriptWorkflowDefinitionRecord       |
| createScriptWorkflowRun          | CreateScriptWorkflowRunInput                                                                            | Promise of ScriptWorkflowRunRecord              |
| updateScriptWorkflowRun          | UpdateScriptWorkflowRunInput                                                                            | Promise of ScriptWorkflowRunRecord              |
| getScriptWorkflowRun             | runId: string                                                                                           | Promise of ScriptWorkflowRunRecord or null      |
| listScriptWorkflowRuns           | optional object: cwd?: string; limit?: number; statuses?: readonly ScriptWorkflowRunStatus[]            | Promise of ScriptWorkflowRunRecord[]            |
| createScriptWorkflowActivity     | CreateScriptWorkflowActivityInput                                                                       | Promise of ScriptWorkflowActivityRecord         |
| updateScriptWorkflowActivity     | UpdateScriptWorkflowActivityInput                                                                       | Promise of ScriptWorkflowActivityRecord         |
| findCachedScriptWorkflowActivity | object: callPath: string; inputHash: string; runId: string                                              | Promise of ScriptWorkflowActivityRecord or null |
| listScriptWorkflowActivities     | object: runId: string                                                                                   | Promise of ScriptWorkflowActivityRecord[]       |
| appendScriptWorkflowEvent        | object: id: string; runId: string; type: string; activityId?: string; phase?: string; payload?: unknown | Promise of ScriptWorkflowEventRecord            |
| listScriptWorkflowEvents         | object: runId: string; limit?: number                                                                   | Promise of ScriptWorkflowEventRecord[]          |
| createSessionTaskLink            | CreateSessionTaskLinkInput                                                                              | Promise of SessionTaskLinkRecord                |

Pure codec exports also remain part of the module boundary: `decodeDefinition(WorkflowDefinitionRow)`, `decodeRun(WorkflowRunRow)`, `decodeActivity(WorkflowActivityRow)`, `decodeEvent(WorkflowEventRow)`, `decodeTaskLink(SessionTaskLinkRow)`, returning their corresponding records synchronously. The five row interfaces are exported structural types. Their current direct consumers are the two repository modules; there is no public database-row cache to migrate.

Input declaration summary (full declarations may be provided verbatim as approved public types):

- Definition: required id/name/source/scriptHash/meta; optional scope/trusted/enabled/scriptPath. Source is builtin or user; scopes are builtin, explicit, project, user.
- Create run: required id/name/cwd/scriptHash; optional definitionId, parentSessionId, scriptPath, args, argsHash, status, budgetTotal, stats.
- Update run: required id; optional status, budgetSpent, stats, failure; currentPhase, startedAt and completedAt additionally admit explicit null.
- Create activity: required id/runId/callIndex/callPath/type/inputHash; optional parentActivityId/phase/label/prompt/opts/status.
- Update activity: required id; optional status/result/error; childSessionId, startedAt, completedAt additionally admit explicit null.
- Task link: required id/childSessionId/role/path/status; optional rootWorkflowRunId/parentLinkId/activityId/parentSessionId/depth/phase/label/agentType/model.
- Run statuses: pending, running, paused, completed, failed, cancelled. Activity statuses: queued, running, completed, failed, skipped, cancelled, cached, lost. Activity type declaration: agent, workflow, log, phase. Task-link role/status are unconstrained strings in this port.
- `WorkflowScriptMetaSchema`, `WorkflowAgentOptionsSchema` and stats schema exist in the contracts package, but these repository functions do not invoke them. Do not silently add parser validation or strip unknown JSON keys. Boundary callers parse script metadata/options separately.

## Physical storage constraints, without SQL templates

Migration `0007_workflow_script_runtime`, followed by `0008_workflow_definition_scope`, supplies the schema. Keep the current tables and indexes; do not conflate the legacy tables with dynamic workflow journals.

| Table               | Required columns                                                                                                                                   | Nullable columns                                                                                                                                         | Relevant constraints/index behavior                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workflow_definition | id; name; source; trusted integer default 0; enabled integer default 1; script_hash; meta_json; time_created; time_updated; scope default explicit | script_path                                                                                                                                              | id primary key; source builtin/user CHECK; trusted/enabled 0/1 CHECK; scope four-value CHECK; source/enabled index                                                                                                                                    |
| workflow_run        | id; name; kind default script; cwd; script_hash; status; budget_spent integer default 0; time_created; time_updated                                | definition_id; parent_session_id; script_path; args_json; args_hash; current_phase; budget_total; stats_json; failure_json; time_started; time_completed | id primary key; status six-value CHECK; parent_session_id FK to session, delete SET NULL; definition_id has an index but **no FK**; cwd/status/update-time and parent-session indexes                                                                 |
| workflow_activity   | id; run_id; call_index; call_path; attempt integer default 1; type; input_hash; status; time_created; time_updated                                 | parent_activity_id; phase; label; prompt; opts_json; child_session_id; result_json; error_json; time_started; time_completed                             | id primary key; run FK delete CASCADE; child session FK delete SET NULL; UNIQUE(run_id, call_path, attempt); status eight-value CHECK; parent_activity_id is **not** an FK; type has no native CHECK; run/status/call-index and child-session indexes |
| workflow_event      | id; run_id; sequence; type; time_created                                                                                                           | phase; activity_id; payload_json                                                                                                                         | id primary key; UNIQUE(run_id, sequence); run FK delete CASCADE; activity FK delete SET NULL; run/sequence index                                                                                                                                      |
| session_task_link   | id; child_session_id; role; depth integer default 0; path; status; time_created; time_updated                                                      | root_workflow_run_id; parent_link_id; activity_id; parent_session_id; phase; label; agent_type; model                                                    | id primary key; UNIQUE(child_session_id); root legacy-run FK and parent-link FK delete CASCADE; activity/parent-session FK delete SET NULL; child session FK delete CASCADE; root/depth/path, parent-link and activity indexes                        |

Times, sequences, budgets, call indexes, attempts and depth are passed through as native numeric values; this layer does not clamp, round, impose positivity or validate declared integer fields. Ordinary zero/negative values must not accidentally become missing. Native SQLite affinity/CHECK/FK/binding failures remain observable. Scope/cwd/path strings are not normalized, case-folded or resolved here.

These methods do not delete rows or touch session activity time. Foreign-key delete effects belong to the existing schema, not newly invented repository cleanup. Referencing an activity from an event or task link requires native FK existence, but the storage API adds no validation that it belongs to the supplied run or parent session.

## Document and row projection contract

All decoded records are fresh ordinary objects. Optional fields are present as own keys with value undefined when their SQL value is nullish; they are not conditionally omitted. JSON serialization of returned records drops those undefined fields by ordinary JS rules, which is distinct from `Object.keys`/own-property behavior.

Unknown physical columns are omitted. Unknown members inside stored JSON are retained by native JSON parsing, including nested values, arrays, primitives and own prototype-named keys. No schema validation, cloning beyond parsing, flattening or fallback object synthesis occurs.

- Required definition metadata uses native JSON parsing directly; malformed/empty JSON throws. Stored literal `null` decodes as null despite the declared metadata type. Writing this field uses native stringify directly, unlike the nullable JSON helper.
- Other JSON fields use the existing `decodeJson` contract: a falsy raw value, including SQL NULL or a legacy empty string, becomes undefined; otherwise native JSON parsing applies. Text `null` becomes null, false/0/arrays retain their values, malformed JSON throws.
- Nullable JSON encoding uses existing `encodeJson`: top-level undefined/null maps to SQL NULL; other inputs use native JSON stringify. Cycles/BigInt throw. Function/Symbol roots preserve the native undefined result and may fail native binding; there is no new coercion to `{}`. Definition meta null is the text `null`, not SQL NULL.
- Ordinary field insertion order and JSON member order must remain compatible. Reserializing parsed JSON may normalize whitespace, duplicate object members and native integer-like key ordering; preserve which fields are reserialized versus left untouched.
- Pure codec booleans use exact native numeric 1 as true; other row values are false. Nullable scalar projection is nullish-to-undefined, so empty string and zero survive. Status/kind/scope/type are passed through, with no reader fallback for a synthetic legacy value.

Record own-key order is part of the baseline comparison:

| Record     | Ordered own keys                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definition | enabled, id, meta, name, scope, scriptHash, scriptPath, source, timeCreated, timeUpdated, trusted                                                                                                        |
| Run        | args, argsHash, budgetSpent, budgetTotal, completedAt, createdAt, currentPhase, cwd, definitionId, failure, id, kind, name, parentSessionId, scriptHash, scriptPath, startedAt, stats, status, updatedAt |
| Activity   | attempt, callIndex, callPath, childSessionId, completedAt, createdAt, error, id, inputHash, label, opts, parentActivityId, phase, prompt, result, runId, startedAt, status, type, updatedAt              |
| Event      | activityId, createdAt, id, payload, phase, runId, sequence, type                                                                                                                                         |
| Task link  | activityId, agentType, childSessionId, createdAt, depth, id, label, model, parentLinkId, parentSessionId, path, phase, role, rootWorkflowRunId, status, updatedAt                                        |

Multiple malformed JSON fields fail in established projection order: run args, then failure, then stats; activity error, then opts, then result; definition meta; event payload. A full list decodes every selected row and rejects on a bad selected neighbor. A limit that excludes the malformed row can avoid that failure. Cache decodes only its single selected row; do not broaden it to decode discarded candidates.

## Definition and run behavior

### Definition upsert

Capture one Date.now before statement preparation. New definition defaults scope to builtin only when source is exactly builtin, otherwise explicit; a provided non-nullish scope wins independently of source. trusted is true only for exact input true. enabled is false only for exact input false. Absent/nullish scriptPath becomes SQL NULL. Meta is encoded after statement preparation and before native write.

Conflict identity is definition id. Rewrite name/source/scope/trusted/enabled/scriptPath/scriptHash/meta and updated time from this call; retain original id and creation time. Omitted optional booleans/path do not retain old values: they are reset to their defaults. This is not a partial patch. Read back the stored row and decode it; do not fabricate the return from input.

### Run create

Capture one time before preparing the insert. Store the supplied id/name/cwd/scriptHash, hard-code kind=script, default status by nullish selection to pending. Optional definition/parent/path/argsHash/budgetTotal become SQL NULL when nullish. budgetSpent starts at 0. currentPhase/failure/started/completed start SQL NULL. args and stats are encoded with the nullable helper, in that order. Creation and update times share the captured clock.

No upsert or idempotent duplicate behavior: duplicate id rejects with native uniqueness error. Missing definition id is accepted because there is no FK; a missing parent session rejects natively. Read back and decode the actual row.

### Run update

Baseline first reads the complete current run and awaits that Promise, then captures one time and writes. Missing row throws exactly `Workflow run not found: <id>` before any clock/write. Malformed current args/failure/stats can reject before the update even when that field was not being patched. The asynchronous read/write gap causes the separately reproduced disjoint-field lost-update defect; the root-designated improvement below intentionally changes this timing and ownership.

Input selection rules:

- status and budgetSpent use nullish selection over current values; zero is a supplied budget.
- currentPhase/startedAt/completedAt preserve current when the input is undefined, but explicit null clears to SQL NULL. Empty string/zero are supplied values.
- stats/failure preserve current decoded values only when input is undefined; otherwise encode supplied values, including null→SQL NULL. These are complete replacement values, not a recursive merge or additive statistics update.
- Even omitted stats/failure are decoded and re-encoded during any successful update. Preserve normalization and malformed-field error scope. args is decoded for reading but its stored bytes are not changed by this update.
- Always set updated time, even for an id-only update. Do not update creation time, identity, args/hash, definition/name/cwd/script metadata, budgetTotal or parent session.
- No expected-version/CAS, terminal guard, lease check, status transition validation beyond native CHECK or implicit clearing of failure/completed timestamps. A caller may set running while an old completedAt/failure remains unless it explicitly clears them.

Read back and return the stored row after the write. If a row disappears between initial read and write, update affects zero rows and the after-write read throws the separate error below; do not silently return the stale initial record.

### Run queries

Global id lookup returns null if absent. No session/cwd scope is inferred. List defaults its argument to an empty object; truthy cwd adds exact equality, empty cwd means no filter. A nonempty statuses array adds exact membership; absent/empty array means all statuses. Duplicate status arguments do not duplicate result rows. Apply filters jointly.

Order is updated time descending, then id descending. Positive truthy limit is bound as supplied; zero, negative, NaN and absent limits mean unlimited. No clamp or rounding is performed; e.g. positive 1.5 yields SQLite datatype mismatch. An empty result is an empty array. All queries are clock-free and read-only.

## Activity, event and task-link behavior

### Activity create

Capture one time before reading attempts. New attempt is 1 greater than the current maximum attempt for exact runId+callPath, starting at 1. All statuses and input hashes participate in this maximum; a different run or path has its own count. There is no attempt parameter override. This is a stored-maximum allocation, not a counter that survives deletion of all/highest rows.

Store supplied id/run/callIndex/path/type/inputHash and nullable parentActivityId/phase/label/prompt/opts. Status defaults by nullish selection to queued. Child session, result, error, started/completed time begin SQL NULL; created/updated share the captured time. opts encoding follows attempt lookup and insert preparation. Read back the actual row.

Duplicate id and duplicate native attempt tuple reject; there is no cache shortcut, insert retry or idempotency key at create. No normalizer turns the type string into a schema-valid enum. Current maximum read and insert are separate unowned statements; inter-process contention needs separate evidence before a repair is claimed.

### Activity update

Baseline reads/decodes the full row and awaits before taking its one clock. Missing throws `Workflow activity not found: <id>` before clock/write. Malformed error/opts/result in the existing row rejects before any replacement. The read/write gap has the separately confirmed disjoint-field lost update.

- status preserves current when nullish.
- childSessionId/startedAt/completedAt preserve current only for undefined; null clears.
- result/error preserve current only for undefined, otherwise are complete replacement JSON values; null clears to SQL NULL. Omitted result/error are still decoded/re-encoded, so normalization is observable.
- Always updates time_updated; leaves run/path/index/attempt/type/phase/label/inputHash/prompt/opts/parentActivityId/creation time unchanged.
- No allowed-transition graph, terminal guard, lease, CAS, automatic field clearing or stats update. Native child-session FK still applies.

Read back after write; do not return an input-derived approximation. List activities for exact runId ordered by call_index ascending, then id ascending, across all paths/attempts/statuses. A missing run simply has an empty list.

### Cache lookup

Match exact runId+callPath+inputHash and only statuses completed or cached. Choose highest attempt, limit one; no secondary sort is promised. Return decoded row or null. It does not validate script hash, current run status, opts shape, result truthiness or presence. Completed result false/0/null/undefined remains a cache row; `ScriptWorkflowRuntime` separately uses truthiness to decide whether to reuse it.

### Event append/list

Append captures time, then finds 1 greater than current maximum sequence for that run, starting at 1; then prepares/writes the event and reads it back by runId+sequence. Input id is still an independent primary key; duplicate id is a native error rather than returning an old event. Payload uses nullable JSON helper after insert preparation. phase/activityId use nullish SQL NULL selection. No event publication or runtime callback occurs inside this writer.

Maximum lookup and insert are separate unowned statements. Current unique(run,sequence) prevents duplicate persisted sequence but is not proof of cross-process admission or retry; no row/lease/counter is reserved by the read. Deleting the highest row allows its sequence to be reused on a later append; no no-gap or ever-increasing-after-deletion guarantee exists here.

List is scoped to exact runId. Unlimited reads are sequence ascending. A positive limit chooses the newest N by descending sequence first, then returns that tail in ascending sequence, not the earliest N. Limit validity/rounding rules match run listing. A selected malformed payload rejects the entire list. Queries do not allocate sequence or read the clock.

### Task-link create/conflict

Capture one time before prepare. Insert supplied identity/child/role/path/status plus nullable optional linkage and presentation fields. Depth defaults only when nullish to 0; created and updated time share the captured value. Native FK scope remains legacy workflow_run; a dynamic run id from dwf_run must not be written to rootWorkflowRunId.

Conflict target is unique childSessionId. On that conflict, update **only status and updated time**. Keep original id, all identity/linkage fields, path/role/depth/label/model/phase/agent type and creation time, even when a new call supplies different values. Return lookup by childSessionId, so returned id can differ from the new requested id. There is no public task-link reader/list/update export in this cluster.

An id collision belonging to a different child is a native primary-key error. Do not convert this into child rebinding or broaden the conflict update. Native FK delete actions are the only cascades owned by the schema. No caller business lease is acquired or extended by this operation.

## Timing, transactions and errors

Every repository IO export is async/Promise-shaped. Except the two updates' read-before-write await, native work is performed synchronously before completion is returned; private after-write helpers may add Promise completion stages, but their row query/decoding happens immediately when invoked. Do not introduce unawaited async writes, detached errors or a second persistent state owner.

There is currently no BEGIN/COMMIT/ROLLBACK in any target. Each write statement owns native standalone atomicity when no caller transaction exists; related reads are not in an owned atomic unit. When a caller already owns a transaction, all methods participate in it and never close it. This was checked across definition, run/activity create/update, event and task-link writers; a failed duplicate statement did not roll back the surrounding transaction.

Do not import an own-only transaction policy from the previous session-input batch. Root designated the seven-writer synchronous borrowed-or-owned improvement below; it retains existing outer ownership while intentionally changing standalone atomicity and readback failure behavior. The existing `withWriteTransaction(db, 'borrow', synchronousBody)` is the reused ownership primitive. It returns void, so any result snapshot remains local to that operation. No new queue, cache, mutex, migration or retry policy is introduced.

Meaningful failure ordering to preserve or explicitly amend:

| Path              | Baseline native phases                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| definition upsert | clock → prepare insert → encode required meta → write → definition read/decode                                                            |
| run create        | clock → prepare insert → encode args, then stats → write → complete run read/decode                                                       |
| run update        | complete current read/decode → await → missing guard → clock → prepare update → encode stats, then failure → write → complete read/decode |
| activity create   | clock → prepare/read next attempt → prepare insert → encode opts → write → complete read/decode                                           |
| activity update   | complete current read/decode → await → missing guard → clock → prepare update → encode result, then error → write → complete read/decode  |
| event append      | clock → prepare/read next sequence → prepare insert → encode payload → write → lookup by run+sequence/decode                              |
| task-link create  | clock → prepare insert → write → lookup by child/decode                                                                                   |

Native SQLite preparation/binding/FK/CHECK/UNIQUE/BUSY errors, JSON parse/stringify errors and clock errors propagate in the baseline. No wrapping, logging, cleanup, swallowing or retry occurs in the old targets. Because they have no owned multi-statement transaction, an after-write read or decode failure can reject after the write has persisted. A synthetic AFTER INSERT trigger that corrupts run args JSON confirmed this outcome. Root deliberately selected atomic readback below; its old-first gate must distinguish persisted residue from the new owned rollback.

Exact custom absence messages are observable compatibility strings, not original-expression evidence:

- `Workflow run not found: <id>`
- `Workflow activity not found: <id>`
- `Workflow definition not found after write: <id>`
- `Workflow run not found after write: <id>`
- `Workflow activity not found after write: <id>`
- `Workflow event not found after write: <runId>:<sequence>`
- `Session task link not found after write: <childSessionId>`

The facade currently delegates these methods directly. It adds no per-call store fault-injection guard, ownership token or lease validation. The separate existing `throwBeforeWrite` method is a storage fault-injection hook, not an authorization check; do not label this absence a demonstrated permission bypass.

## Callers and preserved boundaries

| Caller                                                  | Relevant behavior                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bootstrap/script-workflow-prepare.ts                    | Upserts definition first, uses document hash/path to form its identity, then either retrieves the exact resume run or creates a new run with initial stats. Resume does not rewrite existing run script hash/args here. Parent session is supplied by caller. |
| bootstrap/script-workflow-runtime.ts list/status/resume | Lists current cwd with an explicit small limit; absent run is a normal display outcome; resume requires an existing script path; retrieves all activities for display.                                                                                        |
| same runtime run/handleChildEvent                       | Runtime writes running/completed/failed and phase changes, and separately appends events. State and event are not a storage-owned combined transaction. Do not infer atomic event publication from one completed writer.                                      |
| same runtime runAgent/runLiveAgent                      | Cache uses run/path/hash; callIndex and callPath are runtime-owned. Child session is persisted before activity FK linkage. Completion stores result, then task link, then aggregates run stats, then appends event. Failure is decided/serialized by caller.  |
| same runtime addRunStats                                | It performs its own get→compute absolute totals→update. Preventing storage from overwriting omitted fields cannot make caller-computed absolute totals additive or solve this separate concurrent aggregation owner. No delta/CAS port currently exists.      |
| bootstrap/script-workflow-tool-port.ts                  | Reads run by id for background task snapshot/resume; status and time fields have user-visible effects. No extra storage scope predicate is inserted here.                                                                                                     |
| bootstrap/dynamic-workflow-run-launch.ts                | Persists a child actor session before createSessionTaskLink. Uses role workflow_actor and path `dwf/<runId>/<siteId>@<ordinal>`; deliberately omits rootWorkflowRunId because its FK targets legacy runs, not dwf_run. Preserve this use.                     |
| bootstrap/dynamic-workflow-run-journal.ts               | Detects the narrow task-link capability structurally; dynamic journal is a separate port. Do not redirect this legacy cluster to the new journal based on similar naming.                                                                                     |

No live script, child process, model, device or real user database was invoked to establish these caller observations; they are read from source.

## Confirmed defects and unresolved questions

Two native ordinary-input counterexamples were executed through the public source `SqliteSessionStore`, with independent fresh memory databases:

1. Admit run with budgetSpent=0 and no phase. In the same JS turn invoke update(currentPhase='phase-A') and update(budgetSpent=7), then await both. Both fulfill; first return contains phase-A/0, second and final contain no phase/7. The second update overwrites an omitted field from its stale snapshot.
2. Create queued activity, then invoke update(childSessionId=existing child) alongside update(result={value:7}). Both fulfill; final result is stored but child linkage becomes undefined/SQL NULL. Both inputs conform to the public types; no accessor/proxy or fake database was used.

These are demonstrated repository API failures, not an observed real-user incident. The designated repair below requires disjoint patches to compose, preserves outer borrowing, retains same-field last-writer semantics and adds error/commit coverage. Root must still put these choices in the official repository spec and run old-first regressions before implementation. A process-local queue is not a cross-process atomicity guarantee.

Other boundaries:

- Separate maximum-read/insert for attempt and event sequence is a plausible multi-connection collision window. Unique constraints prevent duplicate stored values but no retry is implemented. This probe did **not** reproduce a cross-process race; do not claim that defect fixed or verified.
- Caller `addRunStats` absolute-value aggregation can race independently of the two repository patches. It is outside this three-file replacement unless explicitly authorized with its own port/owner design.
- Standalone write followed by malformed readback can reject after persistence; verified with a synthetic trigger. Root designated this change explicitly below; it is not swept into an allegedly equivalent codec rewrite.
- No leases/CAS/terminal-state guards or strict transition machine currently exist in these APIs. Adding them is a business/protocol decision, not a required repair inferred from a generic storage pattern.

## Root-designated improvements for the next implementation

After the observations above, root chose this bounded next-batch design. This is a designated target, **not implemented or validated work** at preparation time. It supersedes baseline ownership descriptions only where explicitly listed:

1. All seven mutating APIs—definition upsert, run create/update, activity create/update, event append, task-link create—reuse `withWriteTransaction` with **borrow** policy and a synchronous body. Reads, sequence/attempt allocation, patch projection, native write and complete return-row readback/decoding have no await between them.
2. Without an existing caller transaction, the reused owner acquires the existing immediate SQLite write transaction before database read/allocation. It includes return projection/readback before COMMIT. A reported failure rolls back that operation's write, including a successful write whose return row becomes invalid. No fabricated return bypasses native readback errors.
3. If a caller transaction is already active, the same body participates in it and the repository never commits or explicitly rolls back/cleans up the caller's transaction. Body errors propagate to that owner. SQLite itself can still perform an automatic ROLLBACK from a trigger; this is distinct from repository cleanup and cannot be falsely described as an intact caller transaction.
4. Definition/run/activity creations, event append and task-link create each retain one clock capture **before** entering the new owner. Run/activity updates first read/decode their current row **inside** the transaction, throw missing without a clock, then capture one time. The new BEGIN-before-read/prepare ordering is deliberate; no stale pre-owner snapshot is reused for mutation.
5. The new write lock makes disjoint run/activity patches compose and serializes allocation before another writer can change the maxima. Same-field supplied absolute values keep ordinary last-writer behavior. No CAS/version token or lease framework is added. Existing caller transactions retain their own isolation and completion; failed lock acquisition is an error, not an invented retry.
6. Existing shared-owner failure semantics apply: preserve the primary cause after automatic SQLite rollback; owned write/readback/COMMIT failures trigger conditional rollback; rollback failure retains both failures and the first cause. BEGIN failure has acquired no ownership and must never clean up a caller transaction. These are new ownership/error cases to test against old behavior explicitly.
7. All field/null/undefined/JSON/legacy status/cache/link conflict rules above remain. Runtime `addRunStats` absolute-value aggregation, dynamic journal, facade fault-injection coverage, schema, product queues and status-transition policy remain outside the change. Atomic storage patches do not make caller-computed totals additive.

No inspected direct caller required the asynchronous load/write gap or rejection of borrowed writes. The important compatibility dependency is the opposite: existing outer transactions work today. The designated synchronous borrow design preserves that capability. New readback rollback, lock/error priority and fewer intermediate yield windows are intentional and must not be advertised as ordinary equivalence.

## Suggested independent implementation boundary

Migrate the twelve public IO operations plus the five record projections together; their JSON/error/nullable rules are tightly coupled and the whole cluster is bounded (638 original source lines). Keep caller runtime, schema/migrations, dynamic journal and public record declarations unchanged.

An isolated author can independently design operation-specific bindings and an ordered record-projection plan based on the public row contracts, then provide separate run/definition, activity/event/task-link, and pure value modules. Each file must remain below 400 lines. If the designated atomic writers make one module crowded, separate synchronous row mutation from the thin public Promise surface rather than create a generic database framework.

SQLite remains the single state owner. Projection maps must encode required-native-JSON versus nullable-JSON and ordered optional own keys explicitly. Reuse existing JSON helpers and the designated transaction contract; do not copy their implementation or duplicate SQL/JSON pathways. Standard field mappings, SQL idioms, exports, short fixed error strings, splitting and changed line counts are not sufficient originality evidence. Record the restricted author's actual inputs and exact outputs for later per-file review.

## Finite old-first and final acceptance proposal

1. Public/export/type surface and all five decoder key orders/prototypes. SQL NULL/empty legacy JSON/literal null, primitive/array/unknown nested members, malformed JSON order and optional own undefined keys. Cover required definition metadata separately.
2. Definition create/conflict: source-derived default scope, independent supplied scope, exact booleans, omitted-option reset, original creation time retention, required metadata encoding and native constraints.
3. Run create/update: every nullable and undefined branch, zero/empty values, whole stats/failure replacement, id-only update, preserved creation/immutable columns, missing and corrupt current row failure before clock, duplicate/FK/CHECK failures and post-write readback behavior.
4. Run queries: exact cwd, empty filters, status combinations, deterministic time/id ties, positive limit versus zero/negative/NaN, fractional native failure, selected malformed neighbor.
5. Activity attempts/cache/list: run/path scope over all hashes/statuses, duplicate identity, cache completed/cached with false/0/null result, highest eligible attempt, all-activity callIndex/id ordering, update result/error/linkage null handling, immutable columns.
6. Event sequence, id conflict, exact scope and latest-N ascending tail. Native FK/error propagation, bad JSON excluded/included by limits. State/event are separate operations; do not add an implicit transaction between caller commands.
7. Task-link child conflict keeps original id/scope/path/role/presentation while status/time advance; distinct-child id collision; FK coverage; actual dynamic actor-shaped input omits root legacy FK.
8. Every writer inside an outer transaction, with caller rollback and statement failure, proving no premature commit/cleanup. Clock/prepare/encode/readback ordering with bounded deterministic failures; no arbitrary Proxy/getter equivalence promise.
9. Designated repairs: old-first disjoint run/activity updates fail expected composed results; new results preserve both fields. For all seven writers, fail after successful mutation during readback/decoding and verify owned rollback; prove true deferred COMMIT failures, primary automatic-rollback errors and dual cleanup causality. Preserve outer borrowing and no repository cleanup of that owner. Test clock placement and missing-update no-clock. Use deterministic fresh native connections or workers to cover attempt/event allocation if claiming multi-connection serialization; no timing-only sleeps or process-local mutex substitute.
10. Finite source and compiled comparisons against a never-recaptured old bundle. Match raw rows/JSON bytes, return key order/prototypes, clocks and ordinary error fields while excluding approved intentional differences. A few hundred purposeful combinations suffice; no unbounded meta-programming enumeration.
11. Public compiled facade acceptance plus CLI sourcemap bytes for every new target runtime module and reused dependency actually bundled. Keep source-only workspace dependency loader requirements explicit. Root then owns types/lint/architecture/build and full offline regression.

No dedicated native test for this legacy storage cluster was found in the searched tracked test files. Existing workflow display tests exercise another projection contract, not these database APIs. The new probe is preparation evidence only and is not a replacement test suite.
