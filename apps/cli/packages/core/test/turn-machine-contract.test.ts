import assert from "node:assert/strict";
import { test } from "node:test";
import type { PendingTurnInput, SessionId, ToolCallId, TraceId, TurnId } from "@knorvia/contracts";
import { TurnMachineImpl } from "../src/agent/turn-machine.js";
import {
  TurnPhase,
  type PermissionDecision,
  type ToolCallState,
  type TurnState,
} from "../src/agent/turn-state.js";

const CALL_ID = "owned-call" as ToolCallId;

function machine(patch: Partial<TurnState> = {}): TurnMachineImpl {
  const initial = TurnMachineImpl.create(
    "owned-session" as SessionId,
    1,
    "owned input",
    "owned-trace" as TraceId,
    "owned-turn" as TurnId,
  );
  return new TurnMachineImpl({ ...initial.state, ...patch });
}

function call(patch: Partial<ToolCallState> = {}): ToolCallState {
  return { id: CALL_ID, name: "synthetic", input: {}, status: "scheduled", ...patch };
}

test("transitions return projections without committing state, including after public state replacement", () => {
  const owner = machine();
  const initial = owner.state;
  const started = owner.start();
  assert.equal(started.phase, TurnPhase.ProcessingInput);
  assert.notEqual(started, initial);
  assert.equal(owner.state, initial);
  assert.equal(initial.phase, TurnPhase.Idle);
  const replacement = machine({ phase: TurnPhase.AggregatingResults }).state;
  owner.state = replacement;
  const messages = [{ role: "user" as const, content: "owned" }];
  const requested = owner.startModelRequest("synthetic-model", messages);
  assert.equal(owner.state, replacement);
  assert.equal(requested.modelRequest?.messages, messages);
  assert.equal(requested.phase, TurnPhase.AwaitingModelResponse);
});

test("supplied empty ids survive nullish defaults and model admission retains its error", () => {
  const owner = TurnMachineImpl.create(
    "owned-session" as SessionId, 1, "", "" as TraceId, "" as TurnId,
  );
  assert.equal(owner.state.id, "");
  assert.equal(owner.state.traceId, "");
  assert.throws(() => owner.startModelRequest("synthetic", []), {
    message: "Must be in ProcessingInput or AggregatingResults phase",
  });
  assert.throws(() => owner.aggregateResults(), {
    message: "Cannot transition from idle to aggregating_results",
  });
});

test("streaming appends text and schedule projection strips extras while retaining schedule identity", () => {
  const owner = machine({ phase: TurnPhase.AwaitingModelResponse, streamingContent: "prefix" });
  assert.equal(owner.receiveModelResponse(" one").streamingContent, "prefix one");
  owner.state = machine({ phase: TurnPhase.Streaming, streamingContent: "prefix" }).state;
  assert.equal(owner.addStreamingContent(" two").streamingContent, "prefix two");
  const input = { id: CALL_ID, name: "synthetic", input: {}, extra: "must not project" };
  const schedule = { items: [], parallelGroups: [], executionOrder: [CALL_ID] };
  const projected = owner.scheduleTools([input, input], schedule);
  assert.equal(projected.scheduledTools, schedule);
  assert.equal(projected.toolCalls[0].input, input.input);
  assert.deepEqual(Object.keys(projected.toolCalls[0]), ["id", "name", "input", "status", "scheduledAt"]);
  assert.notEqual(projected.toolCalls[0], projected.toolCalls[1]);
  assert.notEqual(projected.toolCalls[0].scheduledAt, projected.toolCalls[1].scheduledAt);
});

test("tool execution clones every call and preserves waiting timestamps", () => {
  const waiting = call({ status: "waiting_permission", startedAt: new Date(0) });
  const scheduled = call({ id: "second" as ToolCallId });
  const owner = machine({ phase: TurnPhase.SchedulingTools, toolCalls: [waiting, scheduled] });
  const projected = owner.startToolExecution();
  assert.equal(projected.phase, TurnPhase.AwaitingPermission);
  assert.notEqual(projected.toolCalls[0], waiting);
  assert.equal(projected.toolCalls[0].status, "waiting_permission");
  assert.equal(projected.toolCalls[0].startedAt, waiting.startedAt);
  assert.equal(projected.toolCalls[1].status, "running");
  assert.ok(projected.toolCalls[1].startedAt instanceof Date);
  assert.equal(scheduled.status, "scheduled");
});

