# Expert prompt and status rendering — functional/API-only packet

Author prompts.ts and formatters.ts using api.json. Read only these two packet inputs;
no predecessor source/history/tests/oracles, other packets or services. Save and hash
before curator comparison. Fixed output prose below is deliberately retained contract
material, not newly authored prose or a rights clearance. Private representation is
choice; no novelty requirement. Preserve synchronous boundaries, output bytes,
references, call/field evaluation order described below. No framework needed.

Dependencies: workflowDefinitionPhaseMap from ../definition.js returns Map keyed phase;
phaseNodeId from ./ids.js. Types from @knorvia/contracts. No actual ports/IO.

## Common notation

Each listed output item is one line, joined with LF, with no extra terminal LF except
where a final blank item is explicit. {field} denotes template interpolation, with
normal JS conversion. Literal \n within an item means LF inside that same item.
Artifacts projection: in order, each `- {artifact.label}: {artifact.path}`, joined LF.
Artifact paragraph: nonempty projection -> `Previous artifacts available on disk:\n{projection}`;
empty -> `No previous artifacts yet.`. Preserve truthy tests and nullish distinctions.

## buildPhasePrompt

Compute artifact projection FIRST. Then if definition.seedGraphFromArtifact !== undefined,
compute architecture block below, else empty block. Then evaluate primary list in order:

    You are running the Knorvia Studio workflow phase: {definition.phase}.
    Workflow run: {snapshot.runId}
    Working directory: {snapshot.cwd}
    [blank]
    User task:\n{snapshot.task}
    [blank]
    Scheduling strategy:
    - Clarify max rounds: {strategy.clarify.maxRounds}, min rounds: {strategy.clarify.minRounds}, confidence threshold: {strategy.clarify.confidenceThreshold}
    - Executor frontier target: {strategy.executor.frontierTarget}, max concurrent loops: {strategy.executor.maxConcurrentLoops}, max planner runs: {strategy.executor.maxPlannerRuns}
    - React loop max rounds: {strategy.reactLoop.maxRounds}
    - Final critic max iterations: {strategy.finalCritic.maxIterations}
    [blank]
    Phase objective:\n{definition.description}
    [blank]
    [artifact paragraph]
    [architecture block, if present]
    [blank]
    Output a concise Markdown artifact for this phase. Preserve concrete file paths, commands, risks, and next actions. If this phase executes code, make the edits and run focused validation when practical.

