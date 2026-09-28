<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 会话输入持久账本与同步提升

2026-09-28，基线 1c846fd。按完整行为合同独立替换 session-inputs.ts 的七个仓储入口。SQLite 为唯一持久事实；保留入队、编辑、提升、标记、终态和恢复查询的公开 Promise API、schema、字段、序列与当前客户端能力，不改 UI、真实数据、根许可或预览身份。

## 明确范围与修复

只读原生探针在新内存库确认：批量编辑或最终提升 UPDATE 被 SQLite 自动回滚后，重复 ROLLBACK 会掩盖原始错误；提升事务中的 await 还会让另一会话的入账已经返回成功，却随后被本次失败回滚。先固定这些旧版失败，再接入隔离实现，不把探针确认旧缺陷写成修复通过。

编辑和提升分别复用现有 withWriteTransaction 的 own 政策。提升的消息、片段、共享上下文条目/消息和账本必须在同一次同步原生事务中完成；结束该数据库阶段后才返回 Promise。失败只回滚自己取得的事务，自动回滚保留首因，清理双失败通过既有 AggregateError/cause 保留。事务内部禁止 await、后台任务或无等待调用 Promise 写入函数。

```text
公共调用 → 原准备/时钟边界 → 唯一 SQLite owner
  ├ 入账/单条标记/终态：原单语句，允许参与已有调用者事务
  ├ 非空编辑：自有事务 → 顺序投影/写回 → COMMIT
  └ 提升：自有事务 → 同步消息/片段 → 共享上下文 → 账本 → COMMIT
                                         └全有或全无；不得跨 JS 让出点
返回 Promise → runtime 原成功日志/事件/释放 pin
```

不增加入账必须自有事务的限制：fork bundle 等现有外层 owner 需要借用单语句写入。提升仍不借用调用者事务，空编辑仍立即返回，非空编辑即使匹配不到记录也要求 own。其他尚未替换的 facade 事务不在本批改动范围，不能由本批宣称其异步事务问题也已解决。

完整提升目前允许无账本而写 transcript、终态再提升、重复提升继续分配 promotedSequence，并保留旧 reason；marker 则只处理 admitted。这些是已确认的不同 API 合同，本批保持。是否接收、重试或去重仍由现有 CommandInbox/runtime 负责，不悄悄增加产品状态门槛或跨身份验证。

## 唯一消息依赖路径

现有已独立实现的 message-storage.ts 增加三个同目录内部同步入口：saveMessageSync(db, MessageInfo, copyFrom?) 返回 void；savePartSync(db, MessagePart, copyFrom?) 返回 void；messagesSync(db, {sessionID}) 返回 MessageWithParts[]。现有 saveMessage/savePart/messages 保持 async Promise 签名，仅委派到相应同步体。所有既有序列化、复制、legacy snapshot、排序、损坏 JSON 错误范围、时钟、touch 和借用策略共用同一实现，不能复制到新提升模块。

这三个入口不增加 SessionStorePort 或跨包公共能力；同域提升仓储可以从 message-storage 导入。已有消息行为无改动，扩展边界另以旧消息回归和编译入口验收。主代理实施这份已审源码的有限同步出口调整；隔离作者只获其签名和行为，不读依赖正文。

## 作者边界与验收

主代理/复核者读旧实现抽取合同；隔离作者只允许读取本规格、公共类型和依赖签名，不读旧目标/历史/dist/maps/冻结基线/先行测试/其他仓储正文。先通过旧版红先行 gate 再授权生成新实现，不声称全流程 clean-room，也不以拆分或通用 SQL 单独证明独立表达。

实现文件小于 400 行。验收覆盖先行矩阵、真实触发器/延迟外键、同一事件轮次的并行调用、公开 facade 与编译产物、源码/编译有限对照，运行根/CLI 类型、lint、严格测试类型、架构、构建、完整离线、格式、来源摘要和暂存密钥检查。新内存夹具的受控时序不替代跨进程压力、真实用户或磁盘故障测试。

## Public surface and state owner

All seven functions take the same SQLite connection as their first parameter and return Promises. The SQLite facade delegates after its existing write guard for the five mutating methods; readers have no write guard. The methods remain optional on SessionStorePort for legacy hosts. No new validation layer, schema migration, business queue, retry cache or second accepted-input store belongs in this batch.

