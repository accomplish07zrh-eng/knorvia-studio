# Complete collection-planner owner: functional contract

Write a complete TypeScript module exporting `checkCollectionPlanners`. Its scope includes the admission behavior below. Internal organization is your choice: one module or a cohesive private admission module is acceptable. Keep other graph, prompt, trace, expansion, and collection-event owners as imported dependencies. This is a compatibility task, not an algorithm-novelty or code-size contest. No implementation, tests, comparison report, or private helper decomposition is supplied. The companion API files are declarations and public data schemas, not implementations.

The output is an evidence candidate, not an installed production change. Do not add a license declaration or infer a license. Preserve fixed protocol fields and strings. Standard TypeScript syntax, API imports, mandatory field layouts, and protocol strings are constraints; private names, decomposition, local control representation, and ordinary implementation expression are discretionary. Default guideline: modules below 400 lines without compressing readability to meet the limit.

## Author boundary and deliverable

Read only the three files in the supplied `inputs` directory: `contract.md`, `public-api.d.ts`, and `public-data-shapes.md`, plus your own output. Do not read the repository, Git history, other scratch directories, existing implementations, tests, reviews, or network sources. Do not run compilation, tests, or comparisons during this author phase. Tool/file access is instruction-restricted, not an OS sandbox: disclose any accidental read or uncertainty. Use the same saved executor.

Write `output/collection-planner.ts` (and optionally `output/collection-planner-admission.ts` if your own design needs it). Then immediately write `output/author-record.json` containing SHA-256 and byte count of every input and output, actual files read, unresolved questions, any boundary breach, and UTC freeze time. Freeze before any curator comparison and stop. The curator will archive exact bytes. Do not reuse another task's draft or author output.

## Public result and serial sweep

The function receives a snapshot, executable-node Set, run options, and runtime ports. It returns a Promise of an object whose own fields are `addedNodeIds`, `plannersRan`, `snapshot`, in that order. With no planner runner at entry, return the original snapshot, fresh empty additions and count zero, without checking cancellation.

Otherwise obtain the initial ordered normalized collection list using `graphCollections(snapshot.graph)`. This list is stable for the sweep; new collections in subsequent snapshots do not join this sweep. Carry forward each admitted update, exhausted result or completed attempt result before processing the next initial collection. Collect added node IDs in returned order, allowing duplicates. Increment the count for every attempt that returns, including recovered failure and an attempt skipped because the runner disappeared; rejected attempts reject the whole call. Check abort before processing each initial collection: an Error-valued reason is thrown by identity; all other reasons produce Error with exactly `Workflow scheduler aborted`. No extra cancellation guards.

Admission is synchronous. For each initial collection:

| Ordered observation | Outcome |
| --- | --- |
| Not explorable, or `isCollectionInPhase(collection, current.graph, executableNodeIds, phase)` false | Leave snapshot unchanged and skip. |
| Eligible | Obtain membership with `collectionNodeIdsForGraph(collection, current.graph)`, then frontier with `collectionFrontier(current.graph, collection)`. Scan membership in order; completed means `nodeById(current.graph, id)?.status` equals `completed`. Unseen completions are those absent from the original collection's analyzed IDs (default empty). |
| At least one unseen completion | Update the original collection ID with only `lastCompletionAt`. Use one timestamp for that field and the next timestamp for `updateGraphCollection`. No persistence here. |
| After the above | Re-read the same ID from `graphCollections(current.graph)`; use original collection if not found. Subsequent admission checks use this latest record; previously observed frontier and unseen IDs stay fixed. |
| Latest exhausted flag true or status exhausted | Skip, retaining any completion-time update. |
| Frontier positive, plannerRuns default zero equals zero, analyzed IDs default empty length zero, unseen empty | Update latest collection status active with one timestamp and skip; no persistence. |
| Otherwise frontier at least latest.frontierTarget (nullish fallback to strategy.executor.frontierTarget), and unseen empty | Same active update/skip. |
| Otherwise plannerRuns default zero at least strategy.executor.maxPlannerRuns | Await `exhaustCollection` with payload `{ reason: "max_planner_runs" }`; carry its returned snapshot. |
| Otherwise errorCount default zero at least strategy.executor.maxConsecutiveErrors | Await the same port with `{ reason: "planner_error_threshold" }`; carry its returned snapshot. |
| Otherwise | Attempt using latest collection and the unseen array. |

Do not parallelize admission/exhaustion/attempts or add await points to synchronous admission. Exhaustion rejection propagates unchanged.

## Attempt activation and snapshot observations

