# Complete BroadcastHub public behavior contract

Scope: the complete existing BroadcastHub export, including opaque claim authority and broadcast relay. Preserve existing runtime imports and public API; other schemas/logger/services/native processes remain collaborators. This is root-only preparation, not permission to implement or an origin/history clearance. Private checkpoint coverage and final conflicting versions remain HOLD. Curator is source-exposed; this packet contains observed behavior/public data, no predecessor implementation, private helper names/layout, tests or patch plan. The eventual author chooses internal state representation and decomposition. No novelty requirement, policy redesign or new I/O is authorized.

## Ownership and public methods

A hub owns an insertion-ordered registration from numeric window identity to native UtilityProcess and insertion-ordered opaque key reservations/claims. Registrations and claims are distinct state; no task, workspace, Coding Plan or migration business state is added. Claim token sequence has module-wide lifetime, begins at zero and is shared by all hub instances, while registrations and claims belong to each hub. New instances do not reset that shared sequence. No background timer, promise, listener disposer API, automatic claim validation or permission grant is added.

collectMemoryDiagnostics returns a new object with own keys claims, processes in that order and their current counts. It reads counts without pruning, time sampling or I/O.

register(windowId,child) accepts synchronous inputs: first make child the current registration for windowId, then invoke child.on with event message and a new message callback. Every register call installs a callback, including repeated registration or replacement. Do not remove an earlier listener, introduce registration equality checks or rollback registration when on throws. Replacement preserves the existing window's position in relay order; deletion followed by registration places it last. The callback retains the original windowId and original child for claim responses, even if registration is later replaced/deleted. It does not reject messages from stale/unregistered children.

unregister(windowId) first removes the current registration, then removes all still-reserved claims owned by that numeric window. Committed claims survive unregister; claims owned by other windows survive. There is no clock/prune or child listener removal here. Existing callbacks remain callable; preserving this fact does not recommend a new policy.

## Message admission and synchronous effects

For every installed message callback, call the existing hostResponseMessageSchema.safeParse once with the original raw value and its schema receiver. On unsuccessful parse, call logger.warn with its receiver and exactly two arguments: the retained invalid-host-response prefix and formatZodError(parsed error). Error formatting/logging exceptions propagate; otherwise return without relay/claim effects. Valid unrelated host response variants are ignored.

Relevant dispatch priority is Broadcast, BroadcastClaimRequest, BroadcastClaimCommit, BroadcastClaimRelease. Use parsed data, not unchecked raw properties. Broadcast invokes the following broadcast behavior with the callback's source windowId; request uses the callback's original child, requestId and key; commit/release use windowId, key, claimToken. No additional sender/main-frame/registration/expiry checks or catch-all are introduced.

### Broadcast

Validate the supplied message again with the existing broadcastMessageSchema.safeParse (receiver preserved). Invalid data logs exactly two warning arguments: retained invalid-broadcast prefix and existing formatZodError(error), then returns. Valid data yields a fresh message formed from parsed data with sourceWindowId overwritten by the callback's numeric windowId. Schema parsing/stripping/normalization belongs to the existing schema; do not implement a substitute.

Visit current registrations in insertion order. Skip any registration whose numeric windowId equals the callback's source windowId. For each other child, call child.postMessage with its receiver and one envelope whose own keys are type, message, where type is HostMessageTypes.Broadcast and message is the same enriched object reference for every recipient. Do not clone per recipient, acknowledge, catch/continue a thrown postMessage, retry or queue. Synchronous recipient reentry can mutate that shared message and registration collection; preserve live ordered iteration, including deletion skipping and newly appended registrations being visited. A thrown port aborts further delivery with earlier effects retained.

### Opaque key request

Sample Date.now once at request entry. Before lookup, expire all reserved entries whose non-null expiry is <= that sampled time, then apply capacity eviction. Committed entries do not expire. Capacity is 1024 entries total, including committed entries. While above that capacity, remove the first insertion-ordered key; if that first key is falsy, stop rather than continuing. Supported parsed keys are nonempty; no new validation is added to alter this inherited edge. There is no scheduling timer or TTL refresh on busy/commit. Clock errors propagate.

If a remaining key is committed, original requesting child.postMessage receives one fresh object with ordered keys type, requestId, status; values BroadcastClaimResult, original parsed requestId, committed. No token/time/sequence creation.

If a remaining key is reserved, respond to the original child with ordered keys type, requestId, status, retryAfterMs; status busy. retryAfterMs is the smaller of 250 and remaining expiry-minus-sampled-now, clamped below at zero; a null expiry uses sampled now. No extension, ownership change, token creation or sequence increment.

If key is absent, increment the module-wide sequence exactly once, before storing or publishing. Token text is the string rendering of windowId, colon, requestId, colon, new sequence; sequence starts with 1 on the first allocation across module instances. Create a reservation for this owner/window/token with expiry sampled-now + 5000 and reserved status. Then expire/capacity-prune again using the same sampled time, without another Date.now. Publish to original child with ordered keys type, requestId, status, claimToken and status acquired. The token/state remain allocated if publication throws; pruning may evict an earlier committed/reserved key. No rollback/retry or actual atomic cross-thread operation is added: synchronous Main admission supplies existing first-wins semantics.

### Commit/release

Each operation samples Date.now once and expires/capacity-prunes before matching. It succeeds only for a currently reserved key whose owner windowId equals the callback windowId and whose token strictly equals parsed claimToken. Missing/stale/wrong owner/token/already committed does nothing. Commit keeps the same ordered key position/token/owner, changes status to committed and removes expiry by setting it to null. Release removes that matching reserved key. Committed entries cannot be released by this path. Neither path returns a response or changes module token sequence; no await/extra validation or new grant policy.

## Error and migration limits

All effects are synchronous with current receivers. No effect is wrapped in a new catch, rollback, once-only listener guard or destructor. Native callback/port/reentrant effects may expose partial state. Preserve receiver binding on schema/logger/child methods. Existing schemas/protocol strings/token format/numeric limits/warning prefixes are compatibility material, not discretionary prose or independently cleared code.

The author receives only this contract, public-api.d.ts, retained-data.json and the two named shared public port/data files. No source/test/history/review/failure implementation body may be substituted into that allowlist. Root will decide whether implementation is appropriate after historical HOLD review. Production notices, global provenance, taskRealtimeBus, G Playwright and completed root network/runtimeEnv are outside scope.
