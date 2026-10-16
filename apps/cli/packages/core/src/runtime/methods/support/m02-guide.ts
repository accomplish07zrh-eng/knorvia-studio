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
  return runtime.drainPendingInput({ activeTurn: slot, events: state.events, traceContext: state.turnTraceContext });
}

function rememberDrained(state: RegularTurnLoopState, drained: DrainedPendingInputDiagnostics): void {
  state.drainedSteerForNextRequest = drained;
  const carried = drained.runtimeEntries ?? [];
  appendTurnRequestEntries(state.turnRequestState, carried);
}

async function applyGuideIntent(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, drained: DrainedPendingInputDiagnostics): Promise<void> {
  const locked = state.modelSelectionScope === "execution";
  if (locked) {
    if (drained.intent === undefined) return;
    await applyRuntimeExecutionState(runtime, drained.intent, { source: "command", traceContext: state.turnTraceContext });
    return;
  }
  const chosen = await applySubmissionExecutionState(runtime, drained.intent, state.turnTraceContext);
  if (chosen === undefined) return;
  const changed = sameModelSelection(state.model, chosen) === false;
  state.model = chosen;
  if (!changed) return;
  const rebuilt = rebuildContextPrefix(runtime, { model: chosen, turnRequestEntries: state.turnRequestState.entries });
  state.turnRequestState.entries = rebuilt;
}

function adoptGuideIdentity(state: RegularTurnLoopState, drained: DrainedPendingInputDiagnostics): void {
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
  state.repeatedToolCallSignature = undefined;
  state.repeatedToolCallStreakCount = 0 * 1;
}

export async function drainInlineGuideForNextRequest(runtime: AgentRuntimeInternal, state: RegularTurnLoopState): Promise<boolean> {
  const drained = await pullInlineGuide(runtime, state);
  if (drained === undefined || drained.pendingInputIds.length === 0) return false;
  rememberDrained(state, drained);
  await applyGuideIntent(runtime, state, drained);
  adoptGuideIdentity(state, drained);
  resetRepeatMemory(state);
  return true;
}
