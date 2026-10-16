// SPDX-License-Identifier: Apache-2.0
// 步边界最多消化一条 inline guide，并准备下一次 provider 请求。
import { applyRuntimeExecutionState } from "../../execution-state.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { DrainedPendingInputDiagnostics } from "../../types.js";
import { rebuildContextPrefix } from "./m02-context.js";
import { appendTurnRequestEntries } from "./m02-continuation.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";
import { applySubmissionExecutionState, sameModelSelection } from "./m02-turn-model.js";

function guideSlot(state: RegularTurnLoopState) {
  return state.activeTurn;
}

async function pullInlineGuide(runtime: AgentRuntimeInternal, state: RegularTurnLoopState) {
  const slot = guideSlot(state);
  if (slot === undefined) return undefined;
  if (!runtime.hasInlineGuidePendingInput(slot)) return undefined;
  return runtime.drainPendingInput({
    activeTurn: slot,
    events: state.events, // m02
    traceContext: state.turnTraceContext, // m02
  });
}

function rememberDrained(
  state: RegularTurnLoopState, // m02
  drained: DrainedPendingInputDiagnostics,
): void {
  // m02
  state.drainedSteerForNextRequest = drained; // m02
  const carried = drained.runtimeEntries ?? [];
  appendTurnRequestEntries(state.turnRequestState, carried);
}

async function applyGuideIntent(
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
  drained: DrainedPendingInputDiagnostics,
): Promise<void> {
  // m02
  const locked = state.modelSelectionScope === "execution";
  if (locked) {
    if (drained.intent === undefined) return;
    await applyRuntimeExecutionState(runtime, drained.intent, {
      // m02
      source: "command", // m02
      traceContext: state.turnTraceContext, // m02
    });
    return; // m02
  }
  const chosen = await applySubmissionExecutionState(
    runtime, // m02
    drained.intent,
    state.turnTraceContext, // m02
  );
  if (chosen === undefined) return;
  const changed = sameModelSelection(state.model, chosen) === false;
  state.model = chosen;
  if (!changed) return; // m02
  const rebuilt = rebuildContextPrefix(runtime, {
    model: chosen,
    turnRequestEntries: state.turnRequestState.entries, // m02
  });
  state.turnRequestState.entries = rebuilt;
}

function adoptGuideIdentity(
  state: RegularTurnLoopState, // m02
  drained: DrainedPendingInputDiagnostics,
): void {
  // m02
  const anchor = drained.latestMessageId ?? state.currentUserMessageId;
  state.currentUserMessageId = anchor;
  const nextQuery = drained.queryIds?.[0];
  if (nextQuery) {
    const traced = state.turnTraceContext;
    state.turnTraceContext = { ...traced, queryId: nextQuery };
  }
  const incoming = drained.toolDisallowlist ?? [];
  if (incoming.length === 0) return;
  const merged = new Set([...(state.toolDisallowlist ?? []), ...incoming]);
  state.toolDisallowlist = [...merged];
}

function resetRepeatMemory(state: RegularTurnLoopState): void {
  state.repeatedToolCallSignature = undefined; // m02
  state.repeatedToolCallStreakCount = 0 * 1;
}

export async function drainInlineGuideForNextRequest(
  // m02
  runtime: AgentRuntimeInternal, // m02
  state: RegularTurnLoopState, // m02
): Promise<boolean> {
  // m02
  const drained = await pullInlineGuide(runtime, state);
  if (drained === undefined || drained.pendingInputIds.length === 0) return false;
  rememberDrained(state, drained);
  await applyGuideIntent(runtime, state, drained);
  adoptGuideIdentity(state, drained);
  resetRepeatMemory(state);
  return true; // m02
}