Architecture block items:

    [blank]
    Architecture graph contract:
    Return a JSON object, either raw or fenced as ```json, so the workflow runtime can seed the {definition.seedGraphFromArtifact.targetPhase} DAG:
    {"nodes":[{"id":"implement_auth","title":"Implement auth","description":"small executable unit","dependsOn":["setup_config"],"collectionId":"implementation","prompt":"optional node-specific instructions"}],"edges":[{"from":"setup_config","to":"implement_auth"}],"collections":[{"collectionId":"implementation","title":"Implementation","nodeIds":["setup_config","implement_auth"],"explorable":false,"goal":"ship the feature","metric":"tests pass"}],"reasoning":"brief rationale"}
    Node ids must be unique, references must point to real node ids, and edges must not create cycles.

strategy means snapshot.strategy. Do not cache repeated live nested strategy reads.

## buildScheduledNodePrompt

First if node.phase===definition.phase AND node.kind==='phase', return buildPhasePrompt
with original references. Otherwise compute artifact projection, then list:

    You are running a Knorvia Studio workflow node inside phase: {definition.phase}.
    Workflow run: {snapshot.runId}
    Working directory: {snapshot.cwd}
    [blank]
    User task:\n{snapshot.task}
    [blank]
    Node: {node.title}
    Node id: {node.id}
    [truthy node.description only: Node objective:\n{node.description}]
    [truthy node.prompt only: Node prompt:\n{node.prompt}]
    [blank]
    Scheduling constraints:
    - Max concurrent loops: {snapshot.strategy.executor.maxConcurrentLoops}
    - React loop max rounds: {snapshot.strategy.reactLoop.maxRounds}
    [blank]
    [artifact paragraph]
    [blank]
    Execute only this node's scope. Return a concise Markdown artifact with changes, validation, and residual risk.

Omit undefined items only; preserve empty strings. Do not add phase defaults.

## buildScheduledPhaseSummary

First filter entire snapshot.activities by activity.phase===phase. Map selected refs
in order to `- {activity.nodeId ?? activity.activityId}: {activity.status}` plus truthy
artifactPath ` ({artifactPath})`, plus truthy error ` error={error}`. Then filter entire
snapshot.graph.nodes by node.phase===phase OR node.kind==='task' (all tasks regardless
phase), map to `- {id}: {status}` plus truthy attempts ` attempts={attempts}` then truthy
error ` error={error}`. Render:

    # {phase} Scheduler Summary
    [blank]
    Run: {snapshot.runId}
    Status: {snapshot.status}
    Updated: {snapshot.updatedAt}
    [blank]
    ## Nodes
    [blank]
    [node lines, or - No scheduled nodes.]
    [blank]
    ## Activities
    [blank]
    [activity lines, or - No activities.]
    [final blank]

## buildReport

First map snapshot.phases to `- {phase}: {status}` with truthy artifactPath suffix
` ({artifactPath})`. Then list order:

    # Workflow Report
    [blank]
    Run: {runId}
    Task: {task}
    Status: {status}
    Directory: {cwd}
    Created: {createdAt}
    Updated: {updatedAt}
    [blank]
    ## Phases
    [blank]
    [precomputed phase lines]
    [blank]
    ## Activities
    [blank]
    [all activities mapped now in order]
    [blank]
    ## Artifacts
    [blank]
    [all artifacts mapped now in order]
    [final blank]

Activity line `- {activity.phase}: {activity.status} ({activity.activityId})` plus truthy
sessionId ` session={sessionId}` then truthy turnId ` turn={turnId}`. Artifact lines
same common projection. Header fields snapshot. No no-items placeholders here.

## Graph helpers

createPhaseGraph: call workflowDefinitionPhaseMap(definition) first. Build all nodes
from definition.phaseOrder.map, lookup each phase; missing throws Error(`${definition.title}
definition is missing phase: ${phase}`) (single space, no embedded LF). Node ordered
fields: dependsOn fresh[],description=phaseDefinition.description,id=phaseNodeId(phaseDefinition.phase),
kind='phase',phase=phaseDefinition.phase,status='pending',title=phaseDefinition.title.
Only after all nodes built, for indexes1..definition.phaseOrder.length-1 (read live
length/order), read previous then current phase, create edge ordered from=phaseNodeId(previous),
to=phaseNodeId(current); assign nodes[index].dependsOn=[phaseNodeId(previous)]. Return
ordered {collections:fresh[],edges,nodes}. Duplicates stay, no validation/dedup policy.

updateGraphNodeStatus: falsy status returns exact original graph. Otherwise target
phaseNodeId(phase); new graph ordered collections=originalref,edges=originalref,nodes=map.
Only node.id===target && node.kind==='phase' gets shallow {...node,status}; others exact
refs. Extra graph fields dropped. Input immutable except newly built phase graph above.

## Status formatters

formatExpertWorkflowStatus header lines in order:

    Expert workflow {runId}
    Status: {status}
    Task: {task}
    Directory: {cwd}
    Updated: {updatedAt}
    [blank]
    Phases:

Then for each phase in order: first marker completed->[x], active->>, else->-; then
error detail truthy ` ({phase.error})`; then activity detail truthy activityId
` | activity {activityId}` plus truthy sessionId ` | session {sessionId}` (session
only admitted when activityId truthy). Append `  {marker} {phase.phase}: {phase.status}{activityDetail}{errorDetail}`.
Finally truthy reportPath appends blank then `Report: {reportPath}`. Join LF.

formatExpertWorkflowCompletion evaluates list `Expert workflow {runId} {status}.`,
`Task: {task}`, truthy reportPath `Report: {reportPath}` else undefined, filters by
Boolean, joins LF. No other output or defaults. API facts in api.json are authoritative.