| Export                   | Remaining parameters                                          | Result and role                                                                 |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| saveSessionInput         | `{id, sessionID, kind, delivery, payload}`                    | Promise of void; durable admission or same-ID payload correction                |
| updateSessionInputs      | `{sessionID, updates: SessionInputPatch[]}`                   | Promise of void; one batch of edits to admitted records                         |
| promoteSessionInput      | `{id, sessionID, message: MessageInfo, parts: MessagePart[]}` | Promise of void; transcript, shared-context attachment and promoted ledger fact |
| markSessionInputPromoted | `{id, sessionID, promotedMessageID}`                          | Promise of void; marker only after transcript already persisted elsewhere       |
| settleSessionInput       | `{id, sessionID, status, reason?}`                            | Promise of void; admitted to cancelled/discarded/failed                         |
| listSessionInputs        | `{sessionID, status?}`                                        | Promise of SessionInputRecord array; session-scoped admitted-order projection   |
| getSessionInputById      | global `id: string`                                           | Promise of SessionInputRecord or null; global command dedup lookup              |

`SessionInputPatch` carries required `id` and optional `delivery`, `intent: TurnInputIntentMetadata`, `text`, `queuePosition`. The public declaration's `SessionInputDelivery` is startNow/guide/queue; status is admitted/promoted/cancelled/discarded/failed. `payload` is typed as an object containing text plus arbitrary unknown members; stored legacy values are handled more tolerantly as described below.

```text
CommandInbox/runtime admission and reservations
  → SessionStorePort → same SQLite facade connection
    → session_input: the durable fact owner
    → promotion transaction: message + parts + shared-context changes + ledger fact
      → only after commit: runtime logs/promoted event and gateway pin release
```

The adapter owns durable writes, not runtime queue admission or the UI projection. Session-scoped runtime serialization is not a global SQLite connection lock; other sessions and background admissions may use the same facade while a promotion Promise is pending.

## Physical row and projection contract

The final table has these fields; its creation/migration SQL is not part of this draft:

| Fields                     | Storage constraints/meaning                                                  |
| -------------------------- | ---------------------------------------------------------------------------- |
| id                         | TEXT primary key, globally identifies the input; not a composite session key |
| session_id                 | Required session FK, cascading on session deletion                           |
| kind                       | Required TEXT; this adapter imposes no closed command-kind list              |
| delivery                   | Required TEXT, check admits exactly startNow/guide/queue                     |
| payload                    | Required TEXT, no JSON-validity check                                        |
| admitted_sequence          | Required INTEGER; indexed with session, not declared unique                  |
| promoted_sequence          | Nullable INTEGER; no uniqueness constraint                                   |
| promoted_message_id        | Nullable TEXT; not a message foreign key                                     |
| status                     | Required TEXT checked against the five public statuses                       |
| status_reason              | Nullable TEXT                                                                |
| time_created, time_updated | Required INTEGER timestamps                                                  |

There are non-unique indexes for session/admitted_sequence and session/status. The existing three ledger migrations retain old rows while extending delivery/status choices; no migration or backfill is proposed.

Reader result insertion order is: id, sessionID, kind, delivery, payload, admittedSequence, optional promotedSequence, optional promotedMessageID, status, optional statusReason, time. `time` contains created then updated. Nullable optional fields are omitted only for SQL NULL; zero and empty strings remain present. Numeric row values are not clamped or renumbered.

Payload decoding is intentionally tolerant:

- Parse the persisted JSON; malformed JSON yields `{text:""}`. Null, arrays and primitive roots also yield that fallback.
- A non-null, non-array object becomes a fresh ordinary object with default text first, then all decoded own members. An existing text value overrides the default without validation, including null or a non-string legacy value. Unknown fields and an own `__proto__` key survive without changing the returned prototype.
- The read does not repair/write the original database cell. Repeated reads return fresh decoded objects.
- Unrecognized stored delivery projects as queue; unrecognized stored status projects as admitted. Current CHECK constraints make these corrupt/legacy fallback paths unavailable to normal writes, but the projection behavior exists.

## Admission: saveSessionInput

