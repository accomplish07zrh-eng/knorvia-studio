# Complete collection-event and prompt owners: author contract

Author complete replacements for collection-events.ts and prompts.ts at the public surfaces in public-api.d.ts. Existing graph helpers, event log, runtime interfaces and public schema types are collaborators to import, not replace. Write two separate complete output files; no other owner or helper implementation is supplied. Private decomposition is your choice. Retained declaration modules need no rewrite. Required protocol/order/text and ordinary idioms do not require artificial differences or novelty.

Read only inputs/contract.md, public-api.d.ts, dependency-api.d.ts, public-data-shapes.md and rendered-text.json plus your own output. No repository/AGENTS/history/source/test/review/other-author/network/other scratch access. Curator has handled repository instructions and is source-exposed. Restriction is instruction-based in a shared executor, not OS isolation. Freeze complete outputs and author-record.json with UTC/read/input/output hash/bytes metadata before compilation, tests or comparison, then stop. Do not edit production or publish. Report receipt bytes/hash separately, excluding its self-hash.

## Collection events: expansion gates and publications

emitExpansionEvents uses the caller snapshot and collectionId parameter; it does not use expansion.snapshot or substitute expansion.collection.collectionId. Inspect addedNodes.length first; if positive publish graph_expanded, otherwise inspect addedEdges.length and publish when positive. No record/event is emitted for empty arrays at this first gate. Event options are fresh with own keys in order message,payload,phase,signal. Message uses the exact expanded template. Payload is a fresh ordered object: collectionId=parameter, edgeIds=fresh ordered mapping of the current addedEdges via existing edgeId, nodeIds=fresh ordered mapping of current addedNodes' id. No sorting/deduplication/cloning of node/edge values. Build summaries before calling the event port. Phase and signal come from the current options fields at that call. Await its settlement.

Only after that first event has resolved (or if it was skipped), inspect the then-current expansion.collection.exhausted. If truthy publish collection_exhausted without needing to read status; otherwise read the then-current status and publish if it equals exhausted. Earlier event effects may change expansion.collection, arrays, options.phase or signal; do not precompute exhaustion or capture phase/signal before the await. Second event options are fresh own keys message,payload,phase,signal. Message uses the exact exhausted template and same collectionId parameter. Payload is a fresh object with sole own key collectionId. Phase/signal are reread at this later call. Await settlement and resolve undefined. There are zero, one or two events as selected; first-event rejection prevents the second gate/event. No catch, retry, abort check, extra graph record, clock or snapshot write belongs to this function.

runtime.eventLog.emitEvent is looked up when each call is made, with event-log receiver. The event log owns clocking and persistence; do not reconstruct it or synthesize timestamps. The existing edgeId dependency consumes an edge and returns its id; do not reconstruct that body.

## Collection exhaustion: projection, gate order and references

exhaustCollection first creates a fresh ordinary shallow spread of the supplied collection's enumerable own fields, then overrides exhausted=true and status=exhausted. Preserve existing property positions and all other shared references; neither mutate nor normalize the caller collection independently.

Invoke existing updateGraphCollection with four arguments, evaluated in order: original snapshot; current original collection.collectionId; the projected collection reference; next runtime.eventLog.timestamp(). This routes using collectionId observed before the clock. A mutation-capable clock can change original collection/options after the projection; do not rebuild that projection or substitute the later original id for the already observed helper routing id.

Retain the helper-returned exhausted snapshot by reference. Await runtime.writeSnapshot(that snapshot, fresh own {signal: current options.abortSignal}); then await eventLog.appendCollectionRecord with that same snapshot, the projected collection reference and then-current signal; then await eventLog.emitEvent(that snapshot,collection_exhausted,fresh options). There is no snapshotAccess/setSnapshot here and no extra timestamp. Port receivers are runtime and runtime.eventLog respectively; do not stale-capture dynamic ports or bind them to another receiver. A preceding rejection stops subsequent stages and escapes unchanged; no retry/rollback/failure publication or abort inspection occurs. Partial side effects remain.

