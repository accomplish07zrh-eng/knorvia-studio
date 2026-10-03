# Complete lifecycle and definition owner contract

Write complete implementations of lifecycle.ts and definition.ts matching the two public-api.d.ts inputs. Existing @knorvia/contracts schemas/types/session-link derivation are collaborators, not implementation to replace. lifecycle.ts owns synchronous immutable run-state projection; actual persistence, record/event publication and cancellation controllers remain with callers. Add no IO, Promise, clock, cache, lease, runtime policy, snapshot store or new public API.

Read only these inputs: contract.md, lifecycle-public-api.d.ts, definition-public-api.d.ts, dependency-api.d.ts, public-data-shapes.md and retained-configuration.json, plus your own outputs. No repository, AGENTS, history, source/test/review body, other-author, network or other scratch access. Curator has handled instructions and is source-exposed. This is an instruction-based shared-executor restriction, not OS isolation. Freeze complete outputs and author-record.json with UTC/read/input/output digest/byte metadata before compilation, tests or comparison, then stop. Do not edit production or publish. Report receipt bytes/digest separately; exclude its self-hash.

Implement both full owners, with private organization free. Public interfaces, constants, output/configuration text and required property/reference/order rules are retained compatibility boundaries; no artificial novelty requirement. Use normally readable formatting and keep each file below400 lines. You may add private lifecycle-*.ts helpers inside the same workflow directory if needed for size, provided they contain complete pure portions of this same lifecycle owner, introduce no independent state/store/API and import no other implementation. No scheduler graph/expert code is provided or to be used. Include all helper files in the frozen output receipt. definition.ts remains complete and self-contained; do not runtime-import the input JSON.

## Common projections and observable boundaries

Inputs are ordinary mutable public schema-shaped objects/arrays and valid iterable scopes. Proxy/getter/malformed schema behavior is not required; parsing collaborator calls and their ordinary mutation/error effects remain observable. Do not mutate input snapshots/nodes/phases/activities/edges/collections/updates, arrays or payloads. When unchanged, return the exact original snapshot and retained objects, not a clone. Changes shallow spread original snapshot so caller-specific fields survive; graph replacements are fresh ordinary objects with own keys collections,edges,nodes in that order, without spreading arbitrary old graph properties. Collections stays an own key even when undefined. Retain unrelated top-level fields and references, including persisted failure/recovery/session metadata. Arrays named below remain in original encounter order; duplicates are not globally normalized.

Lifecycle result objects have own key order activityIds,changed,nodeChanges,phaseIds,snapshot. Each node-change entry has own keys nodeId, optional phase only if truthy, status; empty phase is omitted. No new event or record belongs here. Exceptions escape unchanged and no partial candidate is returned; source remains unchanged even when a later item rejects.

Required reason strings (retained output vocabulary):
- Resume default: `Reset during workflow resume because the previous process stopped before completion.`
- Cancel default: `Workflow cancelled.`
- Reopen default: `Reopened by workflow critic.`
Reason overrides use nullish fallback, so an empty reason remains empty. Optional flags/numbers use the nullish rules specified below.

Closing a selected phase/activity: shallow spread original, then overrides completedAt=existing completedAt ?? supplied timestamp, error=existing error ?? reason, status=cancelled. Empty completedAt/error values are retained. Preserve other references/keys. Resetting a selected active phase for retry is deliberately destructive: produce only own keys error=reason,phase=original phase id,status=pending, discarding prior phase session/activity/time/artifact/error detail.

## reconcileWorkflowSnapshotForResume

Observe default reason first. If options.nodeIds is truthy consume it once into a Set; undefined scope means all nodes/phases/activities. An empty supplied scope is an explicit empty scope, not global. Capture resetActivities=options.resetActivities ?? true and resetPhases=options.resetPhases ?? true after scope consumption.

Process nodes first in graph order. Only nodes with status active and id in scope (or global) reset: append pending node-change, collect their phase only if truthy, and replace with shallow spread node followed by error=reason,status=pending. All other nodes retain reference. Resetting preserves attempts, dependsOn, reopenAttempts, kind and all other fields.

Process phases next in snapshot order. Select only if resetPhases, phase.status is active, and either global scope or phase.phase appears among the truthy phases of reset nodes. Append phase id and apply the destructive phase retry projection. Pending/terminal phases retain reference. A scoped phase with no newly reset active node does not reset.

Process activities last in snapshot order. Select only if resetActivities, activity.status is active, and either global scope, or truthy activity.nodeId is in the supplied node scope, or activity.phase appears among reset-node phases. The explicit node-id activity condition does not require that node to be active/present/reset. resetPhases=false does not suppress collection of reset-node phases or selection of associated activities. Append activity id and close as cancelled with options.timestamp observed for each selected activity.