- Capture one wall-clock value before preparing/executing the write. There is no standalone BEGIN, session touch or internal await; effects occur synchronously during invocation, with errors observed as Promise rejection.
- New ID: use the given session/kind/delivery/payload; admittedSequence is one more than the maximum for that session over all statuses, beginning at zero. The allocation and insertion are one database statement, not separate JS read/write operations. Both timestamps use the captured time; status is admitted and other nullable columns are absent/NULL.
- Same global ID: change kind, delivery, payload and updated time only. Preserve original session ownership, admitted sequence, created time, current status/reason and promotion fields. Even a call carrying another sessionID does not move the existing record. This supports pre-admission correction after runtime decides the actual delivery.
- A replay does not consume a visible sequence; the next new ID follows the stored maximum. Tombstones remain in the maximum. There is no sequence compaction.
- Payload uses the existing encodeJson contract; nullish encoded output falls back to the text `{}`. Circular values/BigInt retain native encoding failures; no new payload schema parse is added. Preparing the statement occurs before payload encoding. The timestamp has already been captured if preparation or encoding fails.
- Native FK, delivery CHECK, binding and database errors propagate. A single-statement operation participates in a caller-owned transaction without committing it. `commitForkBundle` depends on this property, so do not make admission require its own transaction.

## Precise object and insertion-order boundaries

Decoded payload roots, canonical conversationInputIntent, its preserved order object, legacy payload.intent and selected entry.data require non-null, non-array objects. Live message.metadata, its inputIntent, individual sharedContextRefs entries and candidate context-message metadata use only the truthy object check and do not add an array exclusion. The refs collection itself must be an Array. These distinctions preserve existing ordinary access; no arbitrary Proxy/getter invocation-count equivalence is promised.

JSON member order follows ordinary own-key semantics. Payload decoding creates text first, then decoded members; replacing an existing key retains its position. Canonical editing begins with existing own members and adds/overwrites text, then order, then delivery and steer in that order when their corresponding rules apply. Preserved order members precede a newly added queuePosition; replacement delivery members are requested, admitted, then a truthy fallbackReasonCode. Replacement steer members are state then reasonCode. Root intent replacement/update occurs after root text and canonical intent handling. Shared entry data preserves current members, then overwrites/adds status and attachedMessageId; context-message metadata similarly preserves members then sets sharedContextStatus. Existing keys are not deleted and reinserted to force them to the end.

## Batch editing: updateSessionInputs

- Empty updates returns before statement preparation, transaction admission or clock access. Through the facade, the facade's existing write guard still runs first.
- Nonempty updates prepares read/write statements before requesting its own immediate transaction. Existing outer transactions are rejected, even if every requested ID is missing; BEGIN failure must not clean up a caller's transaction. No borrow broadening is implied.
- Capture one time after transaction acquisition. Process updates in supplied order. Match by id + sessionID + current admitted status; missing, other-session and terminal records are skipped. Repeated IDs observe the preceding edit in the same batch.
- Decode matched payload using the tolerant reader above. Set root payload.text only when the patch text is not undefined. An otherwise empty matching patch still rewrites the decoded payload and updated time, so it can normalize malformed/primitive stored JSON to the tolerant object shape.
- If the payload already has a conversationInputIntent member and its value is a non-null non-array object, apply the following canonical projection. Never create a missing canonical intent; preserve an existing primitive/null/array unchanged.
  - Preserve its unknown members and their order; set canonical text only when patch text is supplied.
  - If either the patch or its intent supplies queuePosition, preserve object-valued order members and replace/add queuePosition. Otherwise create an order object containing that position. Explicit patch position takes precedence via nullish selection over the intent position; zero is valid. Do not renumber admittedSequence.
  - If a truthy intent is supplied, replace canonical delivery with requested/admitted from that intent and add fallbackReasonCode only when truthy. Existing unknown members of the old delivery object are not merged.
  - A truthy fallback reason replaces steer with `{state:"fellBack",reasonCode}`. Without one, retain the previous steer value rather than synthesizing a new state; JSON encoding drops undefined members as usual.
- A supplied truthy intent replaces root payload.intent as a whole. Otherwise, if a legacy intent member already exists as a non-null non-array object and patch queuePosition is supplied, preserve its members while updating that position. Do not create an absent intent solely for a queue-position patch.
- Ledger delivery is patch.delivery when non-nullish, otherwise the stored ledger delivery. It is not inferred from patch.intent; a delivery-only patch does not independently update canonical intent.delivery.
- Serialize the resulting payload with the existing JSON helper, retaining unknown fields and ordinary key order. There is no session touch. Commit once after the complete batch.
- Existing failures trigger unconditional rollback; this masks a prior SQLite automatic rollback and loses a write error if rollback also fails. Proposed repair is below; do not encode this defect as the desired outcome.