Final event options own order: message based on then-current original collection.collectionId; payload; phase=current options.phase; signal=current options.abortSignal. Payload is a fresh object first inserting collectionId from the then-current original collection, then shallow spreading the caller payload. Thus a caller payload.collectionId overrides that value (including undefined), without losing its existing insertion position. Other enumerable payload fields and object references are retained. Do not sanitize/drop keys, cache the initial id for final publication, or mutate payload. Return the exact exhausted snapshot after successful final event, even if a port mutated it. Captured projected collection primitive values are not retroactively replaced by later caller changes.

## Exact default node prompt

Use the node rows in rendered-text.json. First map snapshot.artifacts in array order to artifactLine strings and join them with a single newline; no sorting/deduplication/filtering/escaping. Compute this artifact section before the remaining prompt metadata reads. Build final ordered sections:

1. header, run, cwd
2. one empty section, task, one empty section
3. title, id
4. objective only when node.description is truthy, then prompt only when node.prompt is truthy
5. one empty section, artifacts text if the joined artifact section has positive length, otherwise noArtifacts
6. one empty section, instruction

Join retained sections with a single newline. Preserve empty sections; drop only the absent optional objective/prompt sections. There is no trailing newline and no whitespace trim/escaping/JSON serialization of user values. Empty description/prompt omits its section; whitespace-only strings remain truthy and are included unchanged. Node/run/cwd/task/phase content interpolates directly. Preserve one-shot synchronous execution and all string bytes in rendered-text.json; no runtime/network/clock side effect is added.

## Exact default planner prompt

First call existing collectionNodeIdsForGraph(collection,snapshot.graph), receiving an ordered id list. Resolve every id via existing nodeById(snapshot.graph,id) in that order before formatting node lines. Omit only unresolved undefined results; preserve duplicates and order. Do not replace lookup with your own graph scan or cached node index. Each resolved node formats exactly nodeLine: id, status, title, and descriptionSuffix only when description is truthy. Join lines with one newline. Missing nodes are not rendered as undefined, and description values are not escaped/trimmed. Compute this entire joined node section before other planner metadata sections.

Build final ordered sections:

1. header, run, cwd
2. one empty section, task, one empty section
3. title, id
4. goal only when collection.goal is truthy, then metric only when collection.metric is truthy
5. one empty section, nodes text if joined node section has positive length, otherwise noNodes
6. one empty section, jsonIntro, jsonShape, instruction

Title uses nullish fallback from collection.title to collection.collectionId (empty title remains empty). Optional sections use truthiness (empty string omitted, whitespace string included). Join with one newline, preserving empty sections and no trailing newline. jsonShape is the exact compact textual example from rendered-text.json; do not produce it from differently ordered serialization. All instruction prose and example JSON are deliberately retained source-derived functional output text, not newly authored prose or a grant clearing that material.

## Artifact name contract

safeArtifactName synchronously replaces each UTF-16 code unit outside ASCII letters A–Z/a–z, digits 0–9, period, underscore or hyphen with an underscore. Do not trim, lowercase, normalize Unicode, transliterate or remove disallowed units. A surrogate pair outside that ASCII set produces two underscores. Then keep the first 100 UTF-16 code units of the replaced string. If that final result is empty return the fixed string node. Input whitespace is replaced rather than triggering fallback; slash/backslash become underscores. No filesystem/encoding or collision policy belongs here. Standard replacement/slice syntax is permitted; novelty is not needed for this minimal sanitizer.

## Scope and field rules

Ordinary schema-shaped mutable objects, dynamic ports and their mutations at await/clock gates are in scope. Do not invent proxy/malformed-input support, new cancellation/retry/logging policy, prompt content or public APIs. Current public declarations and constant protocol/text remain retained compatibility boundaries. Implement these two complete owners only, with private organization free and each below400 readable lines. Record any uncertainty before claiming compatibility.