Recheck runner availability at attempt entry. If absent, return empty additions and its input snapshot without activation. For an actual attempt, capture the original admitted collection reference, its next numeric plannerRuns (default zero plus one), input artifact paths in snapshot order, new activity ID, and start time. The observable order is: createActivityId; timestamp for startedAt; calculate run count; collect input paths; optional child-trace creation; collection update timestamp; activity update timestamp.

When options.traceContext exists, call `createChildTraceContext` with that same parent. Options own fields are `attributes`, `sessionId`; attributes own fields in order: workflowActivityId = new activity ID, workflowCollectionId = admitted collection.collectionId, workflowKind = input snapshot.kind, workflowPhase = phase, workflowRunId = input snapshot.runId. sessionId is parent trace's sessionId. Otherwise no child trace is created.

Create the active collection through `normalizeCollection`, preserving the admitted collection's fields and overriding plannerRuns with the captured next count and status with active (override order plannerRuns then status). Update its original ID using `updateGraphCollection`. Insert the active activity using `upsertActivity`.

Active activity own fields, in order: activityId, inputArtifactPaths, kind=`planner_agent`, outputArtifactPaths=fresh empty array, parentSessionId=options.parentSessionId, phase, startedAt, status=`active`, traceId=child trace traceId or undefined. Optional-valued fields listed here are present even when undefined.

Two snapshot observations matter: the activation snapshot remains the graph/prompt source for the runner; the latest child-link snapshot starts at activation and advances only on accepted child-session callbacks. Completion and failure projections do not replace that latest-child-link observation. Terminal persistence can fail without leaking its projected artifact/graph into the returned failure snapshot. Late callbacks can still observe an active activity after terminal publication.

Activation must await, sequentially: runtime.writeSnapshot(activation, {signal}); eventLog.appendCollectionRecord(activation, activeCollection, signal); eventLog.emitEvent(activation, `planner_started`, event options). These three gates are outside recovery. Any rejection propagates the identical value, prevents runner invocation and produces no failure publication.

Started event message is `Planner started for collection: <original collectionId>`. Payload field order is collectionId, frontier, plannerRuns, unseenCompletions. Frontier is computed then with activation.graph and activeCollection; plannerRuns is the captured number; unseenCompletions is the original unseen array reference. Event options field order throughout is message, payload, phase, signal.

## Runner and child-session callbacks

Invoke the current runtime.plannerRunner.run with its receiver preserved. Runner input own fields and evaluation order: abortSignal, activityId, collection=activeCollection, cwd, graph=activation.graph, onChildSessionStarted, onEvent, parentSessionId, phase, prompt, runId, snapshot, task, traceContext. Forward option references directly. Prompt is `buildDefaultPlannerPrompt(activation, activeCollection, phase)`. After prompt evaluation, runId/snapshot/task are read from the latest-child-link snapshot. traceContext is the child trace. Await runner settlement before artifact publication.

The async child callback looks up its activityId in the latest-child-link snapshot. If missing or not active, return without a clock or port call. Otherwise copy that activity, set model only when event.model is truthy, set sessionId unconditionally to event.sessionId, set traceId to event.traceId with nullish fallback to previous traceId, and turnId similarly. Use upsertActivity with the next timestamp; advance the latest-child-link observation before awaiting persistence.

Await writeSnapshot(latest child-link snapshot, {signal}), then emit `workflow_session_linked` against the latest child-link snapshot as observed after that await. Message is `Workflow session linked: <event.sessionId>`. Payload is compactWorkflowPayload of fields in order: activityId, collectionId (read from original collection), model=event.model, sessionId=event.sessionId, traceId=event.traceId, turnId=event.turnId. This payload uses the event's values, not the merged activity fallback values. Then phase and signal in event options. No terminal-state guard is added beyond the observed activity check, and no cursor rollback occurs if persistence fails.

## Successful settlement and terminal publication

The recoverable region starts with runner input evaluation/invocation and extends through final expansion-event publication. On runner resolution, await writeArtifact with latest child-link snapshot.runId, the path below, result.response, and `{signal}`. Keep the port receiver. Path is `<artifactDirectory ?? artifacts/exec>/planners/<safeArtifactName(original collection.collectionId)>-<captured run count>.md`. Default applies only to null/undefined, not an empty directory. Do not reread the count from a port-mutable active collection.