## Full promotion: promoteSessionInput

Promotion has one intended atomic scope: transcript message + all parts + recognized shared-context attachments + ledger status. It must retain existing message/part serialization, sequence, touch and legacy-field rules through their owned dependency contract; duplicating that serializer or SQL in this module would create another write path.

Current order and observable behavior:

1. Capture one promotion time, then request an immediate transaction. An existing transaction rejects before any promotion write; no borrowed promotion mode exists.
2. Save the supplied message, then parts in order, using their existing repositories. Each call is currently awaited; dependencies perform their database actions synchronously but return Promises. Consequently the owning promotion transaction is presently open across microtasks (confirmed defect below).
3. Inspect only message.metadata.inputIntent.sharedContextRefs. If that final value is not an array, skip shared-context work. Do not derive refs from payload, canonical intent, attachments or a different metadata key.
4. For each array entry in order, ignore entries that are not objects, do not have exact kind `shared_context_import`, or lack a string context_id. Empty string is still a string; no deduplication is performed.
5. Read the input session's `v4/shared_context_import` entries through the existing entry reader. Select its first entry whose data is a non-null, non-array object with contextId exactly equal to the ref's string. Dependency ordering is time_created then rowid. Absence throws `shared context import is missing`.
6. String-convert the selected data.status. Only pending/reserved are attachable; otherwise throw `shared context import is no longer attachable`. Preserve this limited status behavior; do not silently authorize already attached/deleted states.
7. Save that same entry identity/type/session/created time, set its updated time to the captured promotion time, preserve unknown data members and set status=attached plus attachedMessageId=String(input.message.id). Keep the existing entry writer's touch and errors.
8. Read all messages/parts for input.sessionID through the current message reader. Choose the first message whose object-valued metadata has matching contextId. If present, save it preserving all current fields and metadata while setting sharedContextStatus=attached. Missing context message is allowed. Query-wide corrupt message/part failures still propagate; replacing this with a narrow raw lookup could change that failure boundary.
9. After all refs, match the ledger by id + input.sessionID, set status=promoted, promotedMessageID to the stringified supplied message ID, promotedSequence to one above the session-wide stored maximum (zero initially), and updated time to the captured promotion time. Commit.

Preserve these legacy API edges in this replacement; upper-layer admission rules remain separately owned:

- Current full promotion does not check that a ledger row exists or is admitted. It can submit transcript when no row matches; it can promote cancelled/discarded/failed rows; it leaves old statusReason intact. Full promotion retry increments promotedSequence even for the same message. These behaviors are confirmed by native probes, but a normal runtime duplicate/terminal path has not been demonstrated. They are separate from the single-statement marker's admitted guard.
- No added validation currently ties message.sessionID or each part's session/message identity to the ledger input session. Native message/part FK rules still apply. Callers supply aligned identities; any stricter rejection requires an intentional specification and tests rather than an unannounced compatibility change.
- Duplicate refs to one context cause the later iteration to observe attached and fail; the transaction normally rolls back the earlier iteration and transcript. A ref failure does not partially attach preceding refs.
- Because the transaction currently contains await, all supplied message/part dependencies must succeed before final commit. Calling an async dependency without await to avoid yielding would be invalid: a rejected Promise must not be followed by a successful commit.
- BEGIN is outside the cleanup catch. Other failures—including commit—attempt rollback, currently unconditionally; automatic-rollback and dual-failure shortcomings are proposed repairs.

## Marker and terminal settlement

`markSessionInputPromoted` changes only a matching id/session row whose current status is admitted. It records the supplied message ID without checking that a transcript exists, allocates session promotion sequence from all stored statuses, sets promoted and updated time, and leaves reason unchanged. Repeated calls after promotion are no-ops. It does not save/touch transcript or session; its caller already persisted a synthetic notice.

`settleSessionInput` also matches admitted only. It changes status to the supplied cancelled/discarded/failed, records reason or SQL NULL by nullish selection, and updates time. Late discard after promotion, another session, missing ID and already terminal row are no-ops. Empty-string reason stays an empty string. Native status CHECK still rejects invalid values; no additional transition framework exists.

Both are single synchronous statements returning Promises, can participate in an external transaction, and never explicitly commit/rollback it. Statement preparation precedes the one Date.now call used for the update arguments. Neither method reads the previous row into JS or writes session activity time.

