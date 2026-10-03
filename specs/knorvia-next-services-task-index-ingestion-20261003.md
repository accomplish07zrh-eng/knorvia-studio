# Task-index ingestion replacement contract

Continuing `lane/services-20261003`, draft PR16, exact integration base
`3b1ff0f715a43cbc51c576fd524479a08e58e203`. The taskIndexSyncer predecessor is
blob `8672ae0027c23e543307b68024828305993589e1`, SHA-256
`529d114c34c331f54d4e744890526d34c83b54e7f48c00a916fab2583bdbec2c`.
Historical origin/allocation HOLD records stay immutable. Current user allocation
permits implementing a complete behavior-contract replacement; neither it nor a
new candidate/hash clears rights, accepted-version or expression review.

## Owner and independent implementation design

Replace the full monolithic owner with a workspace coordinator, two independently
instantiated topic state machines and repository projections. Use one generic
topic lifecycle/recovery protocol instead of mirrored index/config state fields
and routines. A topic owns its subscription generation, pre-ACK buffer, assembler,
cursor, recovery flight, retry attempt and warning interval. A workspace owns its
runtime generation, stable listeners, shared assembly expiry timer and summary
baseline. The existing repository remains the sole SQLite/schema/migration owner.
Projection code does not maintain another accepted session or command queue.

The service API, exported terminal/ready event shapes and existing factory stay
at `agent/taskIndexSyncer.ts`. Only services-owned private modules are added.
Existing shared assemblers, schemas, topic/workspace identity builders, visible
message/title/status/model ports and subagent-repair port are reused, not copied.
Their contracts, strings, limits and fixed data shapes retain original lineage.
Source-exposed authoring and final independent-expression/rights review remain
explicit. No replacement of a positive accepted-version HOLD without integrator
decision, and no whole-file MIT claim.

```mermaid
sequenceDiagram
    participant Runtime as Existing runtime authority
    participant Workspace as Workspace coordinator
    participant Topic as One owner per topic
    participant Projection
    participant Repo as Existing task repository
    Runtime->>Workspace: available generation
    Workspace->>Topic: listeners first, existing-only subscribe
    Runtime-->>Topic: physical frame may precede ACK continuation
    Topic->>Topic: bounded pre-ACK staging
    Runtime-->>Topic: ACK subscription identity
    Topic->>Topic: owned assembly + cursor admission
    Topic->>Projection: complete logical frame
    Projection->>Repo: seed / patch / snapshot transaction
    Projection-->>Workspace: workspace event; terminal then ready
    Runtime-->>Workspace: unavailable same generation
    Workspace->>Topic: invalidate ownership locally, no runtime RPC
```

Desktop continuous and mobile replayable paths consume the same runtime facts.
An observer never resumes/materializes a session, starts a dormant runtime or
introduces a second writer. Readback is readSession with runtimePolicy
`existing-only`. Event listeners by themselves never activate a workspace.

## Topic contract

- Reserve one workspace by the canonical identity key before starting async work.
  A lifecycle-aware runtime absent from the available-generation map yields a
  dormant reservation. Without lifecycle support, explicit ensure retains the
  legacy activation behavior and restart callback. Session ensure requires both
  sessionId and workspacePath and reduces to workspace ensure; includeSnapshot
  is a retained compatibility parameter with no V4 effect.
- Install both stable frame listeners synchronously before either subscription.
  Subscribe both independently with visibility background, subscriberScope
  `task-index`, existing-only runtime policy and no resume base. Runtime available
  restarts each topic independently. Unavailable for the recorded generation
  invalidates both topic generations, clears recovery/retry/buffer/assembler and
  shared expiry timer, sets subscriptions null and sends no cleanup RPC. Stale
  unavailable notifications must not suspend the current generation.
- Every fresh subscribe clears only its own retry, recovery, buffer and assembler,
  increments that topic's generation and removes its active route. For requested
  replacement, await the previous unsubscribe before subscribing and recheck
  generation/liveness. Every cleanup RPC uses existing-only policy; log failures.
- Before ACK, buffer candidate wires for the owned topic up to 1,024 frames and
  32 MiB of UTF-8 JSON. Overflow clears the buffer, marks recovery-needed and
  refuses additional staging. At ACK, discard stale buffers. A stale ACK is
  unsubscribed unless its ID is currently owned by a later generation. Overflow
  ACK is unsubscribed and triggers a fresh subscribe in the still-current
  generation. A valid ACK admits identity/epoch but starts cursor zero with
  hasAppliedBase false; only a complete logical snapshot proves a cold baseline.
- Drain only ACK-matching staged frames in arrival order. Check topic and owned
  subscription before invoking the shared physical assembler. On any assembler
  fault, abort the route and handle the first fault instead of applying any
  complete events returned in that accept call. Complete events use initial or
  recovery delivery when specified, otherwise online.
- One workspace expiry timer schedules the earliest of the two assemblers.
  Expire index first, config second at the same timestamp, handle every fault,
  then recompute the deadline. Timers are unref'd and cancelled on suspend or
  disposal. Foreign subscription frames never allocate decoded staging.