test("completion updates all duplicate ids, preserves nonmatches and appends unmatched results", () => {
  const one = call();
  const duplicate = call();
  const untouched = call({ id: "other" as ToolCallId });
  const owner = machine({ toolCalls: [one, untouched, duplicate] });
  const completed = owner.completeTool(CALL_ID, { success: true, content: "owned result" });
  assert.equal(completed.toolCalls[1], untouched);
  assert.equal(completed.toolCalls[0].status, "completed");
  assert.equal(completed.toolCalls[2].status, "completed");
  assert.notEqual(completed.toolCalls[0].completedAt, completed.toolCalls[2].completedAt);
  assert.deepEqual(Object.keys(completed.toolCalls[0].result!), ["success", "content"]);
  assert.equal(Object.hasOwn(completed.toolResults[0], "error"), true);
  assert.equal(completed.toolResults[0].error, undefined);
  assert.equal(one.status, "scheduled");
  const unmatched = owner.completeTool("missing" as ToolCallId, { success: false, content: "failed result" });
  assert.equal(unmatched.toolResults.length, 1);
  assert.equal(unmatched.toolCalls[0], one);
  assert.deepEqual(unmatched.toolResults[0].error, {
    type: "tool_error", message: "failed result", recoverable: true,
  });
});

test("pending input enqueue/drain share records and preserve the original drain array", () => {
  const first = { kind: "synthetic-first" } as unknown as PendingTurnInput;
  const second = { kind: "synthetic-second" } as unknown as PendingTurnInput;
  const inputs = [first];
  const owner = machine({ pendingInputs: inputs });
  const queued = owner.queuePendingInput(second);
  assert.deepEqual(queued.pendingInputs, [first, second]);
  assert.notEqual(queued.pendingInputs, inputs);
  assert.equal(queued.pendingInputs[0], first);
  const drained = owner.drainPendingInputs();
  assert.equal(drained.inputs, inputs);
  assert.deepEqual(drained.state.pendingInputs, []);
  assert.notEqual(drained.state.pendingInputs, inputs);
  assert.equal(owner.state.pendingInputs, inputs);
});

test("permission projection shares requests, edits every duplicate and honors all nullish decisions", () => {
  const input = { original: true };
  const first = call({ input });
  const duplicate = call({ input });
  const unrelated = call({ id: "other" as ToolCallId });
  const request = { toolCallId: CALL_ID, toolName: "synthetic", riskLevel: "low", requestedAt: new Date(0) };
  const owner = machine({ phase: TurnPhase.SchedulingTools, toolCalls: [first, duplicate, unrelated] });
  const requested = owner.requestPermission(request);
  assert.equal(requested.pendingPermissions[0], request);
  assert.equal(requested.toolCalls[2], unrelated);
  assert.equal(requested.toolCalls[0].status, "waiting_permission");
  assert.equal(first.status, "scheduled");
  for (const decision of ["deny", "allow", "modify", "escalate"] as PermissionDecision[]) {
    for (const modified of [false, 0, "", null, undefined]) {
      const instance = machine({ ...requested, pendingPermissions: [request, request] });
      const projected = instance.resolvePermission(CALL_ID, decision, modified);
      assert.deepEqual(projected.pendingPermissions, []);
      assert.equal(projected.toolCalls[2], unrelated);
      assert.equal(projected.toolCalls[0].input, modified ?? input);
      assert.equal(projected.toolCalls[1].input, modified ?? input);
      assert.equal(projected.toolCalls[0].status, decision === "deny" ? "permission_denied" : "waiting_permission");
      assert.equal(projected.resolvedPermissions.at(-1)?.modifiedInput, modified);
      assert.ok(projected.resolvedPermissions.at(-1)?.resolvedAt instanceof Date);
    }
  }
});

test("next phase preserves running/waiting gates and failed/denied precedence", () => {
  assert.equal(machine({ phase: TurnPhase.Streaming, streamingContent: "owned" }).getNextPhase(), TurnPhase.Completing);
  assert.equal(machine({ phase: TurnPhase.Streaming, streamingContent: "owned", toolCalls: [call()] }).getNextPhase(), TurnPhase.SchedulingTools);
  for (const status of ["running", "waiting_permission"] as const) {
    assert.equal(machine({ phase: TurnPhase.ExecutingTools, toolCalls: [call({ status })] }).getNextPhase(), TurnPhase.ExecutingTools);
  }
  assert.equal(machine({ phase: TurnPhase.ExecutingTools }).getNextPhase(), TurnPhase.AggregatingResults);
  assert.equal(machine({ phase: TurnPhase.AggregatingResults }).getNextPhase(), TurnPhase.AwaitingModelResponse);
  for (const status of ["failed", "permission_denied"] as const) {
    assert.equal(machine({ phase: TurnPhase.AggregatingResults, toolCalls: [call({ status })] }).getNextPhase(), TurnPhase.Completing);
  }
});

test("complete validates while fail bypasses validation and retains error identity", () => {
  const owner = machine({ phase: TurnPhase.Streaming });
  const completed = owner.complete("owned response");
  assert.equal(completed.finalResponse, "owned response");
  assert.equal(completed.resultType, "success");
  assert.ok(completed.completedAt instanceof Date);
  assert.equal(new TurnMachineImpl(completed).isComplete(), true);
  assert.equal(owner.state.phase, TurnPhase.Streaming);
  const error = { type: "owned", message: "fixture", recoverable: false };
  const failed = machine().fail(error);
  assert.equal(failed.error, error);
  assert.equal(failed.phase, TurnPhase.Error);
  assert.ok(failed.completedAt instanceof Date);
});