## Queries

- listSessionInputs filters exactly one session; a truthy optional status adds an exact status filter. Empty/undefined runtime status means no filter. Rows are ordered by admittedSequence only, with no promised additional tie-breaker or sorting by edited queuePosition. Do not silently replace the database order with a JS tie-breaker.
- getSessionInputById looks up the global primary ID without a session filter; missing returns null. This supports recovery of createSession.firstInput's actual session after ACK loss/restart.
- Both use the shared projection, have no writes/clock/cleanup and preserve SQLite read/preparation errors. Payload parse errors are intentionally the exception: they fall back instead of rejecting.

## Caller ownership and compatibility evidence

| Source and location                                            | Why the behavior matters                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contracts/interfaces/session-store.port.ts:852–867,1135–1194   | Public record, optional methods, same-ID admission correction and atomic-promotion requirement                                                                  |
| contracts/interfaces/session.port.ts:281–315                   | TurnInputIntentMetadata, frozen model/mode/provenance/attachment/shared-context fields that must remain unknown-field-safe                                      |
| adapters/.../sqlite-session-store.ts:663–727                   | Write guards/delegation and shared native connection; do not bypass guard or re-own facade state                                                                |
| adapters/.../sqlite-session-store.ts:385–469                   | Fork bundle owns an existing transaction and calls saveSessionInput within it; admission must remain borrow-compatible                                          |
| bootstrap/protocol/v4-bridge.ts:713–863                        | Persists deferred session before admission FK; canonical + legacy intent, then reserves shared context; runtime later corrects same ID                          |
| core/runtime/methods/events.ts:316–415                         | TurnSteerQueued admission, delivery fallback edits, terminal settlement; reason=promoted intentionally skips cancellation                                       |
| core/runtime/methods/steering.ts:563–587,1331–1360             | Durable delete/edit precedes projection disappearance; restart marks residual admitted records discarded/session_resumed                                        |
| core/runtime/methods/message-persistence.ts:142–174            | Prefer atomic promotion when input ID and capability exist; only after commit log success/publish SessionInputPromoted/release gateway pin                      |
| core/runtime/methods/background-notifications.ts:58–81,166–211 | Background admission is tracked separately; batch synthetic notice is saved once and then each input is marked, so marker intentionally has no transcript write |
| bootstrap/protocol-v4/persistent-command-facts.ts:34–112       | Reload cancelled/discarded command facts; optional admitted sweep on load; canonical/legacy source command IDs retained                                         |
| bootstrap/protocol-v4/create-session-command-fact.ts:9–58      | Global input lookup recovers real session; promoted means accepted, admitted is discarded on restart, terminal reason affects failed ACK                        |

No dedicated test targeting these seven exports was found in the searched tracked source test locations. Existing adapter `full-access-fixture.ts` admits rows; `full-access-storage.test.ts` and `full-access-storage-failure.test.ts` exercise the separate full-access transaction's modifications of queue payload/status and cleanup. Those tests are useful integration coverage but do not establish promotion atomicity, payload edit rules or interleaving correctness for this module.

## Reproduced defects and required intentional repairs

### D1 — Primary error masked after automatic rollback

In a new memory store, admit q. A BEFORE UPDATE session_input trigger raises SQLite ROLLBACK with `original edit fault`; updateSessionInputs rejects with `cannot rollback - no transaction is active`. The row remains unchanged and no transaction is active. A separate promotion fixture triggers ROLLBACK at the final promoted ledger update with `original promotion fault`; message rollback is correct, but the original cause is replaced by the same cleanup error.

Required acceptance: preserve the original failure when SQLite already ended the transaction; on write/commit plus rollback failure retain both errors and original cause. BEGIN failure must never roll back another owner's transaction. Existing `withWriteTransaction` already specifies this policy for synchronous bodies; reuse its contract rather than duplicate cleanup.

### D2 — Await inside the transaction captures an unrelated successful write

Fresh memory store with sessions s and other: admit q in s; install a part-insert ABORT trigger. Invoke full promotion of q with one part, then immediately call ordinary saveSessionInput for an independent input in other, without awaiting the promotion. At that point the transaction is active and both rows are visible on the shared connection. Await both: promotion rejects with `part fault`, independent admission fulfills, yet its row is missing because promotion rolled back it too. This uses the public facade and normal typed records, with only the DB fault injected; it is not an observed real-user outage.

