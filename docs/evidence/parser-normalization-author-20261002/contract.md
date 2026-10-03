# Expert artifact parsers — functional/API-only packet

Write complete five modules listed in api.json, with exact existing public exports.
Read only this contract and api.json. Save drafts preserving relative parsers/ path
in this author directory, report hashes before curator review. No old source/history,
body/oracle/test reads, live IO, extra agents, generic framework or changed schemas.
Actual @knorvia/contracts types/schemas remain dependencies. Schema safeParse returns
its exact .data on success, null/error paths below unchanged. All functions synchronous.

## json.ts lexical/alias owner

parsePlannerJson: trim string. If starts with '{', JSON.parse entire trimmed string
and propagate parse error. Else find FIRST fence using exact grammar
/```(?:json)?\s*([\s\S]*?)\s*```/ (case sensitive, no flags); if capture[1] truthy,
JSON.parse it (propagate). Else first '{' and last '}', if start>=0 and end>start,
parse inclusive substring. Else Error("Workflow planner did not return JSON graph expansion data").
Do not add raw-array admission, tolerant parse or fallback after JSON.parse error.

isRecord = typeof object AND nonnull AND not Array (Date objects qualify).
stringValue accepts only string, trims, returns undefined for empty trimmed value.
readLooseValue: direct keys in requested order; first `key in record` returns that
record value, including inherited/undefined. Otherwise normalize requested keys
(trim/lowercase/remove all non-ASCII-alphanumeric using /[^a-z0-9]/g), drop empty,
then first Object.entries(record) key whose normalized form matches yields its value.
Empty normalized key set returns undefined before enumerating. No later aliases
when an admitted first alias value has wrong type. Wrapper array accepts arrays,
string delegates stringValue, string-array maps stringValue/drops undefined without
deduplication, boolean accepts only boolean, positive integer accepts typeof number
+ Number.isInteger + >0 (no safe-integer restriction). Preserve refs/array order.

## graph-seed.ts

parseWorkflowGraphSeed catches only parsePlannerJson failure -> null; then normalize
candidate OUTSIDE catch. normalize arrays: if every collection-like, recursively
wrap {collections:value}; else if every node-like wrap {nodes:value}; else if every
edge-like wrap {edges:value}. Priority includes empty array (every true). Otherwise
nonrecord -> null. On record read node aliases [nodes,newNodes,new_nodes], edge aliases
[edges,newEdges,new_edges], collections alias [collections] with nullish fallback to
[value] when collection-like. Normalize nodes first, edges second, collections third,
drop null entries; safeParse WorkflowGraphSeedSchema with ordered fields collections,
edges,nodes,reasoning=stringValue(value.reasoning); return data or null.

Node record normalization: id from [id,name,nodeName,node_name] or null. title from
[title,summary] nullishly id; dependencies from [dependsOn,depends_on,references,inputs]
string array nullishly []; ordered output collectionId from [collectionId,collection_id,collection],
dependsOn,description [description,goal],id,kind=phase iff value.kind==='phase' else task,
phase [phase] nullishly defaultPhase,prompt [prompt,instructions],title. Optional keys
are present with undefined. Edge: record + from[source alias] and to[target alias]
nonempty strings, return {from,to} else null.
Collection: id aliases [collectionId,collection_id,name,id,collectionsname] required;
ordered fields collectionId,explorable boolean [explorable],frontierTarget positive
integer [frontierTarget,frontier_target],goal string [goal],metric [metric],nodeIds
string array [nodeIds,node_ids,nodeNames,node_names] nullishly [],phase [phase] nullishly
defaultPhase,title [title] nullishly collectionId.

Heuristics (record required, OR short-circuit order below): collection-like string
loose [collectionId,collection_id,name,id], OR array loose [nodeIds,node_ids,nodeNames,node_names],
OR string loose [goal], OR string [metric], OR boolean [explorable]. Node-like value.kind
task/phase OR string loose [id,name,nodeName,node_name] OR string [description,goal]
OR array [dependsOn,depends_on,references,inputs]. Edge-like string loose [from,source]
OR string [to,target]. Do not merge/upgrade these predicates.

