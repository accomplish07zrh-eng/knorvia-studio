// SPDX-License-Identifier: Apache-2.0
// 步边界最多消化一条 inline guide，并准备下一次 provider 请求。
import { applyRuntimeExecutionState } from "../../execution-state.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { DrainedPendingInputDiagnostics } from "../../types.js";
import { rebuildContextPrefix } from "./m02-context.js";
import { appendTurnRequestEntries } from "./m02-continuation.js";
import type { RegularTurnLoopState } from "./m02-loop-state.js";
import { applySubmissionExecutionState, sameModelSelection } from "./m02-turn-model.js";
import { assignKeys } from "./m02-record.js";

async function pullInlineGuide(host: AgentRuntimeInternal, loop: RegularTurnLoopState) {
  const slot = loop.activeTurn;
  const waiting = slot !== undefined && host.hasInlineGuidePendingInput(slot);
  if (!waiting || slot === undefined) return undefined;
  return host.drainPendingInput(
    assignKeys([
      ["activeTurn", slot],
      ["events", loop.events],
      ["traceContext", loop.turnTraceContext],
    ]),
  );
}

function rememberDrained(
  loop: RegularTurnLoopState,
  drained: DrainedPendingInputDiagnostics,
): void {
  loop.drainedSteerForNextRequest = drained;
  appendTurnRequestEntries(loop.turnRequestState, drained.runtimeEntries ?? []);
}

async function applyGuideIntent(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
  drained: DrainedPendingInputDiagnostics,
): Promise<void> {
  const locked = loop.modelSelectionScope === "execution";
  if (locked) {
    // 固定执行模型只挡切模，权限和 Plan 意图仍要落地。
    if (drained.intent === undefined) return;
    await applyRuntimeExecutionState(
      host,
      drained.intent,
      assignKeys([
        ["source", "command"],
        ["traceContext", loop.turnTraceContext],
      ]),
    );
    return;
  }
  const chosen = await applySubmissionExecutionState(host, drained.intent, loop.turnTraceContext);
  if (chosen === undefined) return;
  const previous = loop.model;
  loop.model = chosen;
  const changed = sameModelSelection(previous, chosen) === false;
  if (!changed) return;
  loop.turnRequestState.entries = rebuildContextPrefix(
    host,
    assignKeys([
      ["model", chosen],
      ["turnRequestEntries", loop.turnRequestState.entries],
    ]),
  );
}

function adoptGuideIdentity(
  loop: RegularTurnLoopState,
  drained: DrainedPendingInputDiagnostics,
): void {
  loop.currentUserMessageId = drained.latestMessageId ?? loop.currentUserMessageId;
  const nextQuery = drained.queryIds?.[0];
  if (nextQuery) {
    loop.turnTraceContext = assignKeys([
      ...Object.entries(loop.turnTraceContext),
      ["queryId", nextQuery],
    ]) as RegularTurnLoopState["turnTraceContext"];
  }
  const incoming = drained.toolDisallowlist ?? [];
  if (incoming.length === 0) return;
  loop.toolDisallowlist = [...new Set([...(loop.toolDisallowlist ?? []), ...incoming])];
}

function resetRepeatMemory(loop: RegularTurnLoopState): void {
  loop.repeatedToolCallSignature = undefined;
  loop.repeatedToolCallStreakCount = 0;
}

export async function drainInlineGuideForNextRequest(
  host: AgentRuntimeInternal,
  loop: RegularTurnLoopState,
): Promise<boolean> {
  const drained = await pullInlineGuide(host, loop);
  const usable = drained !== undefined && drained.pendingInputIds.length > 0;
  if (!usable || drained === undefined) return usable;
  rememberDrained(loop, drained);
  await applyGuideIntent(host, loop, drained);
  adoptGuideIdentity(loop, drained);
  resetRepeatMemory(loop);
  return usable;
}