Required acceptance: a promotion's owned native transaction must not span a JS yield capable of absorbing unrelated calls; the independent admission must either durably succeed after the failed promotion or be explicitly rejected before mutation, never fulfill and vanish. Two same-connection promotions should likewise not fail merely because the first yielded with its own transaction open. Do not introduce a process-wide queue or pretend a memory mutex provides cross-process atomicity.

The current message dependencies are Promise APIs with synchronous native actions. A correct synchronous promotion needs a narrow reusable synchronous internal message/part/read boundary, with public Promise wrappers retained. This batch explicitly authorizes the three synchronous internal message entrypoints specified above, retaining their existing async public wrappers. Do not copy serializers/SQL or call async functions without awaiting their errors. The entry reader/writer already have synchronous signatures.

### Other confirmed legacy edges — preserve in this batch

Cancelled-to-promoted, duplicate full-promotion sequence advance, transcript saved despite missing ledger, cross-scope message identities and non-idempotent duplicate shared refs require a product decision if changed. Runtime reservation/admission is a separate owner and normal paths already aim to prevent these inputs. Preserve their observable baseline or specify a bounded intentional change with direct tests; do not claim a real client exploit or silently add fallback behavior.

## Minimal fresh design and old-first acceptance

One coherent batch can retain the seven public exports and split into (1) tolerant row/intent document projection, (2) synchronous ledger operations, and (3) promotion coordination. The SQLite rows stay authoritative; no duplicate accepted-input state is needed. Retain single-statement atomic admission/marker/settlement and the own-versus-empty-no-op distinction of batch edits. A shared synchronous write owner can serve nonempty editing and promotion once all promotion dependencies are synchronously callable. No file needs exceed the CLI's 400-line limit. Responsibility separation and transaction correction, rather than renaming or a lower line count, are the meaningful design basis.

Suggested old-first groups, kept bounded:

1. Seven export signatures and Promise completion; facade write guard; global versus session scope; missing readers; stable output field order/prototype and nullable optional fields.
2. Admission new/replay across terminal states and sessions; sequence over all statuses; creation identity; no session touch; normal encoding/unknown members, circular payload and native FK/CHECK failures; admission inside a caller-owned fork transaction.
3. Read payload matrix: object without text, object with null text/unknown/prototype-named key, scalar/null/array/bad JSON. Fallback delivery/status via a synthetic legacy row only; no migration change.
4. Edit text/queuePosition/intent separately and together; explicit zero precedence; canonical unknown/order fields retained; absent/non-object canonical/legacy intent not manufactured; duplicate IDs sequential; missing/terminal/other-session no-op; one time across batch; empty outer no-op versus nonempty outer rejection.
5. Edit all-or-nothing when a later row fails, primary after automatic ROLLBACK, commit failure, and paired cleanup failure. Assert no session touch and ordinary raw stored JSON order, not arbitrary accessor counts.
6. Promotion message/parts order, commit gating of public resolution, no ledger and legacy terminal/replay behavior if preserved, scope and promoted-sequence projection. Failure at message/part/context/ledger/COMMIT restores both transcript and ledger; BEGIN failure preserves caller transaction.
7. Shared context pending/reserved, missing/non-attachable, ignored invalid refs, absent context message, first matching entry/message, multiple and duplicate refs; unknown fields retained and all affected rows/touches rolled back together. Include malformed neighboring message/part/entry to preserve dependency error scope.
8. Single-statement marker and settlement admitted guards, empty reason, no transcript/clock side effects beyond defined fields, external transaction participation; late discard cannot undo promoted status.
9. D2 public same-turn interleaving: unrelated session admission across failed promotion; independent successful promotion immediately followed by another; no async callback inside a synchronous transaction helper.
10. Public runtime/store integration keeps SessionInputPromoted after commit, fork admission inside bundle ownership, and background batch marker semantics; no real model or device is needed.

Source and compiled finite comparison should separate intentional D1/D2 changes from compatibility. The root agent handles types, lint, architecture, build, full offline regression and provenance records after implementation. Current probes establish neither cross-process stress behavior, arbitrary getter/Proxy equivalence, power-loss/disk-full resilience, nor actual UI/client reachability of the legacy terminal/replay edges. No completed replacement, MIT grant or full-project completion is claimed here.