gateRootSeedNodes: incoming IDs from all seed.edges.to; roots are seed.nodes with
(dependsOn??[]).length===0 AND id not incoming. If no roots return ORIGINAL seed.
Otherwise retain existing edges in new array; for roots in node order, append
{from:gateNodeId,to:rootId} only if its edgeId isn't in evolving edge-key Set. Existing
edge duplicates remain. Return {...seed,edges,newNodesMap}; root nodes cloned with
...node,dependsOn=[...new Set([...(node.dependsOn??[]),gateNodeId])]; nonroots same refs.
edgeId dependency from ../ids.js is fixed `${from}->${to}`; preserve all aliases/order.

## node-prompts.ts

parse catches only parsePlannerJson errors -> null. Array candidates recursively
wrap {nodes:value}; nonrecord null. First WorkflowNodePromptUpdateSetSchema.safeParse
raw; if success AND nodes.length>0 return exact data. Otherwise read array aliases
[nodes,nodePrompts,node_prompts,nodeInstructions,node_instructions], then keyed-map
value aliases [nodePrompts,node_prompts,nodeInstructions,node_instructions,prompts].
Keyed map: nonrecord -> []; Object.entries yields string entry->{id:key,prompt:entry};
record entry->{id:key,...entry} (entry id overrides key); other entry->{id:key}.
Concatenate array candidates then keyed candidates, normalize/drop null, safeParse
set with {nodes,reasoning:stringValue(value.reasoning)}; return data or null. Do not
dedupe, lose order, discard duplicates, or suppress map when an array exists.
Normalize node: record, id aliases [id,name,nodeId,node_id,nodeName,node_name] required;
prompt aliases [prompt,instructions,instruction,rules,metaPrompt,meta_prompt,nodePrompt,node_prompt];
description [description,objective,goal,summary]; title [title]; safeParse individual
WorkflowNodePromptUpdateSchema with ordered description,id,prompt,title; data or null.

## planner-result.ts

parsePlannerJson (errors propagate), then WorkflowGraphPlannerResultSchema.safeParse
raw FIRST; return data on success. If nonrecord otherwise Error("Workflow planner did not return JSON graph expansion data").
Normalize seed using graph-seed's exported function. collectionNodeIds from loose
[collectionNodeIds,collection_node_ids,collectionUpdates,collection_updates] string
array nullishly seed?.collections.flatMap(c=>c.nodeIds). safeParse planner result
ordered collectionNodeIds,edges=seed?.edges??[],exhausted loose boolean [exhausted],
nodes=seed?.nodes??[],reasoning=stringValue(raw.reasoning); data or same Error. No newcatch.

## critic.ts

parse raw using parsePlannerJson; normalize; null -> Error("Workflow critic did not return JSON verdict data").
Nonrecord null. Legacy trigger OR priority: Array acceptance_gaps, string overallVerdict,
boolean passed, Array reopenNodes, Array reopen_proposals. Without legacy, direct
WorkflowCriticResultSchema.safeParse raw first and return data on success. Normalize:
verdict: literal pass/fail first, else boolean passed -> pass/fail, else string
overallVerdict approved/conditionallyApproved -> pass, any other string -> fail;
otherwise null. reasoning = stringValue(reasoning) ?? stringValue(summary) ?? (raw
verdict string OR "", not trimmed in last fallback). Proposal source first array
reopenProposals, else reopen_proposals, else reopenNodes mapped to {nodeId,reason:
reasoning||"critic requested reopen"}, else []. Proposal normalize: record; nodeId
via stringValue(nodeId)??node_id??nodeName??node_name; reason via reason??issue (each
stringValue); both required. severity only critical/major/minor included; safeParse
WorkflowCriticReopenProposalSchema {nodeId,reason,...severity}; data or null. Drop null.
Gaps first acceptanceGaps array, else acceptance_gaps array, else [], each map
stringValue/drop undefined. safeParse result ordered acceptanceGaps,reasoning,
reopenProposals,verdict; data/null. No new legacy vocabulary/schema changes.
dedupeReopenProposals: first nodeId occurrence wins, preserve original proposal refs
and order, do not mutate input.

Schema/runtime imports are API facts; all fixed error and model protocol text must
remain exact. This source-derived packet is curated with exposure; fresh author
has body-free inputs on shared filesystem, not an absolute clean room or rights grant.