changed is true if any node change/phase id/activity id exists. If false, result uses original snapshot; deriveWorkflowSessionLinks is not called. If true, return fresh snapshot spread then keys activities,graph,phases,sessionLinks,updatedAt in that order. graph={collections:old collections,edges:old edges,nodes:projected nodes}; activities/phases are the newly mapped full arrays even if no item changed in that array. sessionLinks is the exact returned result of deriveWorkflowSessionLinks({activities: projected activities,runId: current snapshot.runId}); call only after arrays/projection inputs prepared. updatedAt is then-current options.timestamp after derivation. The source snapshot retains its own status/completedAt/other top-level fields; this function does not mark run running.

## cancelWorkflowSnapshot

Use nullish default cancel reason. Process graph nodes, phases, activities in that order. Only active or pending statuses are cancellable; terminal completed/failed/skipped/cancelled remain reference-identical. Changed nodes shallow spread original then error=reason,status=cancelled; node error is overwritten even if previously set. Phase/activity close preserves existing non-nullish error/completedAt. Append node changes/phase ids/activity ids in encounter order.

changed if run status is not cancelled OR run completedAt differs from current options.timestamp OR any list is nonempty. Consequently cancelling an already cancelled run at a different timestamp changes its top-level time even if all children are terminal. No-op at same timestamp returns original snapshot and does not derive session links.

Changed snapshot: shallow spread original then own override order activities,completedAt,graph,phases,sessionLinks,status,updatedAt. completedAt uses current options.timestamp before session derivation. graph is fresh collections/edges/nodes using original collection/edge references and mapped nodes; phases/activities are complete newly mapped arrays. Session links derive once with exactly projected activities and current runId, then status=cancelled and updatedAt uses then-current options.timestamp. Preserve failure/recovery metadata; do not abort controllers or write records here.

## reopenWorkflowGraphNode

Find first node with id equal current options.nodeId. No match throws exactly `Workflow graph node not found: NODEID`. Reject status except completed,failed,skipped with `Cannot reopen workflow node "NODEID": status is "STATUS", expected completed, failed, or skipped`. Check status before budget. maxReopens=options.maxReopens ?? 2, old attempts=first node.reopenAttempts ?? 0; if old >= maximum throw `Workflow node "NODEID" already reopened COUNTx (max=MAX)`. Zero/negative budget is not normalized. Next attempts=old+1; reason uses reopen nullish default.

Map all original nodes, replacing every item whose id equals options.nodeId with a shallow spread then own overrides error=reason,reopenAttempts=next,status=pending. Duplicate ids, if present in an ordinary supplied snapshot, all receive the attempts based on first match. Other nodes retain reference. Return own key order changed=true,nodeChange from the first original node with pending status,reopenAttempts=next,snapshot. Snapshot spread then graph={collections:original,edges:original,nodes:mapped},updatedAt=current timestamp. No phase/activity/session-link recomputation, completion clearing or graph dependency changes; prior completed metadata remains. No session derivation call.

## applyWorkflowGraphSeed: schema and nodes

First call WorkflowGraphSeedSchema.parse(seed), with schema receiver, once. Use its result, not original seed; parser failures escape unchanged. After parsing, inspect current snapshot graph. Parsed arrays have schema defaults. Valid unknown fields/normalization are owned by the schema; do not reconstruct schema bodies.

For parsed nodes in order: reject id already in existing graph node ids or prior parsed ids with `Workflow graph seed returned duplicate node: ID`. Create each added node with own field order collectionId,dependsOn,description,id,kind,phase,prompt,status,title. Include optional keys even if undefined. dependsOn is a fresh ordered list of first occurrences of nonempty strings (no trim; whitespace retained). kind=node.kind ?? task, phase=node.phase ?? options.phase, status=pending. Description/prompt/title/id/collectionId retain parsed values. No attempts/reopenAttempts/errors or unknown node keys are introduced. None of these new values is written into source snapshot.

## Seed edges and validation order

Start addedEdges as all parsed explicit edges, each projected to a fresh {from,to} object in that order; do not trim/dedup/filter explicit edges. Build known edge ids from existing edges and explicit projections, using exact string FROM->TO (no escaping; identical encoded ids count as duplicates even if endpoints differ). Then visit added nodes and each normalized dependsOn in order: create dependency-to-node edge only if its encoded id is not already known, append and remember it. Explicit existing duplicate edges are still included and will fail validation; skip only synthesized dependency edges already known. An explicit dependency edge whose endpoints are valid is not duplicated.

Validate added edges in their completed order against combined existing+added node ids and incremental pending existing+previously accepted edges. For each edge, check in this precedence:
1. from===to: `Workflow graph seed returned a self-loop edge: FROM -> TO`
2. unknown from: `Workflow graph seed returned an edge with unknown source node: FROM`
3. unknown to: `Workflow graph seed returned an edge with unknown target node: TO`
4. encoded id already in existing or earlier accepted edges: `Workflow graph seed returned duplicate edge: FROM->TO`
5. proposed edge closes directed cycle: `Workflow graph seed returned an edge that would create a cycle: FROM->TO`.
Cycle means an existing/incrementally accepted directed path from proposed to back to proposed from. Traverse with visited ids so unrelated preexisting cycles cannot loop forever; no new whole-graph validation/reorder. Only accept the edge into pending/seen state after all checks. All edge validation precedes collection validation. Do not call scheduler graph helpers or introduce graph scheduling policy.

