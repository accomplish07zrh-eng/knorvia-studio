# Final critic cycle — functional author packet

Implement the complete expert/critic-loop.ts module. Sole public native async export
runFinalCriticLoop(ctx,snapshot,definition,options). Production dependency APIs are
listed in api.d.ts. Read only these two packet files, save draft.ts and hash it before
curator review. Private names/data representation are your choice; no new policy,
retry queue, guard, interpreter, external IO or helper extraction-only design.

## State and admission

One per-call accepted snapshot reference, initially the input. Context owns
projections, clock and effects; lifecycle helper owns node reopening. Retain passed
references and method receivers. No initial abort guard and no local recovery catch
around the whole cycle. Resolve the first ctx.definition.phases definition whose
behavior is scheduled_graph before starting, even with zero permitted iterations.
Absence rejects Error(`${ctx.definition.title} definition is missing a scheduled graph phase`).

Iteration numbers start at 1, rise by 1 after each execution pass, and continue while
the current snapshot's strategy.finalCritic.maxIterations admits that number. Read
that bound live, not once at admission. Each cycle has sequential native await gates:

- appendEvent(current.runId,critic_started,{message:`Final critic iteration ${iteration} started.`,payload:{iteration},phase:definition.phase,signal:options.abortSignal})
- runPhase(ctx,current,definition,options), accepting returned snapshot after settlement;
  then parseCriticResult(result.response).
- pass: appendEvent critic_passed, message reasoning OR `Final critic iteration ${iteration} passed.`, ordered payload acceptanceGaps,iteration; ordered options message,payload,phase,signal; return exact current reference after await.
- fail: dedupeReopenProposals(critic.reopenProposals), then appendEvent critic_failed,
  message reasoning OR `Final critic iteration ${iteration} failed.`, ordered payload
  acceptanceGaps,iteration,reopenProposals; options message,payload,phase,signal.
  Return current after await if the live proposal array length is zero.

Parser, deduper, runner and publication errors propagate unchanged. Publication
ports may mutate ordinary passed payload/proposal objects; do not clone/freeze them
or pre-read later fields across await gates. Proposal traversal preserves ordinary
array iteration and all references. No concurrent execution.

## Node admission and publication

Each proposal is admitted through a native async suboperation, awaited by the cycle
on success and rejection alike. Capture options.abortSignal at call time. Inside a
recoverable region: call reopenWorkflowGraphNode(current,{maxReopens:2,nodeId:proposal.nodeId,
reason:proposal.reason,timestamp:ctx.timestamp()}); map its result to ordered fields
reopenAttempts,result.snapshot, preserving snapshot identity. Catch covers helper,
clock and result projection. On catch derive Error.message OR String(error), then
await ctx.appendEvent(input.runId,critic_failed, options with ordered fields:
message=`Critic reopen rejected for ${proposal.nodeId}: ${message}`,
payload={iteration,nodeId:proposal.nodeId,reason:proposal.reason,rejected:true},
phase=critic phase,signal=captured signal). Return null after await. Failure of this
rejection event itself propagates; no nested catch.

For null admission, continue proposals. Otherwise accept admitted snapshot, append
proposal.nodeId to this cycle's accepted ID list, then native-await store.writeSnapshot
(current,{signal:options.abortSignal}). Next call and await a native async graph-record
suboperation (keep its additional settlement boundary). Its signal is captured at
call time. It awaits store.appendGraphRecord(current.runId,record,{signal}), record
ordered keys nodeId:proposal.nodeId,payload:{iteration,reason:proposal.reason,
reopenAttempts,severity:proposal.severity},phase:critic phase,recordType:"op",
runId:current.runId,status:"pending",timestamp:ctx.timestamp(),type:"reopen_node".
Finally await ctx.appendEvent(current.runId,node_reopened, ordered options
message=`Node reopened by final critic: ${proposal.nodeId}`,nodeId:proposal.nodeId,
payload:{iteration,reason:proposal.reason,reopenAttempts,severity:proposal.severity},
phase:critic phase,signal:options.abortSignal). These publication failures are outside
admission recovery. Snapshot acceptance precedes its write; no rollback.

If no proposal was accepted, return current. Otherwise build retry reason
`Final critic reopened node(s): ${acceptedIds.join(", ")}` using accepted IDs in order.
Reset execution phase first, critic phase second. Each reset is synchronous and
produces a new snapshot: shallow-spread input fields, overwrite currentPhase,
graph (ordered collections=input collections,edges=input edges,nodes=projected array),
phases=projected array,updatedAt=ctx.timestamp() last. Node projection preserves
nonmatching references; matching node.id===phaseNodeId(phase) AND kind===phase becomes
{...node,error:reason,status:"pending"}. Phase projection preserves nonmatching refs;
all matching entries become exactly {error:reason,phase,status:"pending"}, deliberately
dropping other phase metadata. Keep activities/artifacts/collection/edge references.
No timestamp or lifecycle repair may be inserted into the map. Reuse phaseNodeId.

Await reset snapshot write with current options signal; await pending graph status
for execution phase; await pending graph status for critic phase; then await
runScheduledPhase(ctx,current,executionDefinition,options), accepting its returned
snapshot before advancing iteration. Execute this scheduling even after the last
permitted critic iteration. Manual retry-state is separate and unchanged.

## Exhaustion

When iteration admission ends (including initial zero limit), ctx.updatePhase(current,
definition.phase,{completedAt:ctx.timestamp(),error:"Final critic iteration limit reached.",
status:"failed"}); accept it. Await snapshot write, graph failed, then event
critic_iteration_limit_reached with ordered options message identical error text,
payload:{maxIterations:current.strategy.finalCritic.maxIterations},phase,signal.
Read that payload value after earlier publication awaits. Return exact current ref.
No errors are swallowed here; abort policy stays in dependencies/caller.

This packet is source-derived by an exposed curator. Fixed protocol/prose, ordinary
map/loop/field idioms and mandatory await boundaries can match earlier expression;
no absolute clean-room or whole-file licence claim follows from the author workflow.