- Online deltas during a recovery flight are withheld; a post-apply newer delta
  marks a follow-up gap. Online snapshots already covered by an applied cursor
  are ignored. Accept snapshot epoch/cursor before projection. Without a proven
  base, deltas force recovery rather than establish a baseline. Duplicate/older
  deltas are ignored, but a valid recovery duplicate completes the flight.
  Otherwise fromSeq must equal the applied cursor. Index delta projection runs
  before cursor commit; config delta cursor commits before its emission, keeping
  the original callback/failure boundary.
- Recovery is topic-local and same-sub. Base is null and forceSnapshot true when
  forced or no proven base/epoch exists; otherwise use that topic's epoch/seq.
  Only one flight is active. A stronger request flags an upgrade until ACK. ACK
  identity mismatch starts a fresh subscription; resync failure likewise logs
  and starts a fresh route. ACK alone cannot complete a flight: require an applied
  recovery frame, in either arrival order. ACK mode snapshot strengthens the
  flight. After successful apply, clear the flight and run a flagged follow-up.
- An upgrade uses forced same-sub recovery, or a fresh subscription when the
  active flight was already forced. Recovery-frame timeout uses the shared
  logicalFrameAssemblyTimeoutMs: escalate unforced recovery, replace a forced
  route. Recovery gaps follow the same rule. Online faults during a flight only
  flag follow-up if it already applied; a missing/invalid delivery kind is treated
  as recovery when a flight exists, preventing a stuck flight.
- Runtime-unavailable subscribe failures make the workspace dormant and do not
  retry. Provider-not-ready waits 5,000 ms with debug logging. Other failures use
  25 ms exponential delay capped by exponent five and 1,000 ms, with one warn per
  topic per 60,000 ms and intervening debug. Successful ACK resets attempt/warn.
  Retry callbacks use generation/liveness, and one topic cannot cancel its sibling.

## Summary and repository contract

- First index snapshot stores a last-occurrence-wins summary map and silently
  seeds non-draft missing rows, preserving existing product metadata. Seed at
  most 64 concurrently per sequential batch; aggregate failures into one warn.
  Baseline metadata retains trace generation, custom-title flag, timestamps,
  build mode, provider, parent task and running/completed/error mapping. Invoke
  the existing subagent repair with all visible IDs and captured subscription
  generation; only its existing callback emits task_meta_changed. First snapshot
  never replays old terminal/ready or task-row broadcasts.
- Subsequent snapshots diff against the previous map; deltas upsert one summary
  or remove the summary only. A draft is baseline-only. A real observed nonterminal
  to terminal transition takes precedence over visibility/title changes and fires
  terminal then ready with the same target object. A newly visible session instead
  triggers a full existing-only readback with grouped-top insertion. Remaining
  nonblank changed titles patch the row, or read back a missing row at grouped top.
- Terminal patch uses current time, completed+explicit undefined lastError or
  error without a lastError key. Emit task_status_changed for an existing row,
  then asynchronously read back the full snapshot for search/error/model
  convergence. Carry background_terminal exactly once: error always; completed
  only with goalStatus absent or verified. A missing patched row transfers that
  signal to readback. Preserve patch/readback failure logging and async ordering.
- Snapshot metadata preserves task/trace/workspace identity, visible title,
  timestamps/mode/provider/status and authoritative lastError attribution.
  Trim truthy explicit model/thought overrides; absent overrides use existing
  latest-message model preference and snapshot thought level. Goal absent means
  do not set a key; explicit null clears it; a present goal maps all existing
  sessionID/targetID/token/time fields. Subagent-child snapshots return projected
  metadata without repository or broadcast effects.
- Search text uses existing user-visible-message filtering, user text parts and
  only the last assistant text part; exclude empty text, trim, join with newline
  and cap at 200,000 UTF-16 characters. Do not index thoughts, tools, synthetic
  continuation inputs or hidden compacted content. Retain the original budget
  boundary that counts content lengths before final newline-inclusive truncation.
- Grouped-top snapshot insertion is a single repository transaction with search
  text. Empty snapshots still persist; they emit no placeholder metadata. If
  grouped order was first initialized, emit task_created without metadata for an
  empty snapshot or with metadata when visible. Otherwise preserve the caller's
  explicit reason and optional truthy unread signal. Model-only synchronization
  trims, skips empty, updates only model and returns null on a logged repo failure.
- Workspace emitters are lazy and stable by exact string/canonical object key.
  Keep event objects/optional-own-key shape, listener exposure and public API.
  Disposal invalidates before async work, clears all owned timers/routes/listeners
  (attempt every listener despite dispose exceptions), disposes emitters/lifecycle
  subscriptions and clears availability. Never close the injected repository.

## Deferred validation and coordination

Write only synthetic contract fixtures for pre-ACK capture, independent sibling
recovery/stale ACKs, dormant runtime authority, initial silent seeding, terminal
ordering and snapshot data compatibility. **UNVERIFIED:** execute no tests,
typecheck, lint, formatter/architecture checker, build, audit or CI rerun. Read
source/differences and confirm remote commits only. Existing historical failures
remain historical. Global shared/schema/source records and any accepted-hash
decisions belong to the integrator. No UI, persisted schema, actual data, credential,
provider, native process or permission changes.
