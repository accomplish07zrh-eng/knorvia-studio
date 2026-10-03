import type { ToolCallId } from "@knorvia/contracts";
import type { PermissionDecision, ToolCall, ToolCallState, ToolResultState } from "./turn-state.js";

export const TurnCallStatus = {
  Scheduled: "scheduled",
  Waiting: "waiting_permission",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Denied: "permission_denied",
} as const;

type ToolCompletion = Pick<ToolResultState, "success" | "content">;

function editMatching(
  calls: ToolCallState[],
  id: ToolCallId,
  edit: (call: ToolCallState) => void,
): ToolCallState[] {
  const projected = new Array<ToolCallState>(calls.length);
  calls.forEach((call, index) => {
    if (call.id !== id) {
      projected[index] = call;
      return;
    }
    const changed = { ...call };
    edit(changed);
    projected[index] = changed;
  });
  return projected;
}

export function scheduleToolCalls(calls: ToolCall[]): ToolCallState[] {
  const projected = new Array<ToolCallState>(calls.length);
  calls.forEach((call, index) => {
    projected[index] = {
      id: call.id as ToolCallId,
      name: call.name,
      input: call.input,
      status: TurnCallStatus.Scheduled,
      scheduledAt: new Date(),
    };
  });
  return projected;
}

export function beginToolCalls(calls: ToolCallState[]): ToolCallState[] {
  const projected = new Array<ToolCallState>(calls.length);
  calls.forEach((call, index) => {
    const waiting = call.status === TurnCallStatus.Waiting;
    const changed = { ...call };
    changed.status = waiting ? call.status : TurnCallStatus.Running;
    changed.startedAt = waiting ? call.startedAt : new Date();
    projected[index] = changed;
  });
  return projected;
}

export function finishToolCalls(
  calls: ToolCallState[],
  id: ToolCallId,
  result: ToolCompletion,
): ToolCallState[] {
  return editMatching(calls, id, (call) => {
    call.status = result.success ? TurnCallStatus.Completed : TurnCallStatus.Failed;
    call.completedAt = new Date();
    call.result = { success: result.success, content: result.content };
  });
}

export function waitForToolPermission(calls: ToolCallState[], id: ToolCallId): ToolCallState[] {
  return editMatching(calls, id, (call) => {
    call.status = TurnCallStatus.Waiting;
  });
}

export function decideToolCalls(
  calls: ToolCallState[],
  id: ToolCallId,
  decision: PermissionDecision,
  modifiedInput?: unknown,
): ToolCallState[] {
  return editMatching(calls, id, (call) => {
    call.status = decision === "deny" ? TurnCallStatus.Denied : call.status;
    call.input = modifiedInput ?? call.input;
  });
}