After artifact settlement, call applyPlannerExpansion(latest child-link snapshot, activeCollection, result, original unseen array, next timestamp). With its returned snapshot, addArtifact using the artifact record below and another update timestamp. Construct completed activity and use upsertActivity with the next timestamp. The five timestamps are, in order: expansion, artifact.createdAt, artifact update, activity.completedAt, activity update. Do not merge clock calls or invent clocks.

Artifact record own fields in order: contentType=`text/markdown`, createdAt, label=`Planner <original collectionId>`, path=artifact.relativePath, phase.

Completed activity own fields in order: activityId, artifactPath=relativePath, completedAt, inputArtifactPaths, kind=`planner_agent`, outputArtifactPaths=[relativePath], parentSessionId, phase, conditional model field only if result.model truthy, sessionId=result.sessionId, startedAt, status=`completed`, traceId=result.traceId nullish fallback child trace traceId, turnId=result.turnId. sessionId and turnId are present even when undefined; do not inherit model/session/turn from child callbacks.

Await these four gates sequentially using the completed snapshot: writeSnapshot with `{signal}`; eventLog.appendExpansionRecords(completed, expansion, phase, signal); eventLog.emitEvent `planner_completed`; emitExpansionEvents(completed, expansion, original collection.collectionId, options, runtime). Completion message: `Planner completed for collection: <original collectionId>`. Payload own order: collectionId, edgeCount=expansion.addedEdges.length, nodeCount=expansion.addedNodes.length. After all gates return, expose the completed snapshot and IDs mapped from expansion.addedNodes in order. Keep original expansion object identity for both consumers.

## Recoverable failure and immutable publication facts

If anything in the recoverable region throws/rejects, inspect abortSignal.aborted at that catch boundary. If true, rethrow the caught value unchanged even if it differs from signal.reason. Otherwise create failure projection from the latest child-link snapshot and active collection, never the terminal completed projection. Previously performed side effects remain observable; no rollback or retry occurs.

Failure facts in observation order: message is error.message for Error, otherwise String(error); errorCount is activeCollection.errorCount default zero plus one; find linked activity by ID in latest child-link snapshot; exhausted is errorCount >= that snapshot.strategy.executor.maxConsecutiveErrors. Create failed collection preserving active collection fields, overriding errorCount, exhausted, then status (exhausted or draining). Update graph at original collection.collectionId using a timestamp. Construct failed activity with another timestamp for completedAt, then upsert with the next timestamp.

Failed activity own field order: activityId, completedAt, error=message, inputArtifactPaths, kind=`planner_agent`, conditional model only if linked.model truthy, outputArtifactPaths=fresh empty array, parentSessionId, phase, conditional sessionId only if linked.sessionId truthy, startedAt, status=`failed`, traceId=linked.traceId nullish fallback child trace traceId, conditional turnId only if linked.turnId truthy. Do not carry artifactPath into failure. traceId remains an own property even when undefined.

Before any failure write/record port, preserve the numeric errorCount and boolean exhausted as immutable observed facts. Publication ports are allowed to mutate the supplied failed collection. Such mutation must not change planner_failed's facts or the decision to emit collection_exhausted. For example, observed failure facts 1/true stay 1/true and still cause exhaustion emission even if a port changes collection.errorCount to 99 and collection.exhausted to false. This is required behavior, not a requirement to freeze objects or prohibit port mutation.

Await writeSnapshot(failed snapshot, {signal}); appendCollectionRecord(failed snapshot, failed collection, signal); emitEvent(failed snapshot, `planner_failed`, options). Failure event message is the captured message; payload field order collectionId (original collection), errorCount (captured), exhausted (captured). If captured exhausted is true, await emitEvent(failed snapshot, `collection_exhausted`, options) with message `Collection exhausted: <original collectionId>` and payload fields collectionId, reason=`planner_error_threshold`. Then return empty additions and failed snapshot. Errors from these failure-publication ports propagate unchanged; they do not recursively enter recovery.

## Dependency and observation discipline

Collection identity is `collectionId`, never `id`; graph nodes use `id`. Dependency signatures are in the API file. Call existing owners, rather than reconstructing their bodies. Normalization, membership, readiness/phase interpretation, graph/activity/artifact updates, session-link derivation, payload compaction, expansion, prompt formatting, trace IDs, event-log internals and exhaustion internals remain those owners' responsibility.

Preserve documented own-property presence/order, timestamp order, callback/await order, reference forwarding, receiver binding and rejection identity. Do not add sorting, deduplication, validation, clone-all, object freezing, cancellation policy, retries, or recovery outside the stated region. Undefined property presence is different from conditional omission. Artifact names, status labels, event names and messages here are fixed compatibility text, not discretionary prose.