## Seed collections and result

Known node ids are existing plus added. Existing collection ids come from snapshot.graph.collections ?? []. Visit parsed collections in order. Reject an existing/prior parsed id with `Workflow graph seed returned duplicate collection: COLLECTIONID`. For that collection build ordered nodeIds: explicit collection.nodeIds ?? [] first, then added-node ids whose collectionId equals this id, remove empty strings and duplicates preserving first appearance. Existing nodes merely having matching collectionId are not implicitly added. Validate each resulting nodeId against known nodes in order; unknown throws `Workflow graph seed collection "COLLECTIONID" references unknown node: NODEID`.

Project each added collection with own key order collectionId,explorable,frontierTarget,goal,metric,nodeIds,phase,title. Include optional keys even undefined. phase uses parsed collection.phase ?? options.phase. No inferred exhausted/status/error counts/time/planner fields or unknown keys.

changed if any added node/edge/collection. Return own order addedCollections,addedEdges,addedNodes,changed,snapshot. If false return original snapshot. If true snapshot shallow spread then graph,updatedAt. graph fresh own collection/edge/node keys; each full array is a fresh concatenation preserving existing order/references then added order/references. collections previously undefined becomes the fresh added list even when only nodes/edges changed. added arrays are separately returned; snapshot elements share objects with those arrays, not clones. No session derivation. timestamp observed when final projection constructed.

## applyWorkflowNodePromptUpdates

Call WorkflowNodePromptUpdateSetSchema.parse({nodes:updates}) once, with fresh sole nodes key retaining caller array reference; schema receiver/errors/results remain authoritative. Build ordered id-to-update map from parsed nodes; duplicate id throws `Workflow node prompt update returned duplicate node: ID` before checking known nodes/phases. Empty map returns {changed:false,snapshot:original,updatedNodes:[]} without reading graph. Validate each update id against original graph ids in map insertion order: unknown throws `Workflow node prompt update references unknown node: ID` before any node projection.

Map graph nodes in original order. No update -> original ref. If update exists, require node.phase either undefined or equal current options.phase; even empty phase is defined and can conflict. Error: `Workflow node prompt update for "ID" targets phase "OPTIONS_PHASE" but node belongs to "NODE_PHASE"`. This gate precedes field equality, so unchanged requested values still throw on a foreign phase.

Construct fresh node shallow spread then description=update.description ?? old.description, prompt=update.prompt ?? old.prompt, title=update.title ?? old.title. Compare these three values strictly to old values; if all equal, discard candidate and retain old ref; do not report as changed just because optional own keys were present in candidate. Otherwise append that exact candidate to updatedNodes and use it in mapped nodes. Duplicated graph ids, if supplied, can all receive the same parsed update; updatedNodes is graph order, not input update order. Any later phase error still leaves source unchanged and no candidate returned.

If zero updatedNodes return own changed=false,snapshot=original,updatedNodes=fresh []. If positive return own order changed=true,snapshot,updatedNodes; snapshot shallow spread then graph={collections:old,edges:old,nodes:mapped},updatedAt=current timestamp. Preserve all unrelated references including activities/phases/sessionLinks; do not parse snapshot or derive links.

## definition.ts: retained configuration and small construction/index surface

Export primitive constants and mutable DEFAULT_EXPERT_WORKFLOW_STRATEGY at their public declarations. The complete exact source-derived configuration, phase titles, prose, paths, metadata and order are in retained-configuration.json; these are retained material, not new prose or discretionary implementation authored from scratch. PublicBinding records denote actual public values, not nested JSON objects. The strategy export is an ordinary mutable singleton with the listed own/nested key order; no freeze/readonly/cloning or hidden alternate strategy. Mutations by consumers are observable by later construction.

createExpertWorkflowDefinition has no args. Each invocation builds a fresh full definition parse input with exactly retained keys/configuration order and fresh phaseOrder/phases/nested phase metadata objects; the strategy field is the current exported DEFAULT_EXPERT_WORKFLOW_STRATEGY singleton by reference. Primitive public constants supply their fields. It calls existing WorkflowDefinitionSchema.parse with schema receiver exactly once and returns the exact parser result, with no extra clone/validation/catch/cache. All parse normalization/errors remain schema-owned. Do not import input JSON at runtime or hold previously mutated phase objects across calls. This is a small configuration constructor, not a separate normalization algorithm.

workflowDefinitionPhaseMap returns a fresh native Map for every call. Visit definition.phases in order; key each by phase.phase and value the exact original phase object. Repeated phase keys overwrite value while keeping original insertion position. Empty phases produces empty Map even if a separately validated definition usually requires nonempty. No clone/parse/sort/reject/dedup side policy. Ordinary Map/loop/map idioms are allowed and need no artificial textual difference.
